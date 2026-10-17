// The scan limits, as pure logic so they can be tested without Cloudflare.
// The counts themselves live in the Quota Durable Object. A phone's allowance
// is weekly; the two backstops (per IP, everyone) stay daily so a burst can't
// spend a week's ceiling in one day.

export type Limits = {
  /** Scans one install (one phone) may make per week (Monday to Monday, UTC). */
  perDevice: number;
  /** Scans one IP address may make per day — backstop for faked install ids. */
  perIp: number;
  /** Scans across everyone per day — the hard ceiling on spend. */
  global: number;
};

export type Counts = { device: number; ip: number; global: number };

export type Decision = { ok: true } | { ok: false; reason: 'device' | 'ip' | 'global' };

/** Whether one more scan fits. The global ceiling is checked first. */
export const decide = (counts: Counts, limits: Limits): Decision => {
  if (counts.global >= limits.global) return { ok: false, reason: 'global' };
  if (counts.device >= limits.perDevice) return { ok: false, reason: 'device' };
  if (counts.ip >= limits.perIp) return { ok: false, reason: 'ip' };
  return { ok: true };
};

/** "2026-10-14" — counters reset at midnight UTC. */
export const dayKey = (now: Date): string => now.toISOString().slice(0, 10);

/** The Monday (UTC) that starts `now`'s week, e.g. "2026-10-12" — phones' allowances reset then. */
export const weekKey = (now: Date): string => {
  const daysSinceMonday = (now.getUTCDay() + 6) % 7;
  return dayKey(new Date(now.getTime() - daysSinceMonday * 86_400_000));
};

/** Scans a phone has left this week once `used` have been counted. */
export const scansLeft = (used: number, limits: Limits): number => Math.max(0, limits.perDevice - used);

/** Reads a numeric limit from an env var, falling back when it's missing or junk. */
export const limitFrom = (value: string | undefined, fallback: number): number => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
};
