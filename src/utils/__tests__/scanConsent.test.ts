import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadScanConsent, resetScanConsentCache, setScanConsent } from '../scanConsent';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

beforeEach(async () => {
  await AsyncStorage.clear();
  resetScanConsentCache();
});

describe('scan consent', () => {
  it('starts as not agreed, so nothing is sent before the user says yes', async () => {
    expect(await loadScanConsent()).toBe(false);
  });

  it('remembers a yes across launches', async () => {
    await setScanConsent(true);
    resetScanConsentCache(); // a fresh launch
    expect(await loadScanConsent()).toBe(true);
  });

  it('turning it off in Settings forgets the yes', async () => {
    await setScanConsent(true);
    await setScanConsent(false);
    resetScanConsentCache();
    expect(await loadScanConsent()).toBe(false);
  });
});
