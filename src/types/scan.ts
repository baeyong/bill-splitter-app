// Transient types for the receipt-scan flow. Nothing here is persisted — a scan
// is turned into regular Items / SharedItems on BillContext once the user has
// assigned everything, and then discarded.

/** One receipt line. `price` is the price of ONE unit, not the line total. */
export type ScannedItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
};

export type ScanResult = {
  restaurantName?: string;
  /**
   * One entry per receipt line, as printed. A "2 × Taco" line stays one entry
   * with quantity 2; AssignItems hands the units out per person.
   */
  items: ScannedItem[];
  subtotal?: number;
  tax?: number;
  tip?: number;
  total?: number;
};

/**
 * The scan in progress for the current bill, held on BillContext so leaving
 * the scan screen (say, to add a forgotten person) doesn't throw away a paid-for
 * result. In memory only, like the rest of the in-progress bill.
 */
export type PendingScan = {
  imageUri: string;
  scanning: boolean;
  result: ScanResult | null;
  /** Set once AssignItems has opened, so leaving it and coming back resumes. */
  progress?: AssignProgress;
};

/** A line as edited on AssignItems. Price stays text so partial input works. */
export type AssignDraft = { id: string; name: string; priceText: string; quantity: number };

/**
 * How a multi-unit line ("2 × Pizza") is handed out:
 * - 'each': units go to one person at a time ("Alice 2, Bob 1") — the default.
 * - 'all': every unit is shared by the same people.
 * - 'units': each unit picked separately, so one can be personal and another
 *   shared ("Alice had one; Bob and Cara split the other").
 * A single-unit line is always picked like 'all'.
 */
export type LineMode = 'each' | 'all' | 'units';

/** Everything the user has done on AssignItems, keyed by draft id. */
export type AssignProgress = {
  drafts: AssignDraft[];
  index: number;
  lineMode: Record<string, LineMode>;
  // 'all' mode (and single-unit lines): who shares it.
  assignments: Record<string, string[]>;
  // 'each' mode: how many units each person had.
  unitCounts: Record<string, Record<string, number>>;
  // 'units' mode: who had each unit — one name personal, several shared.
  unitPeople: Record<string, string[][]>;
  skipped: Record<string, boolean>;
};

/** What the user was doing when the scan failed — drives the retry copy. */
export type ScanErrorKind = 'config' | 'network' | 'api' | 'parse' | 'empty';

/**
 * One assigned line, ready to be folded into the bill. A single `personIds`
 * entry becomes that person's Item; two or more becomes a SharedItem.
 */
export type ScannedAssignment = {
  /** The receipt line this came from, so the bill can be shown like the receipt. */
  lineId?: string;
  name: string;
  price: number;
  personIds: string[];
};
