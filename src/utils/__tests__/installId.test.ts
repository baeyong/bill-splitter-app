import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { getInstallId, resetInstallIdCache } from '../installId';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockKeychain = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => mockKeychain.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => void mockKeychain.set(k, v)),
}));

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
  mockKeychain.clear();
  await AsyncStorage.clear();
  resetInstallIdCache();
});

describe('install id', () => {
  it('is the same across launches', async () => {
    const first = await getInstallId();
    await flush();
    resetInstallIdCache();
    expect(await getInstallId()).toBe(first);
  });

  it('survives a reinstall, because it lives in the Keychain', async () => {
    const first = await getInstallId();
    await flush();
    await AsyncStorage.clear(); // deleting the app wipes app storage, not the Keychain
    resetInstallIdCache();
    expect(await getInstallId()).toBe(first);
  });

  it("moves an older install's id over instead of starting a fresh week", async () => {
    await AsyncStorage.setItem('bill-splitter:install-id:v1', 'old-id');
    expect(await getInstallId()).toBe('old-id');
    await flush();
    expect(mockKeychain.get('install-id')).toBe('old-id');
    expect(await AsyncStorage.getItem('bill-splitter:install-id:v1')).toBeNull();
  });

  it('keeps the old copy if the Keychain write fails', async () => {
    (SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(new Error('locked'));
    await AsyncStorage.setItem('bill-splitter:install-id:v1', 'old-id');
    await getInstallId();
    await flush();
    expect(await AsyncStorage.getItem('bill-splitter:install-id:v1')).toBe('old-id');
  });
});
