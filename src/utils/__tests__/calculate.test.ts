import { Bill } from '../../types/bill';
import { calculateBreakdown } from '../calculate';

const bill = (patch: Partial<Bill>): Bill => ({
  stateCode: 'NY',
  taxRatePercent: 0,
  tipMode: 'percent',
  tipValue: 0,
  people: [],
  sharedItems: [],
  ...patch,
});

const alice = (prices: number[]) => ({
  id: 'a',
  name: 'Alice',
  items: prices.map((price, i) => ({ id: `a${i}`, name: `Item ${i}`, price })),
});
const bob = (prices: number[]) => ({
  id: 'b',
  name: 'Bob',
  items: prices.map((price, i) => ({ id: `b${i}`, name: `Item ${i}`, price })),
});

describe('calculateBreakdown', () => {
  it('applies tax and a percent tip to each person’s subtotal', () => {
    const r = calculateBreakdown(
      bill({ taxRatePercent: 10, tipValue: 20, people: [alice([10])] }),
    );
    expect(r.rows[0]).toMatchObject({ subtotal: 10, tax: 1, tip: 2, total: 13 });
    expect(r).toMatchObject({ grandSubtotal: 10, grandTax: 1, grandTip: 2, grandTotal: 13 });
  });

  it('splits a $ tip in proportion to each person’s subtotal, not evenly', () => {
    const r = calculateBreakdown(
      bill({ tipMode: 'amount', tipValue: 8, people: [alice([30]), bob([10])] }),
    );
    expect(r.rows.find((x) => x.personId === 'a')?.tip).toBe(6);
    expect(r.rows.find((x) => x.personId === 'b')?.tip).toBe(2);
  });

  it('gives no tip (and no NaN) for a $ tip when nothing has been ordered', () => {
    const r = calculateBreakdown(
      bill({ tipMode: 'amount', tipValue: 10, people: [alice([]), bob([])] }),
    );
    expect(r.rows.map((x) => x.tip)).toEqual([0, 0]);
    expect(r.grandTotal).toBe(0);
  });

  it('splits a shared item evenly among only the people on it', () => {
    const r = calculateBreakdown(
      bill({
        people: [alice([]), bob([5]), { id: 'c', name: 'Cara', items: [] }],
        sharedItems: [{ id: 's', name: 'Nachos', totalPrice: 12, personIds: ['a', 'b'] }],
      }),
    );
    const byId = Object.fromEntries(r.rows.map((x) => [x.personId, x]));
    expect(byId.a).toMatchObject({ ownItemsTotal: 0, sharedShare: 6, subtotal: 6 });
    expect(byId.b).toMatchObject({ ownItemsTotal: 5, sharedShare: 6, subtotal: 11 });
    expect(byId.c.subtotal).toBe(0);
  });

  it('ignores a shared item nobody is on', () => {
    const r = calculateBreakdown(
      bill({
        people: [alice([4])],
        sharedItems: [{ id: 's', name: 'Orphan', totalPrice: 9, personIds: [] }],
      }),
    );
    expect(r.grandSubtotal).toBe(4);
  });

  it('per-person totals always add up to the grand total', () => {
    const r = calculateBreakdown(
      bill({
        taxRatePercent: 8.875,
        tipValue: 18,
        people: [alice([12.99, 3.5]), bob([7.25]), { id: 'c', name: 'Cara', items: [] }],
        sharedItems: [{ id: 's', name: 'Fries', totalPrice: 10, personIds: ['a', 'b', 'c'] }],
      }),
    );
    const sum = Math.round(r.rows.reduce((s, x) => s + x.total, 0) * 100) / 100;
    expect(sum).toBe(r.grandTotal);
  });

  it('gives the stray cent to one person so the split adds up exactly', () => {
    const r = calculateBreakdown(
      bill({
        people: [alice([]), bob([]), { id: 'c', name: 'Cara', items: [] }],
        sharedItems: [{ id: 's', name: 'Pizza', totalPrice: 10, personIds: ['a', 'b', 'c'] }],
      }),
    );
    expect(r.rows.map((x) => x.total)).toEqual([3.34, 3.33, 3.33]);
    expect(r.grandTotal).toBe(10);
  });

  it('every person’s line adds up, and the people add up to the grand totals', () => {
    const people = [alice([12.99, 3.5]), bob([7.25]), { id: 'c', name: 'Cara', items: [] }];
    const sharedItems = [
      { id: 's', name: 'Fries', totalPrice: 10, personIds: ['a', 'b', 'c'] },
      { id: 't', name: 'Wine', totalPrice: 41, personIds: ['a', 'b', 'c'] },
    ];
    for (const tip of [
      { tipMode: 'percent' as const, tipValue: 18 },
      { tipMode: 'amount' as const, tipValue: 13.37 },
    ]) {
      const r = calculateBreakdown(bill({ taxRatePercent: 8.875, people, sharedItems, ...tip }));
      const cents = (n: number) => Math.round(n * 100);
      for (const row of r.rows) {
        expect(cents(row.ownItemsTotal) + cents(row.sharedShare)).toBe(cents(row.subtotal));
        expect(cents(row.subtotal) + cents(row.tax) + cents(row.tip)).toBe(cents(row.total));
      }
      const sum = (k: 'subtotal' | 'tax' | 'tip' | 'total') =>
        r.rows.reduce((acc, row) => acc + cents(row[k]), 0);
      expect(sum('subtotal')).toBe(cents(r.grandSubtotal));
      expect(sum('tax')).toBe(cents(r.grandTax));
      expect(sum('tip')).toBe(cents(r.grandTip));
      expect(sum('total')).toBe(cents(r.grandTotal));
      expect(cents(r.grandTotal)).toBe(cents(r.grandSubtotal + r.grandTax + r.grandTip));
    }
  });

  it('a $ tip is handed out to the cent', () => {
    const r = calculateBreakdown(
      bill({
        tipMode: 'amount',
        tipValue: 10,
        people: [alice([1]), bob([1]), { id: 'c', name: 'Cara', items: [{ id: 'c0', name: 'x', price: 1 }] }],
      }),
    );
    expect(r.rows.map((x) => x.tip)).toEqual([3.34, 3.33, 3.33]);
    expect(r.grandTip).toBe(10);
  });
});
