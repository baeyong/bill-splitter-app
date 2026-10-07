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
};

/** What the user was doing when the scan failed — drives the retry copy. */
export type ScanErrorKind = 'config' | 'network' | 'api' | 'parse' | 'empty';

/**
 * One assigned line, ready to be folded into the bill. A single `personIds`
 * entry becomes that person's Item; two or more becomes a SharedItem.
 */
export type ScannedAssignment = {
  name: string;
  price: number;
  personIds: string[];
};
