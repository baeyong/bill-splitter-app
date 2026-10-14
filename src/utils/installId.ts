import AsyncStorage from '@react-native-async-storage/async-storage';

const INSTALL_ID_KEY = 'bill-splitter:install-id:v1';

let cached: string | null = null;

/**
 * A random id for this install, sent with each scan so the scan server can
 * apply its per-phone daily limit. Not tied to the person or the device — a
 * reinstall gets a new one — and never used for anything else.
 */
export const getInstallId = async (): Promise<string> => {
  if (cached) return cached;
  try {
    const stored = await AsyncStorage.getItem(INSTALL_ID_KEY);
    if (stored) return (cached = stored);
  } catch {
    // Fall through and make a fresh one.
  }
  const random = () => Math.random().toString(36).slice(2, 10).padEnd(8, '0');
  const id = `${Date.now().toString(36)}-${random()}${random()}`;
  cached = id;
  AsyncStorage.setItem(INSTALL_ID_KEY, id).catch(() => {});
  return id;
};
