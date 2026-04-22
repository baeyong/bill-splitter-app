import { Bill, PersonBreakdown } from '../types/bill';

export const round2 = (n: number) => Math.round(n * 100) / 100;

export const calculateBreakdown = (bill: Bill): {
  rows: PersonBreakdown[];
  grandSubtotal: number;
  grandTax: number;
  grandTip: number;
  grandTotal: number;
} => {
  const taxRate = bill.taxRatePercent / 100;

  // Global subtotal drives proportional tip when tip is a $ amount.
  const perPersonSubtotals = bill.people.map((person) => {
    const ownItemsTotal = person.items.reduce((sum, item) => sum + item.price, 0);
    const sharedShare = bill.sharedItems.reduce((sum, shared) => {
      if (!shared.personIds.includes(person.id) || shared.personIds.length === 0) {
        return sum;
      }
      return sum + shared.totalPrice / shared.personIds.length;
    }, 0);
    return { person, ownItemsTotal, sharedShare, subtotal: ownItemsTotal + sharedShare };
  });

  const grandSubtotal = perPersonSubtotals.reduce((sum, p) => sum + p.subtotal, 0);

  const rows: PersonBreakdown[] = perPersonSubtotals.map(
    ({ person, ownItemsTotal, sharedShare, subtotal }) => {
      const tax = subtotal * taxRate;
      let tip = 0;
      if (bill.tipMode === 'percent') {
        tip = subtotal * (bill.tipValue / 100);
      } else if (grandSubtotal > 0) {
        tip = bill.tipValue * (subtotal / grandSubtotal);
      }
      const total = subtotal + tax + tip;
      return {
        personId: person.id,
        name: person.name,
        ownItemsTotal: round2(ownItemsTotal),
        sharedShare: round2(sharedShare),
        subtotal: round2(subtotal),
        tax: round2(tax),
        tip: round2(tip),
        total: round2(total),
      };
    },
  );

  const grandTax = round2(rows.reduce((sum, r) => sum + r.tax, 0));
  const grandTip = round2(rows.reduce((sum, r) => sum + r.tip, 0));
  const grandTotal = round2(rows.reduce((sum, r) => sum + r.total, 0));

  return {
    rows,
    grandSubtotal: round2(grandSubtotal),
    grandTax,
    grandTip,
    grandTotal,
  };
};
