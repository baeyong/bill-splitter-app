import { describe, expect, it } from 'vitest';
import { dayKey, decide, limitFrom, scansLeft, weekKey } from './limits';

const limits = { perDevice: 10, perIp: 40, global: 300 };

describe('decide', () => {
  it('allows a scan under every limit', () => {
    expect(decide({ device: 0, ip: 0, global: 0 }, limits)).toEqual({ ok: true });
    expect(decide({ device: 9, ip: 39, global: 299 }, limits)).toEqual({ ok: true });
  });

  it("stops a phone at its weekly limit", () => {
    expect(decide({ device: 10, ip: 20, global: 100 }, limits)).toEqual({ ok: false, reason: 'device' });
  });

  it('stops a connection that rotates install ids', () => {
    expect(decide({ device: 0, ip: 40, global: 100 }, limits)).toEqual({ ok: false, reason: 'ip' });
  });

  it('the global ceiling wins over everything — it caps spend', () => {
    expect(decide({ device: 0, ip: 0, global: 300 }, limits)).toEqual({ ok: false, reason: 'global' });
  });

  it('a limit of 0 turns scanning off', () => {
    expect(decide({ device: 0, ip: 0, global: 0 }, { ...limits, global: 0 })).toEqual({
      ok: false,
      reason: 'global',
    });
  });
});

describe('dayKey', () => {
  it('rolls over at midnight UTC', () => {
    expect(dayKey(new Date('2026-10-14T23:59:59Z'))).toBe('2026-10-14');
    expect(dayKey(new Date('2026-10-15T00:00:00Z'))).toBe('2026-10-15');
  });
});

describe('weekKey', () => {
  it('names the Monday that starts the week, in UTC', () => {
    // 2026-10-12 is a Monday.
    expect(weekKey(new Date('2026-10-12T00:00:00Z'))).toBe('2026-10-12');
    expect(weekKey(new Date('2026-10-14T12:00:00Z'))).toBe('2026-10-12');
    expect(weekKey(new Date('2026-10-18T23:59:59Z'))).toBe('2026-10-12'); // Sunday night
    expect(weekKey(new Date('2026-10-19T00:00:00Z'))).toBe('2026-10-19');
  });

  it('crosses month and year boundaries', () => {
    expect(weekKey(new Date('2026-11-01T10:00:00Z'))).toBe('2026-10-26'); // a Sunday
    expect(weekKey(new Date('2027-01-01T10:00:00Z'))).toBe('2026-12-28'); // a Friday
  });
});

describe('scansLeft', () => {
  it('counts down and never goes below zero', () => {
    expect(scansLeft(0, limits)).toBe(10);
    expect(scansLeft(3, limits)).toBe(7);
    expect(scansLeft(10, limits)).toBe(0);
    expect(scansLeft(12, { ...limits, perDevice: 10 })).toBe(0);
  });
});

describe('limitFrom', () => {
  it('reads whole numbers and falls back on anything else', () => {
    expect(limitFrom('25', 20)).toBe(25);
    expect(limitFrom('0', 20)).toBe(0);
    expect(limitFrom(undefined, 20)).toBe(20);
    expect(limitFrom('lots', 20)).toBe(20);
    expect(limitFrom('-5', 20)).toBe(20);
    expect(limitFrom('2.5', 20)).toBe(20);
  });
});
