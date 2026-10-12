import { fitWidth, MAX_LONG_EDGE, MAX_VISUAL_TOKENS, visualTokens } from '../imageFit';

const heightFor = (w: number, h: number, newW: number) => Math.round((h * newW) / w);

describe('fitWidth', () => {
  it.each([
    ['12MP iPhone photo, portrait', 3024, 4032],
    ['12MP iPhone photo, landscape', 4032, 3024],
    ['48MP photo', 6048, 8064],
    ['long receipt screenshot', 1170, 6000],
    ['very long, narrow scan', 800, 9000],
  ])('%s fits within Claude’s full-detail limits', (_, w, h) => {
    const newW = fitWidth(w, h);
    const newH = heightFor(w, h, newW);
    expect(Math.max(newW, newH)).toBeLessThanOrEqual(MAX_LONG_EDGE);
    expect(visualTokens(newW, newH)).toBeLessThanOrEqual(MAX_VISUAL_TOKENS);
    // …and isn't shrunk further than it has to be: one of the two limits is
    // (nearly) reached — the long edge for tall narrow receipts, tokens otherwise.
    const atEdge = Math.max(newW, newH) >= MAX_LONG_EDGE - 2;
    const atTokens = visualTokens(newW, newH) > MAX_VISUAL_TOKENS * 0.97;
    expect(atEdge || atTokens).toBe(true);
  });

  it('never enlarges a photo that already fits', () => {
    expect(fitWidth(800, 1000)).toBe(800);
    expect(fitWidth(200, 200)).toBe(200);
  });

  it('keeps the shape — only the width is chosen, height follows', () => {
    const w = 3024;
    const h = 4032;
    const newW = fitWidth(w, h);
    expect(heightFor(w, h, newW) / newW).toBeCloseTo(h / w, 2);
  });

  it('gives a normal photo more detail than the old fixed 1400px width', () => {
    expect(fitWidth(3024, 4032)).toBeGreaterThan(1400);
  });
});
