export type Item = {
  id: string;
  name: string;
  price: number;
  /** The scanned receipt line this unit came from, if any. See `Bill.scan`. */
  lineId?: string;
};

export type RecentItem = {
  name: string;
  price: number;
  lastUsed: number;
};

export type Person = {
  id: string;
  name: string;
  items: Item[];
};

export type SharedItem = {
  id: string;
  name: string;
  totalPrice: number;
  personIds: string[];
  lineId?: string;
};

/** Points at one item in the bill, whichever kind it is. */
export type EntryRef = { kind: 'item'; personId: string; id: string } | { kind: 'shared'; id: string };

/** One line as printed on a scanned receipt, after the user's corrections. */
export type ReceiptLine = {
  id: string;
  name: string;
  /** Price of ONE unit. */
  price: number;
  quantity: number;
};

/**
 * The receipt a bill was scanned from: its lines in printed order (skipped ones
 * included) and the printed totals. Only the All items view reads this —
 * `calculate` works off people/sharedItems alone, so the math never depends on
 * it. Optional, so bills and receipts saved before it existed still load.
 */
export type ScannedReceipt = {
  restaurantName?: string;
  lines: ReceiptLine[];
  subtotal?: number;
  tax?: number;
  tip?: number;
  total?: number;
};

export type TipMode = 'percent' | 'amount';

export type Bill = {
  stateCode: string;
  taxRatePercent: number;
  tipMode: TipMode;
  tipValue: number;
  people: Person[];
  sharedItems: SharedItem[];
  scan?: ScannedReceipt;
};

export type PersonBreakdown = {
  personId: string;
  name: string;
  ownItemsTotal: number;
  sharedShare: number;
  subtotal: number;
  tax: number;
  tip: number;
  total: number;
};

export type SavedReceipt = {
  id: string;
  createdAt: number;
  restaurantName?: string;
  notes?: string;
  ownerPersonId?: string;
  bill: Bill;
  breakdown: PersonBreakdown[];
  grandSubtotal: number;
  grandTax: number;
  grandTip: number;
  grandTotal: number;
};
