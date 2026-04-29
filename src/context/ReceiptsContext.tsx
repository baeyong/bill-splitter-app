import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { SavedReceipt } from '../types/bill';

const RECEIPTS_KEY = 'bill-splitter:receipts:v1';
const OWNER_KEY = 'bill-splitter:owner-name:v1';

const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

type SaveReceiptInput = Omit<SavedReceipt, 'id' | 'createdAt'> & {
  createdAt?: number;
};

type ReceiptsContextValue = {
  receipts: SavedReceipt[];
  ownerName: string | null;
  loaded: boolean;
  saveReceipt: (input: SaveReceiptInput) => SavedReceipt;
  deleteReceipt: (id: string) => void;
  setOwnerName: (name: string | null) => void;
};

const ReceiptsContext = createContext<ReceiptsContextValue | null>(null);

export const ReceiptsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [receipts, setReceipts] = useState<SavedReceipt[]>([]);
  const [ownerName, setOwnerNameState] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [rawReceipts, rawOwner] = await Promise.all([
          AsyncStorage.getItem(RECEIPTS_KEY),
          AsyncStorage.getItem(OWNER_KEY),
        ]);
        if (rawReceipts) {
          const parsed = JSON.parse(rawReceipts) as SavedReceipt[];
          if (Array.isArray(parsed)) setReceipts(parsed);
        }
        if (rawOwner) setOwnerNameState(rawOwner);
      } catch {
        // ignore
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(RECEIPTS_KEY, JSON.stringify(receipts)).catch(() => {});
  }, [loaded, receipts]);

  useEffect(() => {
    if (!loaded) return;
    if (ownerName === null) {
      AsyncStorage.removeItem(OWNER_KEY).catch(() => {});
    } else {
      AsyncStorage.setItem(OWNER_KEY, ownerName).catch(() => {});
    }
  }, [loaded, ownerName]);

  const value = useMemo<ReceiptsContextValue>(
    () => ({
      receipts,
      ownerName,
      loaded,
      saveReceipt: (input) => {
        const receipt: SavedReceipt = {
          id: genId(),
          createdAt: input.createdAt ?? Date.now(),
          restaurantName: input.restaurantName,
          notes: input.notes,
          ownerPersonId: input.ownerPersonId,
          bill: input.bill,
          breakdown: input.breakdown,
          grandSubtotal: input.grandSubtotal,
          grandTax: input.grandTax,
          grandTip: input.grandTip,
          grandTotal: input.grandTotal,
        };
        setReceipts((prev) => [receipt, ...prev]);
        return receipt;
      },
      deleteReceipt: (id) => {
        setReceipts((prev) => prev.filter((r) => r.id !== id));
      },
      setOwnerName: (name) => {
        const trimmed = name?.trim() ?? '';
        setOwnerNameState(trimmed.length === 0 ? null : trimmed);
      },
    }),
    [receipts, ownerName, loaded],
  );

  return <ReceiptsContext.Provider value={value}>{children}</ReceiptsContext.Provider>;
};

export const useReceipts = (): ReceiptsContextValue => {
  const ctx = useContext(ReceiptsContext);
  if (!ctx) throw new Error('useReceipts must be used inside ReceiptsProvider');
  return ctx;
};
