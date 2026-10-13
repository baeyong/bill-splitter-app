import { ReceiptLine } from '../types/bill';
import { AssignDraft, AssignProgress, LineMode, ScannedAssignment } from '../types/scan';
import { parsePrice } from './money';

// Drops picks for anyone removed from the bill since the progress was saved.
export const forPeople = (saved: AssignProgress, validIds: Set<string>): AssignProgress => ({
  ...saved,
  assignments: Object.fromEntries(
    Object.entries(saved.assignments).map(([line, ids]) => [
      line,
      ids.filter((id) => validIds.has(id)),
    ]),
  ),
  unitCounts: Object.fromEntries(
    Object.entries(saved.unitCounts).map(([line, counts]) => [
      line,
      Object.fromEntries(Object.entries(counts).filter(([id]) => validIds.has(id))),
    ]),
  ),
  unitPeople: Object.fromEntries(
    Object.entries(saved.unitPeople).map(([line, units]) => [
      line,
      units.map((ids) => ids.filter((id) => validIds.has(id))),
    ]),
  ),
});

export const modeOf = (progress: AssignProgress, draft: AssignDraft): LineMode =>
  draft.quantity === 1 ? 'all' : progress.lineMode[draft.id] ?? 'each';

// Converters between the three modes, so switching keeps what was picked.

/** "Alice 2, Bob 1" of 4 → [[Alice], [Alice], [Bob], []]. */
export const unitsFromCounts = (quantity: number, counts: Record<string, number>): string[][] => {
  const units: string[][] = [];
  for (const [id, n] of Object.entries(counts)) {
    for (let i = 0; i < n; i++) units.push([id]);
  }
  return resizeUnits(units, quantity);
};

/** Every unit shared by the same people. */
export const unitsFromShared = (quantity: number, ids: string[]): string[][] =>
  Array.from({ length: quantity }, () => [...ids]);

/** Personal units only — a shared unit has no place in "one each". */
export const countsFromUnits = (units: string[][]): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const ids of units) if (ids.length === 1) counts[ids[0]] = (counts[ids[0]] ?? 0) + 1;
  return counts;
};

/** Pads with unassigned units, or drops from the end, to match the quantity. */
export const resizeUnits = (units: string[][], quantity: number): string[][] =>
  Array.from({ length: quantity }, (_, i) => units[i] ?? []);

/** Who had each unit of a line, whatever mode it was assigned in. [] = nobody yet. */
export const unitsOfLine = (progress: AssignProgress, draft: AssignDraft): string[][] => {
  switch (modeOf(progress, draft)) {
    case 'each':
      return unitsFromCounts(draft.quantity, progress.unitCounts[draft.id] ?? {});
    case 'all':
      return unitsFromShared(draft.quantity, progress.assignments[draft.id] ?? []);
    case 'units':
      return resizeUnits(progress.unitPeople[draft.id] ?? [], draft.quantity);
  }
};

/**
 * What finishing AssignItems puts into the bill: one entry per unit, and every
 * line of the receipt (skipped ones included) for the receipt view.
 */
export const progressToBill = (
  progress: AssignProgress,
): { entries: ScannedAssignment[]; lines: ReceiptLine[] } => {
  // Each unit becomes its own entry — the same shape the manual quantity
  // stepper produces.
  const entries: ScannedAssignment[] = [];
  // Every line, skipped ones too, so All items can show the whole receipt.
  const lines: ReceiptLine[] = [];
  for (const draft of progress.drafts) {
    const price = parsePrice(draft.priceText);
    if (isNaN(price)) continue;
    const name = draft.name.trim();
    const lineId = draft.id;
    lines.push({ id: lineId, name, price, quantity: draft.quantity });
    if (progress.skipped[draft.id]) continue;

    for (const personIds of unitsOfLine(progress, draft)) {
      if (personIds.length > 0) entries.push({ name, price, personIds, lineId });
    }
  }
  return { entries, lines };
};
