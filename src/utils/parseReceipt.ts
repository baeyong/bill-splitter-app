import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { ScanResult, ScannedItem } from '../types/scan';
import { fitWidth } from './imageFit';
import { getInstallId } from './installId';
import { ReceiptScanError, scanErrorFor } from './scanErrors';

export { ReceiptScanError } from './scanErrors';

const JPEG_QUALITY = 0.7;

// A little over the server's own 60s timeout to Anthropic, so its answer wins.
const REQUEST_TIMEOUT_MS = 70_000;

// Matches the quantity stepper's cap on the manual item screens.
const MAX_QUANTITY = 20;

const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Shrink to the largest size Claude reads at full detail (see imageFit.ts) and
 * JPEG-compress. A 12MP photo comes out ~1680×2240 and a few hundred KB.
 * Never enlarges; resizing by width alone keeps the aspect ratio.
 */
const toBase64Jpeg = async (uri: string): Promise<string> => {
  const original = await ImageManipulator.manipulate(uri).renderAsync();
  const width = fitWidth(original.width, original.height);
  const rendered =
    width < original.width
      ? await ImageManipulator.manipulate(original).resize({ width }).renderAsync()
      : original;
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

/** POSTs the photo to the scan server and returns the receipt it read. */
const requestScan = async (base64: string): Promise<any> => {
  const base = process.env.EXPO_PUBLIC_SCAN_URL;
  if (!base) {
    throw new ReceiptScanError(
      'config',
      'Scanning isn\'t set up. Add EXPO_PUBLIC_SCAN_URL to .env.local and restart the dev server.',
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${base.replace(/\/+$/, '')}/scan`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-install-id': await getInstallId() },
      body: JSON.stringify({ image: base64 }),
      signal: controller.signal,
    });
  } catch (err) {
    throw controller.signal.aborted
      ? new ReceiptScanError('network', 'The scan timed out. Check your connection and try again.')
      : new ReceiptScanError('network', 'Could not reach the scanning service. Check your connection.');
  } finally {
    clearTimeout(timer);
  }

  let body: any = null;
  try {
    body = await res.json();
  } catch {
    // Handled below: a non-JSON reply is a failed scan either way.
  }
  if (!res.ok) throw scanErrorFor(res.status, body);
  if (!body || typeof body !== 'object' || !('receipt' in body)) {
    throw new ReceiptScanError('parse', 'Got an unexpected response from the scanning service.');
  }
  return body.receipt;
};

/**
 * Send a receipt photo to the scan server, which has Claude read it, and get
 * back its line items.
 *
 * The photo goes to the app's scan server (server/) and on to Anthropic — it
 * is the one part of the app that leaves the device. The API key lives only on
 * that server.
 */
export const parseReceipt = async (imageUri: string): Promise<ScanResult> => {
  const base64 = await toBase64Jpeg(imageUri);
  const parsed = await requestScan(base64);

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
