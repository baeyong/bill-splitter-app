import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_WEEKLY_SCANS,
  allowanceFrom,
  currentAllowance,
  loadAllowance,
  resetAllowanceCache,
  saveAllowance,
  weekKey,
} from '../scanAllowance';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

beforeEach(async () => {
  await AsyncStorage.clear();
  resetAllowanceCache();
});

// 2026-10-12 is a Monday.
const wednesday = new Date('2026-10-14T12:00:00Z');
const nextMonday = new Date('2026-10-19T00:00:00Z');

describe('weekKey', () => {
  it('matches the server: weeks start Monday 00:00 UTC', () => {
    expect(weekKey(new Date('2026-10-12T00:00:00Z'))).toBe('2026-10-12');
    expect(weekKey(new Date('2026-10-18T23:59:59Z'))).toBe('2026-10-12');
    expect(weekKey(nextMonday)).toBe('2026-10-19');
  });
});

describe('allowanceFrom', () => {
  it('reads the counts off a scan-server reply', () => {
    expect(allowanceFrom({ receipt: {}, scansLeft: 7, scanLimit: 10 })).toEqual({ left: 7, limit: 10 });
  });

  it('ignores replies without them, or with nonsense', () => {
    expect(allowanceFrom({ receipt: {} })).toBeNull();
    expect(allowanceFrom(null)).toBeNull();
    expect(allowanceFrom({ scansLeft: -1, scanLimit: 10 })).toBeNull();
    expect(allowanceFrom({ scansLeft: '7', scanLimit: 10 })).toBeNull();
  });

  it('never shows more left than the limit', () => {
    expect(allowanceFrom({ scansLeft: 12, scanLimit: 10 })).toEqual({ left: 10, limit: 10 });
  });
});

describe('currentAllowance', () => {
  it('a phone that has never scanned has the full default', () => {
    expect(currentAllowance(null, wednesday)).toEqual({
      left: DEFAULT_WEEKLY_SCANS,
      limit: DEFAULT_WEEKLY_SCANS,
    });
  });

  it("keeps this week's count", () => {
    expect(currentAllowance({ left: 3, limit: 10, week: '2026-10-12' }, wednesday)).toEqual({
      left: 3,
      limit: 10,
    });
  });

  it("a count from last week has reset, using the server's limit", () => {
    expect(currentAllowance({ left: 0, limit: 15, week: '2026-10-05' }, wednesday)).toEqual({
      left: 15,
      limit: 15,
    });
  });
});

describe('saving', () => {
  it('survives a relaunch within the week, and resets the next Monday', async () => {
    await saveAllowance({ left: 4, limit: 10 }, wednesday);
    resetAllowanceCache(); // a fresh launch
    expect(await loadAllowance(wednesday)).toEqual({ left: 4, limit: 10 });
    expect(await loadAllowance(nextMonday)).toEqual({ left: 10, limit: 10 });
  });
});
