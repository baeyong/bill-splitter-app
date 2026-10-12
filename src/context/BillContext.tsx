import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getStateByCode } from '../data/stateTaxRates';
import {
  Bill,
  EntryRef,
  Item,
  Person,
  ReceiptLine,
  RecentItem,
  SavedReceipt,
  SharedItem,
  TaxMode,
  TipMode,
} from '../types/bill';
import { PendingScan, ScannedAssignment } from '../types/scan';

const PREFS_KEY = 'bill-splitter:prefs:v1';
const RECENT_ITEMS_MAX = 30;

type StoredPrefs = {
  stateCode: string;
  taxRatePercent: number;
};

const DEFAULT_STATE_CODE = 'CA';
const DEFAULT_TIP_MODE: TipMode = 'percent';
const DEFAULT_TIP_VALUE = 18;
const defaultPrefs: StoredPrefs = {
  stateCode: DEFAULT_STATE_CODE,
  taxRatePercent: getStateByCode(DEFAULT_STATE_CODE)?.rate ?? 0,
};

const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;


// One personId becomes that person's Item, two or more a SharedItem. This is
// the only place the two kinds are chosen automatically — keep it in sync with
// what the manual screens do.
const foldEntries = (prev: Bill, entries: ScannedAssignment[]): Bill => {
  const validIds = new Set(prev.people.map((p) => p.id));
  const newItemsByPerson = new Map<string, Item[]>();
  const newShared: SharedItem[] = [];

  for (const entry of entries) {
    const name = entry.name.trim();
    const ids = entry.personIds.filter((id) => validIds.has(id));
    if (!name || ids.length === 0 || !(entry.price >= 0)) continue;
    const line = entry.lineId ? { lineId: entry.lineId } : {};

    if (ids.length === 1) {
      const list = newItemsByPerson.get(ids[0]) ?? [];
      list.push({ id: genId(), name, price: entry.price, ...line });
      newItemsByPerson.set(ids[0], list);
    } else {
      newShared.push({ id: genId(), name, totalPrice: entry.price, personIds: ids, ...line });
    }
  }

  return {
    ...prev,
    people: prev.people.map((p) => {
      const added = newItemsByPerson.get(p.id);
      return added ? { ...p, items: [...p.items, ...added] } : p;
    }),
    sharedItems: [...prev.sharedItems, ...newShared],
  };
};

const removeEntriesFrom = (prev: Bill, refs: EntryRef[]): Bill => {
  const ids = new Set(refs.map((r) => r.id));
  return {
    ...prev,
    people: prev.people.map((p) => ({ ...p, items: p.items.filter((i) => !ids.has(i.id)) })),
    sharedItems: prev.sharedItems.filter((s) => !ids.has(s.id)),
  };
};

/**
 * Rewrites one line of the receipt view in a single update: everything that
 * made it up is removed and `add` takes its place. For a scanned line,
 * `scanLine` also corrects (or, with `next: null`, drops) the printed line.
 */
export type LineChange = {
  remove: EntryRef[];
  add: ScannedAssignment[];
  scanLine?: { id: string; next: ReceiptLine | null };
};

type BillContextValue = {
  bill: Bill;
  /** The saved default state/rate new bills start from — may differ from `bill`'s. */
  savedTax: StoredPrefs;
  prefsLoaded: boolean;
  recentItems: RecentItem[];
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
  applyScannedItems: (entries: ScannedAssignment[], lines: ReceiptLine[]) => void;
  changeLine: (change: LineChange) => void;
  pendingScan: PendingScan | null;
  /** The scanned photo, kept for checking against while the bill is open. */
  scanPhotoUri: string | null;
  setPendingScan: React.Dispatch<React.SetStateAction<PendingScan | null>>;
  /** Use a receipt's printed tax, exactly, for this bill. */
  applyReceiptTax: (taxAmount: number) => void;
  /** Change this bill's tax only — the saved default is untouched. */
  setBillTax: (patch: { taxMode?: TaxMode; taxRatePercent?: number; taxAmount?: number }) => void;
  resetBill: () => void;
  editingReceiptId: string | null;
  loadFromReceipt: (receipt: SavedReceipt) => void;
};

const BillContext = createContext<BillContextValue | null>(null);

export const BillProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [bill, setBill] = useState<Bill>({
    ...defaultPrefs,
    tipMode: DEFAULT_TIP_MODE,
    tipValue: DEFAULT_TIP_VALUE,
    people: [],
    sharedItems: [],
  });
  // The saved defaults, kept apart from `bill` so loading an old receipt for
  // editing (which carries its own state/rate) never overwrites them.
  const [prefs, setPrefs] = useState<StoredPrefs>(defaultPrefs);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [editingReceiptId, setEditingReceiptId] = useState<string | null>(null);
  const [pendingScan, setPendingScan] = useState<PendingScan | null>(null);
  const [scanPhotoUri, setScanPhotoUri] = useState<string | null>(null);

  const recentItems = useMemo<RecentItem[]>(() => {
    const tsOf = (id: string) => parseInt(id.split('-')[0] ?? '0', 10) || 0;
    const fromPeople = bill.people.flatMap((p) =>
      p.items.map((i) => ({ name: i.name, price: i.price, _ts: tsOf(i.id) })),
    );
    const fromShared = bill.sharedItems.map((s) => ({
      name: s.name,
      price: s.totalPrice,
      _ts: tsOf(s.id),
    }));
    const all = [...fromPeople, ...fromShared].sort((a, b) => b._ts - a._ts);
    const seen = new Set<string>();
    const out: RecentItem[] = [];
    for (const it of all) {
      const k = it.name.trim().toLowerCase();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push({ name: it.name, price: it.price, lastUsed: it._ts });
      if (out.length >= RECENT_ITEMS_MAX) break;
    }
    return out;
  }, [bill.people, bill.sharedItems]);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(PREFS_KEY);
        if (raw) {
          const stored = JSON.parse(raw) as StoredPrefs;
          setPrefs(stored);
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
    AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs)).catch(() => {});
  }, [prefsLoaded, prefs]);

  // Tax changes apply to the bill on screen, and become the saved default only
  // for a new bill — tweaking an old receipt's rate is a one-off.
  const setTax = (patch: Partial<StoredPrefs>) => {
    setBill((prev) => ({ ...prev, ...patch }));
    if (editingReceiptId === null) setPrefs((prev) => ({ ...prev, ...patch }));
  };

  const value = useMemo<BillContextValue>(
    () => ({
      bill,
      savedTax: prefs,
      prefsLoaded,
      recentItems,
      setStateCode: (code) => {
        setTax({ stateCode: code, taxRatePercent: getStateByCode(code)?.rate ?? 0 });
      },
      setTaxRatePercent: (rate) => setTax({ taxRatePercent: rate }),
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
      // Folds a whole scanned receipt in with one state update — a scan can be
      // 30+ lines, and calling addItem per line would re-render that many times.
      applyScannedItems: (entries, lines) => {
        const result = pendingScan?.result;
        setBill((prev) => ({
          ...foldEntries(prev, entries),
          // A second scan on the same bill replaces the first; items from the
          // first fall back to being grouped like hand-entered ones.
          scan: {
            restaurantName: result?.restaurantName,
            lines,
            subtotal: result?.subtotal,
            tax: result?.tax,
            tip: result?.tip,
            total: result?.total,
          },
        }));
        // The scan is spent once its items are in the bill; the photo stays
        // around to check against.
        if (pendingScan) setScanPhotoUri(pendingScan.imageUri);
        setPendingScan(null);
      },
      changeLine: ({ remove, add, scanLine }) => {
        setBill((prev) => {
          const next = foldEntries(removeEntriesFrom(prev, remove), add);
          if (!scanLine || !next.scan) return next;
          const lines = scanLine.next
            ? next.scan.lines.map((l) => (l.id === scanLine.id ? scanLine.next! : l))
            : next.scan.lines.filter((l) => l.id !== scanLine.id);
          return { ...next, scan: { ...next.scan, lines } };
        });
      },
      pendingScan,
      scanPhotoUri,
      setPendingScan,
      // The printed tax, exactly — a rate back-computed from it came out wrong
      // whenever the receipt's subtotal included comps or discounts, and
      // rounding the rate could miss by a few cents. This bill only.
      applyReceiptTax: (taxAmount) => {
        if (!(taxAmount >= 0)) return;
        setBill((prev) => ({ ...prev, taxMode: 'amount', taxAmount }));
      },
      setBillTax: (patch) => setBill((prev) => ({ ...prev, ...patch })),
      resetBill: () => {
        setBill({
          ...prefs,
          tipMode: DEFAULT_TIP_MODE,
          tipValue: DEFAULT_TIP_VALUE,
          people: [],
          sharedItems: [],
        });
        setEditingReceiptId(null);
        setPendingScan(null);
        setScanPhotoUri(null);
      },
      editingReceiptId,
      loadFromReceipt: (receipt) => {
        // Spread first so every field (and its order — Summary's unsaved-changes
        // check compares JSON) carries over, then deep-copy the nested parts.
        setBill({
          ...receipt.bill,
          people: receipt.bill.people.map((p) => ({
            ...p,
            items: p.items.map((i) => ({ ...i })),
          })),
          sharedItems: receipt.bill.sharedItems.map((s) => ({
            ...s,
            personIds: [...s.personIds],
          })),
          ...(receipt.bill.scan
            ? {
                scan: {
                  ...receipt.bill.scan,
                  lines: receipt.bill.scan.lines.map((l) => ({ ...l })),
                },
              }
            : {}),
        });
        setEditingReceiptId(receipt.id);
        setPendingScan(null);
        setScanPhotoUri(null);
      },
    }),
    [bill, prefs, prefsLoaded, recentItems, editingReceiptId, pendingScan, scanPhotoUri],
  );

  return <BillContext.Provider value={value}>{children}</BillContext.Provider>;
};

export const useBill = (): BillContextValue => {
  const ctx = useContext(BillContext);
  if (!ctx) throw new Error('useBill must be used inside BillProvider');
  return ctx;
};
