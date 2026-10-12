// The largest image Claude reads at full detail (the vision docs' high-resolution
// tier, Claude 4.7 and later): 2576px on the long edge and 4784 visual tokens,
// one per 28×28px patch. Anything bigger is shrunk again on Anthropic's side,
// and two rounds of shrinking blur small print.
export const MAX_LONG_EDGE = 2576;
export const MAX_VISUAL_TOKENS = 4784;
const PATCH = 28;

export const visualTokens = (width: number, height: number) =>
  Math.ceil(width / PATCH) * Math.ceil(height / PATCH);

/**
 * The width to resize a photo to so Claude sees it at full detail without
 * shrinking it again — or the original width when it already fits. Never
 * enlarges, and the caller resizes by width only, so the aspect ratio is kept.
 */
export const fitWidth = (width: number, height: number): number => {
  let scale = Math.min(
    1,
    MAX_LONG_EDGE / Math.max(width, height),
    Math.sqrt((MAX_VISUAL_TOKENS * PATCH * PATCH) / (width * height)),
  );
  const fits = (s: number) =>
    visualTokens(Math.round(width * s), Math.round(height * s)) <= MAX_VISUAL_TOKENS;
  // Patches round up, so the area-based scale can land a token or two over.
  while (scale < 1 && !fits(scale)) scale *= 0.99;
  return Math.round(width * scale);
};
