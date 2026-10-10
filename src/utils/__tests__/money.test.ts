import { parseAmount, parsePrice, priceError } from '../money';

describe('parseAmount', () => {
  it.each([
    ['12', 12],
    ['4.50', 4.5],
    ['4,50', 4.5], // comma decimal keypad
    [' 5 ', 5],
    ['.5', 0.5],
    ['5.', 5],
    ['0', 0],
  ])('reads %j as %d', (text, expected) => {
    expect(parseAmount(text)).toBe(expected);
  });

  it.each(['', '.', 'abc', '12abc', '1.2.3', '1,2,3', '1e3', '-3', 'Infinity', '$5', '1 000'])(
    'rejects %j',
    (text) => {
      expect(parseAmount(text)).toBeNaN();
    },
  );
});

describe('parsePrice', () => {
  it('allows up to the $10,000 limit and no further', () => {
    expect(parsePrice('10000')).toBe(10000);
    expect(parsePrice('10000.01')).toBeNaN();
    expect(parsePrice('45000')).toBeNaN();
  });
});

describe('priceError', () => {
  it('says nothing while the box is empty or the price is fine', () => {
    expect(priceError('')).toBeNull();
    expect(priceError('  ')).toBeNull();
    expect(priceError('4,50')).toBeNull();
  });

  it('explains a bad or too-big price', () => {
    expect(priceError('12abc')).toBe("That doesn't look like a price.");
    expect(priceError('45000')).toBe("That's over the $10,000 limit for one item.");
  });
});
