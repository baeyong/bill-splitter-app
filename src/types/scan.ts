// Transient types for the receipt-scan flow. Nothing here is persisted — a scan
// is turned into regular Items / SharedItems on BillContext once the user has
// assigned everything, and then discarded.

export type ScannedItem = {
  id: string;
  name: string;
  price: number;
};

export type ScanResult = {
  restaurantName?: string;
  /**
   * One entry per physical thing someone ate. A "2 × Taco" line on the receipt
   * is expanded into two entries so each can go to a different person.
   */
  items: ScannedItem[];
  subtotal?: number;
  tax?: number;
  tip?: number;
  total?: number;
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
