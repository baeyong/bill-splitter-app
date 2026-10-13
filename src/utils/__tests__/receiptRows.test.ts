import { Bill, Person } from '../../types/bill';
import { AssignProgress } from '../../types/scan';
import { describeRow, rowsFromBill, rowsFromProgress, rowWarning } from '../receiptRows';

const people: Person[] = [
  { id: 'a', name: 'Alice', items: [] },
  { id: 'b', name: 'Bob', items: [] },
  { id: 'c', name: 'Cara', items: [] },
];

const bill = (patch: Partial<Bill>): Bill => ({
  stateCode: 'NY',
  taxRatePercent: 0,
  tipMode: 'percent',
  tipValue: 0,
  people,
  sharedItems: [],
  ...patch,
});

const withItems = (items: Record<string, Person['items']>): Person[] =>
  people.map((p) => ({ ...p, items: items[p.id] ?? [] }));

describe('rowsFromBill', () => {
  it('folds "3 × Coke" back into one line with per-person counts', () => {
    const rows = rowsFromBill(
      bill({
        people: withItems({
          a: [
            { id: '1-a', name: 'Coke', price: 2.5, lineId: 'L1' },
            { id: '1-b', name: 'Coke', price: 2.5, lineId: 'L1' },
          ],
          b: [{ id: '1-c', name: 'Coke', price: 2.5, lineId: 'L1' }],
        }),
        scan: { lines: [{ id: 'L1', name: 'Coke', price: 2.5, quantity: 3 }] },
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'Coke', quantity: 3, owned: { a: 2, b: 1 }, unassigned: 0 });
    expect(rows[0].refs).toHaveLength(3);
    expect(describeRow(rows[0], people)).toBe('Alice × 2, Bob');
    expect(rowWarning(rows[0])).toBeNull();
  });

  it('keeps printed order and shows lines nobody was assigned', () => {
    const rows = rowsFromBill(
      bill({
        people: withItems({ a: [{ id: '1-a', name: 'Burger', price: 14, lineId: 'L2' }] }),
        scan: {
          lines: [
            { id: 'L1', name: 'Milkshake', price: 6.5, quantity: 1 },
            { id: 'L2', name: 'Burger', price: 14, quantity: 1 },
          ],
        },
      }),
    );
    expect(rows.map((r) => r.name)).toEqual(['Milkshake', 'Burger']);
    expect(rows[0].unassigned).toBe(1);
    expect(rowWarning(rows[0])).toBe('Not assigned yet');
  });

  it('flags a line that is only partly handed out', () => {
    const [row] = rowsFromBill(
      bill({
        people: withItems({ a: [{ id: '1-a', name: 'Taco', price: 4, lineId: 'L1' }] }),
        scan: { lines: [{ id: 'L1', name: 'Taco', price: 4, quantity: 3 }] },
      }),
    );
    expect(row.unassigned).toBe(2);
    expect(rowWarning(row)).toBe('2 not assigned');
  });

  it('shows shared units as one group and says "everyone" when it is', () => {
    const [row] = rowsFromBill(
      bill({
        sharedItems: [
          { id: '1-s', name: 'Fries', totalPrice: 4.5, personIds: ['a', 'b', 'c'], lineId: 'L1' },
          { id: '1-t', name: 'Fries', totalPrice: 4.5, personIds: ['c', 'b', 'a'], lineId: 'L1' },
        ],
        scan: { lines: [{ id: 'L1', name: 'Fries', price: 4.5, quantity: 2 }] },
      }),
    );
    expect(row.shared).toEqual([{ personIds: ['a', 'b', 'c'], units: 2 }]);
    expect(describeRow(row, people)).toBe('Shared · everyone');
  });

  it('groups hand-entered items by name (any case) and price, after the scanned lines', () => {
    const rows = rowsFromBill(
      bill({
        people: withItems({
          a: [
            { id: '300-a', name: 'Beer', price: 7 },
            { id: '100-a', name: 'Scanned', price: 1, lineId: 'L1' },
          ],
          b: [
            { id: '200-b', name: 'beer ', price: 7 },
            { id: '250-b', name: 'Beer', price: 8 },
          ],
        }),
        scan: { lines: [{ id: 'L1', name: 'Scanned', price: 1, quantity: 1 }] },
      }),
    );
    expect(rows.map((r) => [r.name, r.quantity, r.price])).toEqual([
      ['Scanned', 1, 1],
      ['Beer', 2, 7], // its oldest unit (Bob's, ts 200) puts it before the $8 one
      ['Beer', 1, 8],
    ]);
    expect(rows[1].owned).toEqual({ a: 1, b: 1 });
  });

  it('falls back to grouping when an item points at a line the bill no longer has', () => {
    const rows = rowsFromBill(
      bill({
        people: withItems({ a: [{ id: '1-a', name: 'Soup', price: 5, lineId: 'gone' }] }),
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'Soup', quantity: 1, unassigned: 0 });
  });

  it('grows the quantity rather than go negative when more units exist than were printed', () => {
    const [row] = rowsFromBill(
      bill({
        people: withItems({
          a: [
            { id: '1-a', name: 'Tea', price: 3, lineId: 'L1' },
            { id: '1-b', name: 'Tea', price: 3, lineId: 'L1' },
          ],
        }),
        scan: { lines: [{ id: 'L1', name: 'Tea', price: 3, quantity: 1 }] },
      }),
    );
    expect(row).toMatchObject({ quantity: 2, unassigned: 0 });
  });
});

describe('rowsFromProgress', () => {
  const progress = (patch: Partial<AssignProgress>): AssignProgress => ({
    drafts: [
      { id: 'd1', name: 'Coke', priceText: '2.50', quantity: 3 },
      { id: 'd2', name: 'Pasta', priceText: '18', quantity: 1 },
      { id: 'd3', name: 'Fries', priceText: '4.50', quantity: 2 },
      { id: 'd4', name: 'Pie', priceText: '7', quantity: 1 },
    ],
    index: 0,
    assignments: {},
    unitCounts: {},
    lineMode: {},
    unitPeople: {},
    skipped: {},
    ...patch,
  });

  it('reflects unit counts, single picks, even shares and skips', () => {
    const rows = rowsFromProgress(
      progress({
        unitCounts: { d1: { a: 2 } },
        assignments: { d2: ['b'], d3: ['a', 'c'] },
        lineMode: { d3: 'all' },
        skipped: { d4: true },
      }),
    );
    expect(rows[0]).toMatchObject({ owned: { a: 2 }, unassigned: 1 });
    expect(rows[1]).toMatchObject({ owned: { b: 1 }, unassigned: 0 });
    expect(rows[2]).toMatchObject({ shared: [{ personIds: ['a', 'c'], units: 2 }], unassigned: 0 });
    expect(rows[3].skipped).toBe(true);
    expect(rowWarning(rows[3])).toBe('Skipped — not assigned');
  });

  it('shows a part-shared line as one personal and one shared unit', () => {
    const rows = rowsFromProgress(
      progress({
        drafts: [{ id: 'p', name: 'Pizza', priceText: '12', quantity: 2 }],
        lineMode: { p: 'units' },
        unitPeople: { p: [['a'], ['b', 'c']] },
      }),
    );
    expect(rows[0]).toMatchObject({ owned: { a: 1 }, shared: [{ personIds: ['b', 'c'], units: 1 }], unassigned: 0 });
    expect(describeRow(rows[0], people)).toBe('Alice · Shared · Bob, Cara');
  });

  it('treats an unparseable price as $0 instead of NaN', () => {
    const rows = rowsFromProgress(
      progress({ drafts: [{ id: 'd1', name: 'X', priceText: 'abc', quantity: 1 }] }),
    );
    expect(rows[0].price).toBe(0);
  });
});
