import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';
import { SavedReceipt } from '../../types/bill';
import { BillProvider, useBill } from '../BillContext';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const PREFS_KEY = 'bill-splitter:prefs:v1';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <BillProvider>{children}</BillProvider>
);

/** Renders the context with NY 8.875% saved as the default. */
const setup = async () => {
  await AsyncStorage.setItem(PREFS_KEY, JSON.stringify({ stateCode: 'NY', taxRatePercent: 8.875 }));
  const hook = await renderHook(() => useBill(), { wrapper });
  await waitFor(() => expect(hook.result.current.prefsLoaded).toBe(true));
  return hook;
};

const storedPrefs = async () => JSON.parse((await AsyncStorage.getItem(PREFS_KEY)) ?? 'null');

const addPeople = async (result: { current: ReturnType<typeof useBill> }, names: string[]) => {
  await act(() => result.current.setPeople(names));
  return Object.fromEntries(result.current.bill.people.map((p) => [p.name, p.id]));
};

beforeEach(() => AsyncStorage.clear());

describe('tax defaults', () => {
  it('starts a bill from the saved state rate', async () => {
    const { result } = await setup();
    expect(result.current.bill).toMatchObject({ stateCode: 'NY', taxRatePercent: 8.875 });
    expect(result.current.bill).toMatchObject({ tipMode: 'percent', tipValue: 18 });
  });

  it('receipt tax is used as the exact amount, for this bill only', async () => {
    const { result } = await setup();
    await act(() => result.current.applyReceiptTax(3));
    expect(result.current.bill).toMatchObject({ taxMode: 'amount', taxAmount: 3 });
    expect(result.current.savedTax.taxRatePercent).toBe(8.875);
    expect((await storedPrefs()).taxRatePercent).toBe(8.875);

    await act(() => result.current.resetBill());
    expect(result.current.bill.taxMode).toBeUndefined();
    expect(result.current.bill.taxRatePercent).toBe(8.875);
  });

  it('ignores a receipt tax that is not a real amount', async () => {
    const { result } = await setup();
    await act(() => result.current.applyReceiptTax(NaN));
    expect(result.current.bill.taxMode).toBeUndefined();
  });

  it('tax edited on Summary changes this bill, never the saved default', async () => {
    const { result } = await setup();
    await act(() => result.current.setBillTax({ taxRatePercent: 5 }));
    expect(result.current.bill.taxRatePercent).toBe(5);
    await act(() => result.current.setBillTax({ taxMode: 'amount', taxAmount: 4.2 }));
    expect(result.current.bill).toMatchObject({ taxMode: 'amount', taxAmount: 4.2 });
    expect(result.current.savedTax.taxRatePercent).toBe(8.875);
    expect((await storedPrefs()).taxRatePercent).toBe(8.875);
  });

  it('a rate set in Settings becomes the saved default', async () => {
    const { result } = await setup();
    await act(() => result.current.setTaxRatePercent(6));
    expect(result.current.savedTax.taxRatePercent).toBe(6);
    await waitFor(async () => expect((await storedPrefs()).taxRatePercent).toBe(6));
  });

  it('picking a state resets the rate to that state’s', async () => {
    const { result } = await setup();
    await act(() => result.current.setTaxRatePercent(6));
    await act(() => result.current.setStateCode('NY'));
    expect(result.current.savedTax).toEqual({ stateCode: 'NY', taxRatePercent: 8.875 });
  });

  it('editing an old receipt never changes the saved default', async () => {
    const { result } = await setup();
    const receipt: SavedReceipt = {
      id: 'r1',
      createdAt: 0,
      bill: {
        stateCode: 'CA',
        taxRatePercent: 7.25,
        tipMode: 'amount',
        tipValue: 10,
        taxMode: 'amount',
        taxAmount: 0.4,
        people: [{ id: 'p', name: 'Pat', items: [{ id: 'i', name: 'Soup', price: 5 }] }],
        sharedItems: [],
      },
      breakdown: [],
      grandSubtotal: 5,
      grandTax: 0,
      grandTip: 10,
      grandTotal: 15,
    };
    await act(() => result.current.loadFromReceipt(receipt));
    expect(result.current.bill).toMatchObject({
      stateCode: 'CA',
      taxRatePercent: 7.25,
      taxMode: 'amount',
      taxAmount: 0.4,
    });
    // Same fields in the same order, so Summary's unsaved-changes check
    // (a JSON comparison) starts out clean.
    expect(JSON.stringify(result.current.bill)).toBe(JSON.stringify(receipt.bill));
    expect(result.current.editingReceiptId).toBe('r1');

    await act(() => result.current.setTaxRatePercent(9));
    expect(result.current.bill.taxRatePercent).toBe(9);
    expect(result.current.savedTax).toEqual({ stateCode: 'NY', taxRatePercent: 8.875 });
    expect(await storedPrefs()).toEqual({ stateCode: 'NY', taxRatePercent: 8.875 });

    await act(() => result.current.resetBill());
    expect(result.current.editingReceiptId).toBeNull();
    expect(result.current.bill).toMatchObject({ stateCode: 'NY', taxRatePercent: 8.875 });
  });
});

describe('resetBill', () => {
  it('clears people, items, scan, photo and tip', async () => {
    const { result } = await setup();
    const ids = await addPeople(result, ['Alice']);
    await act(() => {
      result.current.addItem(ids.Alice, 'Soup', 5);
      result.current.setTipValue(25);
      result.current.setPendingScan({
        imageUri: 'file://r.jpg',
        scanning: false,
        result: { items: [] },
      });
    });
    await act(() => result.current.applyScannedItems([], []));
    expect(result.current.scanPhotoUri).toBe('file://r.jpg');

    await act(() => result.current.resetBill());
    expect(result.current.bill.people).toEqual([]);
    expect(result.current.bill.scan).toBeUndefined();
    expect(result.current.bill.tipValue).toBe(18);
    expect(result.current.scanPhotoUri).toBeNull();
    expect(result.current.pendingScan).toBeNull();
  });
});

describe('setPeople', () => {
  it('removing someone drops them from every shared item', async () => {
    const { result } = await setup();
    const ids = await addPeople(result, ['Alice', 'Bob', 'Cara']);
    await act(() => result.current.addSharedItem('Nachos', 12, [ids.Alice, ids.Bob, ids.Cara]));
    await act(() => result.current.setPeople(['Alice', 'Cara']));
    expect(result.current.bill.sharedItems[0].personIds).toEqual([ids.Alice, ids.Cara]);
  });
});

describe('applyScannedItems', () => {
  it('turns one owner into an Item, several into a SharedItem, and keeps the receipt', async () => {
    const { result } = await setup();
    const ids = await addPeople(result, ['Alice', 'Bob']);
    await act(() =>
      result.current.setPendingScan({
        imageUri: 'file://r.jpg',
        scanning: false,
        result: {
          restaurantName: "Joe's",
          items: [],
          subtotal: 11,
          tax: 1,
          total: 12,
        },
      }),
    );
    await act(() =>
      result.current.applyScannedItems(
        [
          { name: 'Burger', price: 9, personIds: [ids.Alice], lineId: 'L1' },
          { name: 'Fries', price: 2, personIds: [ids.Alice, ids.Bob], lineId: 'L2' },
          { name: 'Ghost', price: 1, personIds: ['nobody'], lineId: 'L3' },
        ],
        [
          { id: 'L1', name: 'Burger', price: 9, quantity: 1 },
          { id: 'L2', name: 'Fries', price: 2, quantity: 1 },
          { id: 'L3', name: 'Ghost', price: 1, quantity: 1 },
        ],
      ),
    );

    const { bill } = result.current;
    const alice = bill.people.find((p) => p.id === ids.Alice)!;
    expect(alice.items).toMatchObject([{ name: 'Burger', price: 9, lineId: 'L1' }]);
    expect(bill.sharedItems).toMatchObject([
      { name: 'Fries', totalPrice: 2, personIds: [ids.Alice, ids.Bob], lineId: 'L2' },
    ]);
    // An unknown person is dropped, but the printed line stays on the receipt.
    expect(bill.scan?.lines.map((l) => l.id)).toEqual(['L1', 'L2', 'L3']);
    expect(bill.scan).toMatchObject({ restaurantName: "Joe's", subtotal: 11, tax: 1, total: 12 });
    expect(result.current.pendingScan).toBeNull();
    expect(result.current.scanPhotoUri).toBe('file://r.jpg');
  });
});

describe('changeLine', () => {
  const scanned = async () => {
    const hook = await setup();
    const { result } = hook;
    const ids = await addPeople(result, ['Alice', 'Bob']);
    await act(() =>
      result.current.setPendingScan({ imageUri: 'x', scanning: false, result: { items: [] } }),
    );
    await act(() =>
      result.current.applyScannedItems(
        [
          { name: 'Coke', price: 2.5, personIds: [ids.Alice], lineId: 'L1' },
          { name: 'Coke', price: 2.5, personIds: [ids.Alice], lineId: 'L1' },
        ],
        [
          { id: 'L1', name: 'Coke', price: 2.5, quantity: 2 },
          { id: 'L2', name: 'Pie', price: 7, quantity: 1 },
        ],
      ),
    );
    const refs = result.current.bill.people
      .find((p) => p.id === ids.Alice)!
      .items.map((i) => ({ kind: 'item' as const, personId: ids.Alice, id: i.id }));
    return { ...hook, ids, refs };
  };

  it('moves a unit to someone else and corrects the printed line', async () => {
    const { result, ids, refs } = await scanned();
    await act(() =>
      result.current.changeLine({
        remove: refs,
        add: [
          { name: 'Diet Coke', price: 3, personIds: [ids.Alice], lineId: 'L1' },
          { name: 'Diet Coke', price: 3, personIds: [ids.Bob], lineId: 'L1' },
        ],
        scanLine: { id: 'L1', next: { id: 'L1', name: 'Diet Coke', price: 3, quantity: 2 } },
      }),
    );
    const { bill } = result.current;
    expect(bill.people.map((p) => p.items.map((i) => i.name))).toEqual([['Diet Coke'], ['Diet Coke']]);
    expect(bill.scan?.lines[0]).toEqual({ id: 'L1', name: 'Diet Coke', price: 3, quantity: 2 });
    expect(bill.scan?.lines[1].name).toBe('Pie');
  });

  it('turning a line into a shared one makes SharedItems', async () => {
    const { result, ids, refs } = await scanned();
    await act(() =>
      result.current.changeLine({
        remove: refs,
        add: [
          { name: 'Coke', price: 2.5, personIds: [ids.Alice, ids.Bob], lineId: 'L1' },
          { name: 'Coke', price: 2.5, personIds: [ids.Alice, ids.Bob], lineId: 'L1' },
        ],
      }),
    );
    expect(result.current.bill.people.every((p) => p.items.length === 0)).toBe(true);
    expect(result.current.bill.sharedItems).toHaveLength(2);
  });

  it('removing a line takes it off the receipt too', async () => {
    const { result, refs } = await scanned();
    await act(() =>
      result.current.changeLine({ remove: refs, add: [], scanLine: { id: 'L1', next: null } }),
    );
    expect(result.current.bill.people.every((p) => p.items.length === 0)).toBe(true);
    expect(result.current.bill.scan?.lines.map((l) => l.id)).toEqual(['L2']);
  });

  it('adds a missing hand-entered item without touching the receipt lines', async () => {
    const { result, ids } = await scanned();
    await act(() =>
      result.current.changeLine({
        remove: [],
        add: [{ name: 'Bread', price: 4, personIds: [ids.Bob] }],
      }),
    );
    const bob = result.current.bill.people.find((p) => p.id === ids.Bob)!;
    expect(bob.items).toMatchObject([{ name: 'Bread', price: 4 }]);
    expect(bob.items[0].lineId).toBeUndefined();
    expect(result.current.bill.scan?.lines).toHaveLength(2);
  });
});
