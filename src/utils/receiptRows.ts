import { Bill, EntryRef, Person } from '../types/bill';
import { AssignProgress } from '../types/scan';
import { parsePrice } from './money';

/**
 * One line of the receipt view — "3 × Coke" — however its units are split.
 * The bill stores each unit as its own Item/SharedItem; this folds them back
 * into the line they came from so the screen reads like the paper receipt.
 */
export type ReceiptRow = {
  key: string;
  /** Set for lines from a scan; hand-entered rows are grouped by name + price. */
  lineId?: string;
  name: string;
  /** Price of ONE unit. */
  price: number;
  quantity: number;
  /** Units each person had to themselves. */
  owned: Record<string, number>;
  /** Units shared evenly, grouped by exactly who shared them. */
  shared: { personIds: string[]; units: number }[];
  unassigned: number;
  skipped?: boolean;
  /** The bill entries making up this row (empty for rows built from progress). */
  refs: EntryRef[];
};

const tsOf = (id: string) => parseInt(id.split('-')[0] ?? '0', 10) || 0;

const emptyRow = (key: string, name: string, price: number, quantity: number): ReceiptRow => ({
  key,
  name,
  price,
  quantity,
  owned: {},
  shared: [],
  unassigned: 0,
  refs: [],
});

const addShared = (row: ReceiptRow, personIds: string[], units: number) => {
  const setKey = [...personIds].sort().join(',');
  const group = row.shared.find((g) => [...g.personIds].sort().join(',') === setKey);
  if (group) group.units += units;
  else row.shared.push({ personIds, units });
};

const assignedUnits = (row: ReceiptRow) =>
  Object.values(row.owned).reduce((sum, n) => sum + n, 0) +
  row.shared.reduce((sum, g) => sum + g.units, 0);

/** Scanned lines in printed order, then hand-entered items in the order added. */
export const rowsFromBill = (bill: Bill): ReceiptRow[] => {
  const scanned = new Map<string, ReceiptRow>();
  for (const line of bill.scan?.lines ?? []) {
    scanned.set(line.id, { ...emptyRow(line.id, line.name, line.price, line.quantity), lineId: line.id });
  }

  const manual = new Map<string, ReceiptRow & { ts: number }>();
  const rowFor = (entryId: string, name: string, price: number, lineId?: string) => {
    const fromScan = lineId ? scanned.get(lineId) : undefined;
    if (fromScan) return fromScan;
    const key = `m:${name.trim().toLowerCase()}|${price.toFixed(2)}`;
    let row = manual.get(key);
    if (!row) {
      row = { ...emptyRow(key, name, price, 0), ts: tsOf(entryId) };
      manual.set(key, row);
    }
    row.quantity += 1;
    row.ts = Math.min(row.ts, tsOf(entryId));
    return row;
  };

  for (const person of bill.people) {
    for (const item of person.items) {
      const row = rowFor(item.id, item.name, item.price, item.lineId);
      row.owned[person.id] = (row.owned[person.id] ?? 0) + 1;
      row.refs.push({ kind: 'item', personId: person.id, id: item.id });
    }
  }
  for (const s of bill.sharedItems) {
    const row = rowFor(s.id, s.name, s.totalPrice, s.lineId);
    addShared(row, s.personIds, 1);
    row.refs.push({ kind: 'shared', id: s.id });
  }

  const rows = [...scanned.values(), ...[...manual.values()].sort((a, b) => a.ts - b.ts)];
  for (const row of rows) {
    const assigned = assignedUnits(row);
    row.quantity = Math.max(row.quantity, assigned);
    row.unassigned = row.quantity - assigned;
  }
  return rows;
};

/** The same view of a scan that's still being assigned on AssignItems. */
export const rowsFromProgress = (progress: AssignProgress): ReceiptRow[] =>
  progress.drafts.map((d) => {
    const price = parsePrice(d.priceText);
    const row = emptyRow(d.id, d.name, isNaN(price) ? 0 : price, d.quantity);
    row.lineId = d.id;
    if (progress.skipped[d.id]) {
      row.skipped = true;
    } else if (d.quantity > 1 && !progress.shareEvenly[d.id]) {
      row.owned = { ...(progress.unitCounts[d.id] ?? {}) };
    } else {
      const ids = progress.assignments[d.id] ?? [];
      if (ids.length === 1) row.owned = { [ids[0]]: d.quantity };
      else if (ids.length > 1) row.shared = [{ personIds: ids, units: d.quantity }];
    }
    row.unassigned = Math.max(0, d.quantity - assignedUnits(row));
    return row;
  });

/** "Alice × 2, Bob · Shared · Cara, Dan" — who had what on this row. */
export const describeRow = (row: ReceiptRow, people: Person[]): string => {
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? '?';
  const parts: string[] = [];
  const owners = Object.entries(row.owned).filter(([, n]) => n > 0);
  if (owners.length > 0) {
    parts.push(owners.map(([id, n]) => (n > 1 ? `${nameOf(id)} × ${n}` : nameOf(id))).join(', '));
  }
  for (const g of row.shared) {
    const everyone = people.length > 2 && g.personIds.length === people.length;
    const who = everyone ? 'everyone' : g.personIds.map(nameOf).join(', ');
    parts.push(`Shared · ${who}${g.units > 1 && row.quantity > g.units ? ` × ${g.units}` : ''}`);
  }
  return parts.join(' · ');
};

/** The amber note under a row, or null when every unit has an owner. */
export const rowWarning = (row: ReceiptRow): string | null => {
  if (row.skipped) return 'Skipped — not assigned';
  if (row.unassigned === 0) return null;
  if (row.unassigned === row.quantity) return 'Not assigned yet';
  return `${row.unassigned} not assigned`;
};
