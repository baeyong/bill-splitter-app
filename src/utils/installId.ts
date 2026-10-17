import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

// Before the weekly limit, the id lived in AsyncStorage, which a reinstall
// wipes. It's read once from there and moved to the Keychain.
const LEGACY_KEY = 'bill-splitter:install-id:v1';
const KEYCHAIN_KEY = 'install-id';

let cached: string | null = null;

const readKeychain = async (): Promise<string | null> => {
  try {
    return await SecureStore.getItemAsync(KEYCHAIN_KEY);
  } catch {
    return null;
  }
};

/**
 * A random id for this phone, sent with each scan so the scan server can apply
 * its weekly per-phone limit. Kept in the iOS Keychain so deleting and
 * reinstalling the app doesn't reset the limit. Not tied to the person, their
 * Apple ID or the device's identifiers, and never used for anything else.
 */
export const getInstallId = async (): Promise<string> => {
  if (cached) return cached;

  const stored = await readKeychain();
  if (stored) return (cached = stored);

  let id: string | null = null;
  try {
    id = await AsyncStorage.getItem(LEGACY_KEY);
  } catch {
    // Fall through and make a fresh one.
  }
  if (!id) {
    const random = () => Math.random().toString(36).slice(2, 10).padEnd(8, '0');
    id = `${Date.now().toString(36)}-${random()}${random()}`;
  }
  cached = id;
  // Only drop the old copy once the Keychain has it, so a failed write can't
  // hand out a new id (and a fresh week) on the next launch.
  SecureStore.setItemAsync(KEYCHAIN_KEY, id)
    .then(() => AsyncStorage.removeItem(LEGACY_KEY))
    .catch(() => {});
  return id;
};

/** For tests: forget the in-memory copy. */
export const resetInstallIdCache = () => {
  cached = null;
};
