export type Item = {
  id: string;
  name: string;
  price: number;
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
};

export type TipMode = 'percent' | 'amount';

export type Bill = {
  stateCode: string;
  taxRatePercent: number;
  tipMode: TipMode;
  tipValue: number;
  people: Person[];
  sharedItems: SharedItem[];
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
