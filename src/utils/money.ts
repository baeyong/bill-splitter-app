/** No single item costs more than this — anything above is almost surely a typo. */
export const MAX_PRICE = 10_000;
const MAX_PRICE_LABEL = '$10,000';

/** Longest names the inputs accept. Long names otherwise crowd out the amounts. */
export const MAX_PERSON_NAME = 30;
export const MAX_ITEM_NAME = 60;

/**
 * Reads a typed number strictly: digits with at most one decimal point, which
 * may be a comma (iPhones in many regions show "," on the number pad). NaN for
 * anything else — parseFloat would quietly read "4,50" as 4 and "12abc" as 12.
 */
export const parseAmount = (text: string): number => {
  const t = text.trim().replace(',', '.');
  if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return NaN;
  return parseFloat(t);
};

/** A price: a valid amount no higher than MAX_PRICE, else NaN. */
export const parsePrice = (text: string): number => {
  const n = parseAmount(text);
  return n <= MAX_PRICE ? n : NaN;
};

/** What to tell the user about a typed price, or null if it's fine (or empty). */
export const priceError = (text: string): string | null => {
  if (text.trim() === '') return null;
  const n = parseAmount(text);
  if (isNaN(n)) return "That doesn't look like a price.";
  if (n > MAX_PRICE) return `That's over the ${MAX_PRICE_LABEL} limit for one item.`;
  return null;
};
