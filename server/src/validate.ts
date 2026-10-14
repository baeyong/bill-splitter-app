// Checks a scan request before anything is spent on it.

/** The app's random per-install id: letters, digits and dashes. */
const INSTALL_ID = /^[A-Za-z0-9-]{8,64}$/;
/** Base64 only — rejects data: URIs and anything that isn't an encoded image. */
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export type ScanRequest = { installId: string; image: string };

export type Validation =
  | { ok: true; request: ScanRequest }
  | { ok: false; status: number; error: string };

export const validateScan = (
  installId: string | null,
  body: unknown,
  maxImageBytes: number,
): Validation => {
  if (!installId || !INSTALL_ID.test(installId)) {
    return { ok: false, status: 400, error: 'missing_install_id' };
  }
  const image = (body as { image?: unknown } | null)?.image;
  if (typeof image !== 'string' || image.length === 0) {
    return { ok: false, status: 400, error: 'missing_image' };
  }
  // Base64 is 4 characters per 3 bytes.
  if ((image.length * 3) / 4 > maxImageBytes) {
    return { ok: false, status: 413, error: 'image_too_large' };
  }
  if (!BASE64.test(image)) {
    return { ok: false, status: 400, error: 'bad_image' };
  }
  return { ok: true, request: { installId, image } };
};
