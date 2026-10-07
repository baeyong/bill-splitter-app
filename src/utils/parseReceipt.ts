import Anthropic from '@anthropic-ai/sdk';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { ScanErrorKind, ScanResult, ScannedItem } from '../types/scan';

const MODEL = 'claude-opus-5-5';

// Reading printed text off a receipt is extraction, not reasoning — low effort
// keeps the scan quick. Raise it if dense or crumpled receipts start misreading.
const EFFORT = 'low';

// If the model declines (a safety-classifier false positive), the API reruns the
// request on a fallback model inside the same call instead of failing the scan.
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

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
- Do NOT put subtotal, tax, tip, gratuity, service charge, discounts, or the grand total in "items". Report those in their own top-level fields.
- Omit "tip" entirely if the tip line is blank, dashed, or unfilled.
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

  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
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

  if (response.stop_reason === 'refusal') {
    throw new ReceiptScanError('api', "The scanning service declined that photo. Try another shot.");
  }
  if (response.stop_reason === 'max_tokens') {
    throw new ReceiptScanError('parse', 'That receipt was too long to read in one go.');
  }

  const outputText = response.content.find(
    (b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text',
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
