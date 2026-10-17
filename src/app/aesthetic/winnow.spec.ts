import { angularDistance, CELLS, cellIndex, ICell } from './wheel';
import {
  ACCENT_DISTANCE,
  aestheticFor,
  AREA_WEIGHTS,
  contrastBetween,
  distanceBetween,
  FIGURE_WEIGHT,
  IAesthetic,
  isOlive,
  MIN_DISTINCT,
  rank,
  TEXT_CONTRAST,
} from './winnow';

/**
 * The winnowing's promises, held for every primary on the wheel: each has an
 * aesthetic, each aesthetic passes every filter the page lists, and the
 * mapping is a function. The page's prose claims each of these, so each is
 * asserted over all 360 rather than sampled.
 */
describe('winnow', () => {
  const all: IAesthetic[] = CELLS.map((cell) => aestheticFor(cell));

  it('finds an aesthetic for every primary on the wheel', () => {
    expect(all.length).toBe(CELLS.length);
    all.forEach((a, i) => expect(a.primary).toBe(CELLS[i]));
  });

  it('keeps every pair of every aesthetic distinct, and the accent further off the ground', () => {
    for (const a of all) {
      expect(distanceBetween(a.primary, a.secondary)).toBeGreaterThanOrEqual(MIN_DISTINCT);
      expect(distanceBetween(a.secondary, a.tertiary)).toBeGreaterThanOrEqual(MIN_DISTINCT);
      expect(distanceBetween(a.primary, a.tertiary)).toBeGreaterThanOrEqual(ACCENT_DISTANCE);
    }
  });

  it('gives every aesthetic a pair that can carry text, and reports it truthfully', () => {
    for (const a of all) {
      expect(a.text.ratio).toBeGreaterThanOrEqual(TEXT_CONTRAST);
      expect(contrastBetween(a.text.ink, a.text.paper)).toBeCloseTo(a.text.ratio, 12);
      expect(a.text.ink.colour.l).toBeLessThan(a.text.paper.colour.l);
    }
  });

  it('never adds an olive, though a visitor may choose one', () => {
    const olivePrimary = CELLS.find(isOlive) as ICell;
    expect(olivePrimary).toBeTruthy();
    expect(aestheticFor(olivePrimary).primary).toBe(olivePrimary);
    for (const a of all) {
      expect(isOlive(a.secondary)).toBe(false);
      expect(isOlive(a.tertiary)).toBe(false);
    }
  });

  it('is a function: the same primary always gives the same aesthetic', () => {
    const again = aestheticFor(CELLS[123]);
    expect(again.secondary).toBe(all[123].secondary);
    expect(again.tertiary).toBe(all[123].tertiary);
  });

  it('ranks best first, and its first is the aesthetic', () => {
    const top = rank(CELLS[200], 5);
    expect(top.length).toBe(5);
    for (let i = 1; i < top.length; i++) {
      expect(top[i].score).toBeLessThanOrEqual(top[i - 1].score);
    }
    expect(top[0].secondary).toBe(all[200].secondary);
    expect(top[0].tertiary).toBe(all[200].tertiary);
  });

  it('weights the pairs by area, the ground-secondary pair most', () => {
    expect(AREA_WEIGHTS.ps + AREA_WEIGHTS.pt + AREA_WEIGHTS.st).toBeCloseTo(1, 12);
    expect(AREA_WEIGHTS.ps).toBeGreaterThan(AREA_WEIGHTS.pt);
    expect(AREA_WEIGHTS.pt).toBeGreaterThan(AREA_WEIGHTS.st);
  });

  // The shape the sheet of all 360 settled into, stated loosely enough to
  // survive a retuning and tightly enough to catch a collapse back into the
  // failures the header of `winnow.ts` describes.
  it('pairs the ground with its own hue family and sets the accent against it', () => {
    const family = all.filter((a) => angularDistance(a.secondary.h, a.primary.h) <= 45).length;
    const contrasting = all.filter((a) => angularDistance(a.tertiary.h, a.primary.h) >= 90).length;
    expect(family).toBeGreaterThan(0.9 * all.length);
    expect(contrasting).toBeGreaterThan(0.85 * all.length);
  });

  it('does not hand one colour to a large share of the wheel', () => {
    const counts = new Map<ICell, number>();
    for (const a of all) {
      counts.set(a.secondary, (counts.get(a.secondary) ?? 0) + 1);
    }
    // Under the first version one pale blue was the secondary of 68.
    expect(Math.max(...counts.values())).toBeLessThan(30);
    expect(counts.size).toBeGreaterThan(120);
  });

  it('does not hang on the exact figure weight', () => {
    for (const figureWeight of [0.5, 0.8]) {
      const same = CELLS.filter((cell, i) => {
        const other = aestheticFor(cell, { figureWeight });
        return other.secondary === all[i].secondary && other.tertiary === all[i].tertiary;
      }).length;
      expect(same, `weight ${figureWeight} against ${FIGURE_WEIGHT}`).toBeGreaterThanOrEqual(300);
    }
  });

  it('gives a red ground a tint of its own and a cool accent', () => {
    const red = all[cellIndex(4, 3)]; // Bright red
    expect(angularDistance(red.secondary.h, red.primary.h)).toBeLessThanOrEqual(30);
    expect(angularDistance(red.tertiary.h, red.primary.h)).toBeGreaterThan(120);
  });
});
