import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { ScanErrorKind, ScanResult, ScannedItem } from '../types/scan';

// Gemini's "interactions" endpoint. Flash models are the free-tier ones —
// check your project's actual limits at https://aistudio.google.com/rate-limit
//
// Request shape follows the current docs' curl examples, which send no
// API-Revision header. If this ever starts 400ing on a shape mismatch, pinning
// one (`'API-Revision': '<date>'`) is the first thing to try.
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const MODEL = 'gemini-3.8-flash';

// Receipts are tall and narrow; 1400px on the long edge keeps small print
// legible while cutting a 12MP camera shot down to a few hundred KB.
const MAX_WIDTH = 1400;
const JPEG_QUALITY = 0.7;

const REQUEST_TIMEOUT_MS = 45_000;

// Quantity is expanded into repeated items client-side, so a single line can be
// split across people (two beers, one each).
const MAX_QUANTITY = 20;

export class ReceiptScanError extends Error {
  kind: ScanErrorKind;

  constructor(kind: ScanErrorKind, message: string) {
    super(message);
    this.name = 'ReceiptScanError';
    this.kind = kind;
  }
}

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
      },
    },
    subtotal: { type: 'number' },
    tax: { type: 'number' },
    tip: { type: 'number' },
    total: { type: 'number' },
  },
  required: ['items'],
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

/** Shrink + JPEG-compress so the upload is fast and well under the 20MB cap. */
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

/**
 * The interactions API returns the model's JSON as a string on
 * `interaction.output_text`. The surface is young, so fall back to digging the
 * first text-ish field out of the payload rather than hard-failing on a rename.
 */
const extractOutputText = (payload: unknown): string | null => {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as Record<string, any>;

  const direct = root.interaction?.output_text ?? root.output_text;
  if (typeof direct === 'string' && direct.trim()) return direct;

  const fromOutput = root.interaction?.output ?? root.output;
  if (Array.isArray(fromOutput)) {
    for (const entry of fromOutput) {
      const content = entry?.content;
      if (typeof content === 'string' && content.trim()) return content;
      if (Array.isArray(content)) {
        const text = content.find((c: any) => typeof c?.text === 'string')?.text;
        if (text?.trim()) return text;
      }
      if (typeof entry?.text === 'string' && entry.text.trim()) return entry.text;
    }
  }

  return null;
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
    const qty = Math.max(1, Math.min(MAX_QUANTITY, isFinite(rawQty) ? rawQty : 1));

    for (let i = 0; i < qty; i++) {
      out.push({ id: genId(), name, price });
    }
  }

  return out;
};

/**
 * Send a receipt photo to Gemini and get back its line items.
 *
 * Note this uploads the photo to Google — it is the one part of the app that
 * leaves the device.
 */
export const parseReceipt = async (imageUri: string): Promise<ScanResult> => {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) {
    throw new ReceiptScanError(
      'config',
      'No Gemini API key found. Add EXPO_PUBLIC_GEMINI_API_KEY to .env.local and restart the dev server.',
    );
  }

  const base64 = await toBase64Jpeg(imageUri);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        input: [
          { type: 'text', text: PROMPT },
          { type: 'image', data: base64, mime_type: 'image/jpeg' },
        ],
        response_format: {
          type: 'text',
          mime_type: 'application/json',
          schema: RECEIPT_SCHEMA,
        },
      }),
    });
  } catch (err: any) {
    throw new ReceiptScanError(
      'network',
      err?.name === 'AbortError'
        ? 'The scan timed out. Check your connection and try again.'
        : 'Could not reach the scanning service. Check your connection.',
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    if (response.status === 401 || response.status === 403) {
      throw new ReceiptScanError('config', 'The Gemini API key was rejected. Check that it is valid.');
    }
    if (response.status === 429) {
      throw new ReceiptScanError('api', "You've hit the free-tier rate limit. Wait a minute and try again.");
    }
    throw new ReceiptScanError(
      'api',
      `Scanning failed (HTTP ${response.status}). ${body.slice(0, 160)}`.trim(),
    );
  }

  const payload = await response.json().catch(() => null);
  const outputText = extractOutputText(payload);
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
