import { Bill, PersonBreakdown } from '../types/bill';

export const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Rounds each value to cents so the results still add up to the rounded sum.
 * Plain rounding loses or invents cents — three people sharing $10 would each
 * owe $3.33 and the bill would come to $9.99. The leftover cents go to the
 * values that lost the most to rounding; ties go to whoever is listed first.
 */
export const roundPreservingSum = (values: number[]): number[] => {
  // The epsilon keeps float noise (4.35 * 100 = 434.9999…) from costing a cent.
  const cents = values.map((v) => v * 100);
  const out = cents.map((c) => Math.floor(c + 1e-6));
  let left = Math.round(cents.reduce((a, b) => a + b, 0)) - out.reduce((a, b) => a + b, 0);
  const byRemainder = cents
    .map((c, i) => ({ i, r: c - out[i] }))
    .sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of byRemainder) {
    if (left <= 0) break;
    out[i] += 1;
    left -= 1;
  }
  return out.map((c) => c / 100);
};

/** "8.875%", or "$3.00" when the bill uses a fixed tax amount. */
export const describeTax = (bill: Bill): string =>
  bill.taxMode === 'amount' ? `$${(bill.taxAmount ?? 0).toFixed(2)}` : `${bill.taxRatePercent}%`;

export const calculateBreakdown = (bill: Bill): {
  rows: PersonBreakdown[];
  grandSubtotal: number;
  grandTax: number;
  grandTip: number;
  grandTotal: number;
} => {

  const ownTotals = bill.people.map((person) =>
    round2(person.items.reduce((sum, item) => sum + item.price, 0)),
  );
  const sharedShares = roundPreservingSum(
    bill.people.map((person) =>
      bill.sharedItems.reduce((sum, shared) => {
        if (!shared.personIds.includes(person.id) || shared.personIds.length === 0) {
          return sum;
        }
        return sum + shared.totalPrice / shared.personIds.length;
      }, 0),
    ),
  );
  const subtotals = ownTotals.map((own, i) => round2(own + sharedShares[i]));

  // Global subtotal drives proportional tip when tip is a $ amount.
  const grandSubtotal = round2(subtotals.reduce((sum, s) => sum + s, 0));

  // Each column is rounded as a whole, so every person's line adds up and the
  // people add up to the grand total — no stray cents anywhere.
  const taxes = roundPreservingSum(
    subtotals.map((s) => {
      if (bill.taxMode === 'amount') {
        return grandSubtotal > 0 ? (bill.taxAmount ?? 0) * (s / grandSubtotal) : 0;
      }
      return s * (bill.taxRatePercent / 100);
    }),
  );
  const tips = roundPreservingSum(
    subtotals.map((s) => {
      if (bill.tipMode === 'percent') return s * (bill.tipValue / 100);
      return grandSubtotal > 0 ? bill.tipValue * (s / grandSubtotal) : 0;
    }),
  );

  const rows: PersonBreakdown[] = bill.people.map((person, i) => ({
    personId: person.id,
    name: person.name,
    ownItemsTotal: ownTotals[i],
    sharedShare: sharedShares[i],
    subtotal: subtotals[i],
    tax: taxes[i],
    tip: tips[i],
    total: round2(subtotals[i] + taxes[i] + tips[i]),
  }));

  const grandTax = round2(taxes.reduce((sum, t) => sum + t, 0));
  const grandTip = round2(tips.reduce((sum, t) => sum + t, 0));
  const grandTotal = round2(rows.reduce((sum, r) => sum + r.total, 0));

  return { rows, grandSubtotal, grandTax, grandTip, grandTotal };
};
