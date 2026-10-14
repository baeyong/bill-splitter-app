// Reading a receipt with Claude. Everything about the request — model, prompt,
// output schema — lives here on the server, so the app can only ever ask for a
// receipt to be read, never use the key for anything else.
import Anthropic from '@anthropic-ai/sdk';

// Haiku is ~0.1¢ a scan and reads printed receipts well; the app's user
// reviews every line, and All items checks totals against the receipt.
const MODEL = 'claude-haiku-5-5';

// Reading printed text is extraction, not reasoning — low effort keeps the
// scan quick and cheap. Raise it (Haiku's default is medium) before reaching
// for a bigger model if receipts start misreading.
const EFFORT = 'low';

const REQUEST_TIMEOUT_MS = 60_000;

// Structured outputs require `additionalProperties: false` on every object.
const RECEIPT_SCHEMA = {
  type: 'object',
  properties: {
    restaurantName: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          price: { type: 'number' },
          quantity: { type: 'integer' },
        },
        required: ['name', 'price', 'quantity'],
        additionalProperties: false,
      },
    },
    subtotal: { type: 'number' },
    tax: { type: 'number' },
    tip: { type: 'number' },
    total: { type: 'number' },
  },
  required: ['items'],
  additionalProperties: false,
};

const PROMPT = `You are reading a photo of a restaurant receipt. Extract every ordered line item.

Rules:
- "price" is the price of ONE unit, never the line total. A line reading "2 TACOS 9.00" is quantity 2 at price 4.50.
- "quantity" is how many were ordered on that line. Use 1 when the receipt does not say.
- Include food, drinks, sides, and any add-on or modifier that carries its own charge (as its own item).
- Do NOT put subtotal, tax, tip, gratuity, service charge, or the grand total in "items". Report those in their own top-level fields.
- "subtotal" is the item total AFTER comps and item discounts, BEFORE whole-bill discounts, tax, and tip. If the receipt prints its subtotal above the comp or discount lines, subtract those lines from it.
- "tip" covers any tip, gratuity, auto-gratuity, or service charge. If there is more than one, add them together.
- Comped items ("on the house", "comp", "void", 100% off): still include the item, with price 0 and " (on the house)" added to its name. If only some units of a line are comped, split it: the paid units as one item, the comped units as a separate "(on the house)" item at price 0.
- A discount or negative line that applies to one specific item: subtract it from that item instead of listing it separately. "2 BEER 12.00" followed by "HAPPY HOUR -6.00" is quantity 2 at price 3.00.
- A discount on the whole bill (percent off the total, coupon, promo code) is not an item: leave it out of "items".
- Omit "tip" entirely if there is no tip, gratuity, or service charge, or the tip line is blank, dashed, or unfilled.
- Use the item name exactly as printed, minus any leading quantity digits and trailing dot leaders.
- Money values are plain numbers with no currency symbol.
- If the photo is too blurry or is not a receipt, return an empty "items" array.`;

export type ReadResult =
  | { ok: true; receipt: unknown }
  | { ok: false; status: number; error: string };

/** Sends one JPEG (base64) to Claude and returns the receipt JSON it read. */
export const readReceipt = async (apiKey: string, imageBase64: string): Promise<ReadResult> => {
  // One retry covers a transient 429/529 without letting a slow scan run on.
  const client = new Anthropic({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 });

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      output_config: {
        effort: EFFORT,
        format: { type: 'json_schema', schema: RECEIPT_SCHEMA },
      },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    });
  } catch (err) {
    if (err instanceof Anthropic.APIConnectionTimeoutError) {
      return { ok: false, status: 504, error: 'upstream_timeout' };
    }
    if (err instanceof Anthropic.APIConnectionError) {
      return { ok: false, status: 502, error: 'upstream_unreachable' };
    }
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      // The server's key is wrong or revoked — the app can't fix that.
      return { ok: false, status: 500, error: 'server_misconfigured' };
    }
    if (err instanceof Anthropic.RateLimitError) {
      return { ok: false, status: 503, error: 'busy' };
    }
    return { ok: false, status: 502, error: 'upstream_error' };
  }

  // Haiku has no server-side refusal fallback; a safety-classifier decline on
  // a receipt should be very rare.
  if (response.stop_reason === 'refusal') return { ok: false, status: 422, error: 'refused' };
  if (response.stop_reason === 'max_tokens') return { ok: false, status: 422, error: 'too_long' };

  const text = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text;
  if (!text) return { ok: false, status: 502, error: 'bad_output' };
  try {
    return { ok: true, receipt: JSON.parse(text) };
  } catch {
    return { ok: false, status: 502, error: 'bad_output' };
  }
};
