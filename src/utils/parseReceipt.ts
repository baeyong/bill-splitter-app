import Anthropic from '@anthropic-ai/sdk';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { ScanErrorKind, ScanResult, ScannedItem } from '../types/scan';

// Haiku is ~30–40x cheaper per scan than Opus, and reading printed text is the
// high-volume extraction work it's built for. The user still checks every line
// on AssignItems, and All items flags a total that doesn't match the receipt.
const MODEL = 'claude-haiku-5-5';

// Reading printed text off a receipt is extraction, not reasoning — low effort
// keeps the scan quick and cheap. Raise it (Haiku's default is medium) before
// reaching for a bigger model if receipts start misreading.
const EFFORT = 'low';

// Receipts are tall and narrow; 1400px on the long edge keeps small print
// legible while cutting a 12MP camera shot down to a few hundred KB.
const MAX_WIDTH = 1400;
const JPEG_QUALITY = 0.7;

const REQUEST_TIMEOUT_MS = 60_000;

// Matches the quantity stepper's cap on the manual item screens.
const MAX_QUANTITY = 20;

export class ReceiptScanError extends Error {
  kind: ScanErrorKind;

  constructor(kind: ScanErrorKind, message: string) {
    super(message);
    this.name = 'ReceiptScanError';
    this.kind = kind;
  }
}

// Structured outputs require `additionalProperties: false` on every object.
const RECEIPT_SCHEMA = {
  type: 'object',
  properties: {
    restaurantName: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          price: { type: 'number' },
          quantity: { type: 'integer' },
        },
        required: ['name', 'price', 'quantity'],
        additionalProperties: false,
      },
    },
    subtotal: { type: 'number' },
    tax: { type: 'number' },
    tip: { type: 'number' },
    total: { type: 'number' },
  },
  required: ['items'],
  additionalProperties: false,
};

const PROMPT = `You are reading a photo of a restaurant receipt. Extract every ordered line item.

Rules:
- "price" is the price of ONE unit, never the line total. A line reading "2 TACOS 9.00" is quantity 2 at price 4.50.
- "quantity" is how many were ordered on that line. Use 1 when the receipt does not say.
- Include food, drinks, sides, and any add-on or modifier that carries its own charge (as its own item).
- Do NOT put subtotal, tax, tip, gratuity, service charge, or the grand total in "items". Report those in their own top-level fields.
- "subtotal" is the item total AFTER comps and item discounts, BEFORE whole-bill discounts, tax, and tip. If the receipt prints its subtotal above the comp or discount lines, subtract those lines from it.
- "tip" covers any tip, gratuity, auto-gratuity, or service charge. If there is more than one, add them together.
- Comped items ("on the house", "comp", "void", 100% off): still include the item, with price 0 and " (on the house)" added to its name. If only some units of a line are comped, split it: the paid units as one item, the comped units as a separate "(on the house)" item at price 0.
- A discount or negative line that applies to one specific item: subtract it from that item instead of listing it separately. "2 BEER 12.00" followed by "HAPPY HOUR -6.00" is quantity 2 at price 3.00.
- A discount on the whole bill (percent off the total, coupon, promo code) is not an item: leave it out of "items".
- Omit "tip" entirely if there is no tip, gratuity, or service charge, or the tip line is blank, dashed, or unfilled.
- Use the item name exactly as printed, minus any leading quantity digits and trailing dot leaders.
- Money values are plain numbers with no currency symbol.
- If the photo is too blurry or is not a receipt, return an empty "items" array.`;

const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Shrink + JPEG-compress so the upload is fast and well under the 5MB image cap. */
const toBase64Jpeg = async (uri: string): Promise<string> => {
  const rendered = await ImageManipulator.manipulate(uri)
    .resize({ width: MAX_WIDTH })
    .renderAsync();
  const saved = await rendered.saveAsync({
    base64: true,
    compress: JPEG_QUALITY,
    format: SaveFormat.JPEG,
  });
  if (!saved.base64) {
    throw new ReceiptScanError('parse', 'Could not read that image file.');
  }
  return saved.base64;
};

const asPositiveNumber = (value: unknown): number | undefined => {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (typeof n !== 'number' || !isFinite(n) || n < 0) return undefined;
  return Math.round(n * 100) / 100;
};

const toScannedItems = (raw: unknown): ScannedItem[] => {
  if (!Array.isArray(raw)) return [];
  const out: ScannedItem[] = [];

  for (const entry of raw) {
    const name = typeof entry?.name === 'string' ? entry.name.trim() : '';
    const price = asPositiveNumber(entry?.price);
    if (!name || price === undefined) continue;

    const rawQty = typeof entry?.quantity === 'number' ? Math.floor(entry.quantity) : 1;
    const quantity = Math.max(1, Math.min(MAX_QUANTITY, isFinite(rawQty) ? rawQty : 1));

    out.push({ id: genId(), name, price, quantity });
  }

  return out;
};

const toScanError = (err: unknown): ReceiptScanError => {
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return new ReceiptScanError('network', 'The scan timed out. Check your connection and try again.');
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new ReceiptScanError('network', 'Could not reach the scanning service. Check your connection.');
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new ReceiptScanError('config', 'The Anthropic API key was rejected. Check that it is valid.');
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new ReceiptScanError('api', "You've hit the API rate limit. Wait a minute and try again.");
  }
  if (err instanceof Anthropic.APIError) {
    return new ReceiptScanError(
      'api',
      `Scanning failed (HTTP ${err.status}). ${err.message.slice(0, 160)}`.trim(),
    );
  }
  return new ReceiptScanError('api', 'Scanning failed unexpectedly. Try again.');
};

/**
 * Send a receipt photo to Claude and get back its line items.
 *
 * Note this uploads the photo to Anthropic — it is the one part of the app that
 * leaves the device.
 */
export const parseReceipt = async (imageUri: string): Promise<ScanResult> => {
  const apiKey = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ReceiptScanError(
      'config',
      'No Anthropic API key found. Add EXPO_PUBLIC_ANTHROPIC_API_KEY to .env.local and restart the dev server.',
    );
  }

  const base64 = await toBase64Jpeg(imageUri);

  // One retry covers a transient 429/529 without letting a slow scan run on
  // for minutes.
  const client = new Anthropic({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 });

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      output_config: {
        effort: EFFORT,
        format: { type: 'json_schema', schema: RECEIPT_SCHEMA },
      },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    });
  } catch (err) {
    throw toScanError(err);
  }

  // Haiku has no server-side refusal fallback; a safety-classifier decline on a
  // receipt should be very rare, so it's surfaced as a retryable error.
  if (response.stop_reason === 'refusal') {
    throw new ReceiptScanError('api', "The scanning service declined that photo. Try another shot.");
  }
  if (response.stop_reason === 'max_tokens') {
    throw new ReceiptScanError('parse', 'That receipt was too long to read in one go.');
  }

  const outputText = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === 'text',
  )?.text;
  if (!outputText) {
    throw new ReceiptScanError('parse', 'Got an unexpected response from the scanning service.');
  }

  let parsed: any;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw new ReceiptScanError('parse', "Couldn't make sense of the scan result.");
  }

  const items = toScannedItems(parsed?.items);
  if (items.length === 0) {
    throw new ReceiptScanError(
      'empty',
      "No items found on that photo. Try again with the whole receipt in frame and the text in focus.",
    );
  }

  const restaurantName =
    typeof parsed?.restaurantName === 'string' && parsed.restaurantName.trim()
      ? parsed.restaurantName.trim()
      : undefined;

  return {
    restaurantName,
    items,
    subtotal: asPositiveNumber(parsed?.subtotal),
    tax: asPositiveNumber(parsed?.tax),
    tip: asPositiveNumber(parsed?.tip),
    total: asPositiveNumber(parsed?.total),
  };
};
