import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

// Whether the user has agreed to send receipt photos to Anthropic. Apple's
// guideline 5.1.2(i) requires explicit permission before sharing personal data
// with third-party AI, and 5.1.1(ii) an easy way to withdraw it — hence the
// sheet before the first scan and the switch in Settings. Stored on the phone
// only; nothing about it is sent anywhere.
const CONSENT_KEY = 'bill-splitter:scan-consent:v1';

/** Set once the privacy policy is published; until then the link stays hidden. */
export const PRIVACY_POLICY_URL: string | null = null;

let cached: boolean | null = null;
const listeners = new Set<(granted: boolean) => void>();

export const loadScanConsent = async (): Promise<boolean> => {
  if (cached !== null) return cached;
  try {
    cached = (await AsyncStorage.getItem(CONSENT_KEY)) === 'granted';
  } catch {
    cached = false;
  }
  return cached;
};

export const setScanConsent = async (granted: boolean): Promise<void> => {
  cached = granted;
  listeners.forEach((l) => l(granted));
  try {
    if (granted) await AsyncStorage.setItem(CONSENT_KEY, 'granted');
    else await AsyncStorage.removeItem(CONSENT_KEY);
  } catch {
    // Worst case they're asked again next launch — the safe direction.
  }
};

/** The current answer, kept in sync across screens. `null` while loading. */
export const useScanConsent = (): [boolean | null, (granted: boolean) => Promise<void>] => {
  const [granted, setGranted] = useState<boolean | null>(cached);
  useEffect(() => {
    let alive = true;
    loadScanConsent().then((g) => alive && setGranted(g));
    listeners.add(setGranted);
    return () => {
      alive = false;
      listeners.delete(setGranted);
    };
  }, []);
  return [granted, setScanConsent];
};

/** For tests: forget the in-memory copy so the next load reads storage. */
export const resetScanConsentCache = () => {
  cached = null;
};
