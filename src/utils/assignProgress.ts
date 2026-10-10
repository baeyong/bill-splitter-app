import { ReceiptLine } from '../types/bill';
import { AssignProgress, ScannedAssignment } from '../types/scan';

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
});

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
    const price = parseFloat(draft.priceText);
    if (isNaN(price) || price < 0) continue;
    const name = draft.name.trim();
    const lineId = draft.id;
    lines.push({ id: lineId, name, price, quantity: draft.quantity });
    if (progress.skipped[draft.id]) continue;

    if (draft.quantity > 1 && !progress.shareEvenly[draft.id]) {
      for (const [personId, n] of Object.entries(progress.unitCounts[draft.id] ?? {})) {
        for (let i = 0; i < n; i++) entries.push({ name, price, personIds: [personId], lineId });
      }
    } else {
      const personIds = progress.assignments[draft.id] ?? [];
      if (personIds.length === 0) continue;
      for (let i = 0; i < draft.quantity; i++) entries.push({ name, price, personIds, lineId });
    }
  }
  return { entries, lines };
};
