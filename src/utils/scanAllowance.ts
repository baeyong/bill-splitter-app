import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

// How many scans this phone has left this week, as last reported by the scan
// server (server/src/limits.ts). The server is the authority; this copy only
// lets ScanReceipt say "7 of 10 scans left this week" before the next scan.
const ALLOWANCE_KEY = 'bill-splitter:scan-allowance:v1';

/** Until the server has answered once, assume its default. */
export const DEFAULT_WEEKLY_SCANS = 10;

export type ScanAllowance = { left: number; limit: number };

type Stored = ScanAllowance & { week: string };

/** The Monday (UTC) that starts `now`'s week — same rule as the server's weekKey. */
export const weekKey = (now: Date): string => {
  const daysSinceMonday = (now.getUTCDay() + 6) % 7;
  return new Date(now.getTime() - daysSinceMonday * 86_400_000).toISOString().slice(0, 10);
};

/** A stored count from an earlier week means the allowance has reset. */
export const currentAllowance = (stored: Stored | null, now: Date): ScanAllowance => {
  if (!stored || stored.week !== weekKey(now)) {
    const limit = stored?.limit ?? DEFAULT_WEEKLY_SCANS;
    return { left: limit, limit };
  }
  return { left: stored.left, limit: stored.limit };
};

/** Reads `scansLeft` / `scanLimit` off any scan-server reply, if it has them. */
export const allowanceFrom = (body: unknown): ScanAllowance | null => {
  const left = (body as { scansLeft?: unknown } | null)?.scansLeft;
  const limit = (body as { scanLimit?: unknown } | null)?.scanLimit;
  if (typeof left !== 'number' || typeof limit !== 'number') return null;
  if (!Number.isInteger(left) || !Number.isInteger(limit) || left < 0 || limit < 0) return null;
  return { left: Math.min(left, limit), limit };
};

let cached: Stored | null | undefined;
const listeners = new Set<(a: ScanAllowance) => void>();

const load = async (): Promise<Stored | null> => {
  if (cached !== undefined) return cached;
  try {
    const raw = await AsyncStorage.getItem(ALLOWANCE_KEY);
    cached = raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    cached = null;
  }
  return cached;
};

export const saveAllowance = async (allowance: ScanAllowance, now = new Date()): Promise<void> => {
  cached = { ...allowance, week: weekKey(now) };
  listeners.forEach((l) => l(allowance));
  try {
    await AsyncStorage.setItem(ALLOWANCE_KEY, JSON.stringify(cached));
  } catch {
    // Only the display is affected; the server still enforces the limit.
  }
};

export const loadAllowance = async (now = new Date()): Promise<ScanAllowance> =>
  currentAllowance(await load(), now);

/** The current allowance, kept in sync with every scan. `null` while loading. */
export const useScanAllowance = (): ScanAllowance | null => {
  const [allowance, setAllowance] = useState<ScanAllowance | null>(
    cached === undefined ? null : currentAllowance(cached, new Date()),
  );
  useEffect(() => {
    let alive = true;
    loadAllowance().then((a) => alive && setAllowance(a));
    listeners.add(setAllowance);
    return () => {
      alive = false;
      listeners.delete(setAllowance);
    };
  }, []);
  return allowance;
};

/** For tests: forget the in-memory copy so the next load reads storage. */
export const resetAllowanceCache = () => {
  cached = undefined;
};
