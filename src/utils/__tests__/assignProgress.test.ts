import { AssignProgress } from '../../types/scan';
import {
  countsFromUnits,
  forPeople,
  progressToBill,
  resizeUnits,
  unitsFromCounts,
  unitsFromShared,
} from '../assignProgress';

const progress = (patch: Partial<AssignProgress>): AssignProgress => ({
  drafts: [
    { id: 'd1', name: 'Coke', priceText: '2.50', quantity: 3 },
    { id: 'd2', name: ' Pasta ', priceText: '18', quantity: 1 },
    { id: 'd3', name: 'Fries', priceText: '4.50', quantity: 2 },
  ],
  index: 0,
  assignments: {},
  unitCounts: {},
  lineMode: {},
  unitPeople: {},
  skipped: {},
  ...patch,
});

describe('progressToBill', () => {
  it('hands out "Alice 2, Bob 1" as one unit each', () => {
    const { entries } = progressToBill(
      progress({ unitCounts: { d1: { a: 2, b: 1 } }, skipped: { d2: true, d3: true } }),
    );
    expect(entries).toEqual([
      { name: 'Coke', price: 2.5, personIds: ['a'], lineId: 'd1' },
      { name: 'Coke', price: 2.5, personIds: ['a'], lineId: 'd1' },
      { name: 'Coke', price: 2.5, personIds: ['b'], lineId: 'd1' },
    ]);
  });

  it('a multi-unit line shared evenly gives every unit to the whole group', () => {
    const { entries } = progressToBill(
      progress({
        assignments: { d3: ['a', 'b'] },
        lineMode: { d3: 'all' },
        skipped: { d1: true, d2: true },
      }),
    );
    expect(entries).toEqual([
      { name: 'Fries', price: 4.5, personIds: ['a', 'b'], lineId: 'd3' },
      { name: 'Fries', price: 4.5, personIds: ['a', 'b'], lineId: 'd3' },
    ]);
  });

  it('ignores stale picks from the other mode', () => {
    // Picked people, then switched the line to per-unit — only unit counts count.
    const { entries } = progressToBill(
      progress({ assignments: { d1: ['a', 'b'] }, skipped: { d2: true, d3: true } }),
    );
    expect(entries).toEqual([]);
  });

  it('trims names and keeps every line — skipped and unassigned ones too', () => {
    const { entries, lines } = progressToBill(
      progress({ assignments: { d2: ['b'] }, skipped: { d1: true } }),
    );
    expect(entries).toEqual([{ name: 'Pasta', price: 18, personIds: ['b'], lineId: 'd2' }]);
    expect(lines).toEqual([
      { id: 'd1', name: 'Coke', price: 2.5, quantity: 3 },
      { id: 'd2', name: 'Pasta', price: 18, quantity: 1 },
      { id: 'd3', name: 'Fries', price: 4.5, quantity: 2 },
    ]);
  });

  it('skipping every line adds nothing but still records the receipt', () => {
    const { entries, lines } = progressToBill(
      progress({ skipped: { d1: true, d2: true, d3: true } }),
    );
    expect(entries).toEqual([]);
    expect(lines).toHaveLength(3);
  });

  it('drops a line whose price was edited into something unreadable', () => {
    const { entries, lines } = progressToBill(
      progress({
        drafts: [
          { id: 'd1', name: 'Soup', priceText: 'abc', quantity: 1 },
          { id: 'd2', name: 'Salad', priceText: '-3', quantity: 1 },
        ],
        assignments: { d1: ['a'], d2: ['a'] },
      }),
    );
    expect(entries).toEqual([]);
    expect(lines).toEqual([]);
  });
});

describe('forPeople', () => {
  it('drops picks for people no longer on the bill and keeps the rest', () => {
    const saved = progress({
      index: 2,
      assignments: { d2: ['a', 'gone'] },
      unitCounts: { d1: { a: 1, gone: 2 } },
      skipped: { d3: true },
    });
    const restored = forPeople(saved, new Set(['a', 'b']));
    expect(restored.assignments).toEqual({ d2: ['a'] });
    expect(restored.unitCounts).toEqual({ d1: { a: 1 } });
    expect(restored.index).toBe(2);
    expect(restored.skipped).toEqual({ d3: true });
  });
});

describe('part-shared lines ("units" mode)', () => {
  const pizza = (patch: Partial<AssignProgress>) =>
    progress({
      drafts: [{ id: 'p', name: 'Pizza', priceText: '12', quantity: 2 }],
      lineMode: { p: 'units' },
      ...patch,
    });

  it('one personal pizza and one shared pizza become an Item and a SharedItem', () => {
    const { entries } = progressToBill(pizza({ unitPeople: { p: [['a'], ['b', 'c']] } }));
    expect(entries).toEqual([
      { name: 'Pizza', price: 12, personIds: ['a'], lineId: 'p' },
      { name: 'Pizza', price: 12, personIds: ['b', 'c'], lineId: 'p' },
    ]);
  });

  it('leaves a unit nobody was picked for unassigned', () => {
    const { entries } = progressToBill(pizza({ unitPeople: { p: [['a'], []] } }));
    expect(entries).toHaveLength(1);
  });

  it('follows the quantity if it changes after picking', () => {
    const { entries } = progressToBill(
      pizza({
        drafts: [{ id: 'p', name: 'Pizza', priceText: '12', quantity: 1 }],
        unitPeople: { p: [['a'], ['b', 'c']] },
        assignments: { p: ['a'] },
      }),
    );
    // Quantity 1 is always picked as one group, whatever mode was set.
    expect(entries).toEqual([{ name: 'Pizza', price: 12, personIds: ['a'], lineId: 'p' }]);
  });

  it('drops a removed person from a shared unit but keeps the rest', () => {
    const restored = forPeople(pizza({ unitPeople: { p: [['a'], ['b', 'gone']] } }), new Set(['a', 'b']));
    expect(restored.unitPeople.p).toEqual([['a'], ['b']]);
  });
});

describe('switching modes keeps what was picked', () => {
  it('one-each counts become per-unit picks and back', () => {
    const units = unitsFromCounts(3, { a: 2, b: 1 });
    expect(units).toEqual([['a'], ['a'], ['b']]);
    expect(countsFromUnits(units)).toEqual({ a: 2, b: 1 });
  });

  it('going back to one-each drops only the shared units', () => {
    expect(countsFromUnits([['a'], ['b', 'c']])).toEqual({ a: 1 });
  });

  it('pads unpicked units and trims extras', () => {
    expect(unitsFromCounts(3, { a: 1 })).toEqual([['a'], [], []]);
    expect(resizeUnits([['a'], ['b'], ['c']], 2)).toEqual([['a'], ['b']]);
  });

  it('all-shared becomes the same group on every unit', () => {
    expect(unitsFromShared(2, ['a', 'b'])).toEqual([['a', 'b'], ['a', 'b']]);
  });
});
