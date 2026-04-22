import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getStateByCode } from '../data/stateTaxRates';
import { Bill, Item, Person, SharedItem, TipMode } from '../types/bill';

const PREFS_KEY = 'bill-splitter:prefs:v1';

type StoredPrefs = {
  stateCode: string;
  taxRatePercent: number;
  tipMode: TipMode;
  tipValue: number;
};

const DEFAULT_STATE_CODE = 'CA';
const defaultPrefs: StoredPrefs = {
  stateCode: DEFAULT_STATE_CODE,
  taxRatePercent: getStateByCode(DEFAULT_STATE_CODE)?.rate ?? 0,
  tipMode: 'percent',
  tipValue: 18,
};

const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

type BillContextValue = {
  bill: Bill;
  prefsLoaded: boolean;
  setStateCode: (code: string) => void;
  setTaxRatePercent: (rate: number) => void;
  setTipMode: (mode: TipMode) => void;
  setTipValue: (value: number) => void;
  setPeople: (names: string[]) => void;
  addItem: (personId: string, name: string, price: number) => void;
  removeItem: (personId: string, itemId: string) => void;
  updateItem: (personId: string, itemId: string, patch: Partial<Omit<Item, 'id'>>) => void;
  addSharedItem: (name: string, totalPrice: number, personIds: string[]) => void;
  removeSharedItem: (id: string) => void;
  updateSharedItem: (id: string, patch: Partial<Omit<SharedItem, 'id'>>) => void;
  resetBill: () => void;
};

const BillContext = createContext<BillContextValue | null>(null);

export const BillProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [bill, setBill] = useState<Bill>({
    ...defaultPrefs,
    people: [],
    sharedItems: [],
  });
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(PREFS_KEY);
        if (raw) {
          const stored = JSON.parse(raw) as StoredPrefs;
          setBill((prev) => ({ ...prev, ...stored }));
        }
      } catch {
        // ignore — fall back to defaults
      } finally {
        setPrefsLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!prefsLoaded) return;
    const prefs: StoredPrefs = {
      stateCode: bill.stateCode,
      taxRatePercent: bill.taxRatePercent,
      tipMode: bill.tipMode,
      tipValue: bill.tipValue,
    };
    AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs)).catch(() => {});
  }, [prefsLoaded, bill.stateCode, bill.taxRatePercent, bill.tipMode, bill.tipValue]);

  const value = useMemo<BillContextValue>(
    () => ({
      bill,
      prefsLoaded,
      setStateCode: (code) => {
        const rate = getStateByCode(code)?.rate ?? 0;
        setBill((prev) => ({ ...prev, stateCode: code, taxRatePercent: rate }));
      },
      setTaxRatePercent: (rate) => setBill((prev) => ({ ...prev, taxRatePercent: rate })),
      setTipMode: (mode) => setBill((prev) => ({ ...prev, tipMode: mode })),
      setTipValue: (v) => setBill((prev) => ({ ...prev, tipValue: v })),
      setPeople: (names) => {
        setBill((prev) => {
          const existingByName = new Map(prev.people.map((p) => [p.name.trim().toLowerCase(), p]));
          const nextPeople: Person[] = names
            .map((n) => n.trim())
            .filter((n) => n.length > 0)
            .map((n) => existingByName.get(n.toLowerCase()) ?? { id: genId(), name: n, items: [] });
          const nextIds = new Set(nextPeople.map((p) => p.id));
          const nextShared = prev.sharedItems.map((s) => ({
            ...s,
            personIds: s.personIds.filter((id) => nextIds.has(id)),
          }));
          return { ...prev, people: nextPeople, sharedItems: nextShared };
        });
      },
      addItem: (personId, name, price) => {
        setBill((prev) => ({
          ...prev,
          people: prev.people.map((p) =>
            p.id === personId
              ? { ...p, items: [...p.items, { id: genId(), name, price }] }
              : p,
          ),
        }));
      },
      removeItem: (personId, itemId) => {
        setBill((prev) => ({
          ...prev,
          people: prev.people.map((p) =>
            p.id === personId ? { ...p, items: p.items.filter((i) => i.id !== itemId) } : p,
          ),
        }));
      },
      updateItem: (personId, itemId, patch) => {
        setBill((prev) => ({
          ...prev,
          people: prev.people.map((p) =>
            p.id === personId
              ? {
                  ...p,
                  items: p.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)),
                }
              : p,
          ),
        }));
      },
      addSharedItem: (name, totalPrice, personIds) => {
        setBill((prev) => ({
          ...prev,
          sharedItems: [
            ...prev.sharedItems,
            { id: genId(), name, totalPrice, personIds },
          ],
        }));
      },
      removeSharedItem: (id) => {
        setBill((prev) => ({
          ...prev,
          sharedItems: prev.sharedItems.filter((s) => s.id !== id),
        }));
      },
      updateSharedItem: (id, patch) => {
        setBill((prev) => ({
          ...prev,
          sharedItems: prev.sharedItems.map((s) => (s.id === id ? { ...s, ...patch } : s)),
        }));
      },
      resetBill: () => {
        setBill((prev) => ({
          stateCode: prev.stateCode,
          taxRatePercent: prev.taxRatePercent,
          tipMode: prev.tipMode,
          tipValue: prev.tipValue,
          people: [],
          sharedItems: [],
        }));
      },
    }),
    [bill, prefsLoaded],
  );

  return <BillContext.Provider value={value}>{children}</BillContext.Provider>;
};

export const useBill = (): BillContextValue => {
  const ctx = useContext(BillContext);
  if (!ctx) throw new Error('useBill must be used inside BillProvider');
  return ctx;
};
