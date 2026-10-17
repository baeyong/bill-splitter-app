import { ScanErrorKind } from '../types/scan';

export class ReceiptScanError extends Error {
  kind: ScanErrorKind;

  constructor(kind: ScanErrorKind, message: string) {
    super(message);
    this.name = 'ReceiptScanError';
    this.kind = kind;
  }
}

/**
 * Turns a failed response from the scan server (server/src/index.ts) into what
 * the scan screen shows. Status codes and error names are that server's
 * contract.
 */
export const scanErrorFor = (status: number, body: unknown): ReceiptScanError => {
  const error = (body as { error?: unknown } | null)?.error;
  const reason = (body as { reason?: unknown } | null)?.reason;

  if (status === 429 && error === 'limit') {
    const limit = (body as { scanLimit?: unknown } | null)?.scanLimit;
    const scans = typeof limit === 'number' ? `${limit} scans` : 'scans';
    return new ReceiptScanError(
      'limit',
      reason === 'global'
        ? 'Scanning is taking a break for today. Try again tomorrow, or add the items by hand.'
        : reason === 'ip'
          ? 'Too many scans from this internet connection today. Try again tomorrow, or add the items by hand.'
          : `You've used this week's ${scans}. They reset on Monday — until then, add the items by hand.`,
    );
  }
  if (status === 413) {
    return new ReceiptScanError('parse', 'That photo is too large to send. Try taking it again.');
  }
  if (error === 'refused') {
    return new ReceiptScanError('api', 'The scanning service declined that photo. Try another shot.');
  }
  if (error === 'too_long') {
    return new ReceiptScanError('parse', 'That receipt was too long to read in one go.');
  }
  if (status === 503) {
    return new ReceiptScanError('api', 'Scanning is busy right now. Wait a minute and try again.');
  }
  if (status === 504) {
    return new ReceiptScanError('network', 'The scan timed out. Check your connection and try again.');
  }
  if (error === 'server_misconfigured') {
    return new ReceiptScanError('config', "Scanning isn't working right now. Add the items by hand for now.");
  }
  return new ReceiptScanError('api', `Scanning failed (${status}). Try again.`);
};
