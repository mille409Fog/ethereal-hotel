import { angularDistance, CELLS, cellIndex, hueName, ICell, isNeutral, TONES } from './wheel';
import {
  ACCENT_DISTANCE,
  aestheticFor,
  AREA_WEIGHTS,
  contrastBetween,
  CVD_CHECKED,
  cvdDistanceBetween,
  distanceBetween,
  FIGURE_WEIGHT,
  IAesthetic,
  isOlive,
  MIN_DISTINCT,
  rank,
  relationOf,
  TEXT_CONTRAST,
  VARIATION_DIFFERENCE,
  VARIATION_FLOOR,
  variations,
} from './winnow';

/**
 * The winnowing's promises, held for every primary on the wheel: each has an
 * aesthetic, each aesthetic passes every filter the page lists, and the
 * mapping is a function. The page's prose claims each of these, so each is
 * asserted over every cell rather than sampled.
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

  it('keeps every accent distinct from its ground and panel for every deficiency', () => {
    for (const a of all) {
      for (const deficiency of CVD_CHECKED) {
        expect(cvdDistanceBetween(a.primary, a.tertiary, deficiency)).toBeGreaterThanOrEqual(
          MIN_DISTINCT
        );
        expect(cvdDistanceBetween(a.secondary, a.tertiary, deficiency)).toBeGreaterThanOrEqual(
          MIN_DISTINCT
        );
      }
    }
    expect(CVD_CHECKED).toEqual(['protanopia', 'deuteranopia', 'tritanopia']);
  });

  // The charcoal ring only: it is where the unchecked accents vanished (pale
  // cyan on chalk), and the whole wheel through the uncached path is slow.
  it('needs that filter: without it, an accent vanishes for deuteranopia', () => {
    const charcoal = CELLS.filter((cell) => cell.toneIndex === 0);
    const unchecked = charcoal.map((cell) => aestheticFor(cell, { deficiencies: [] }));
    const lost = unchecked.filter(
      (a) =>
        Math.min(
          cvdDistanceBetween(a.primary, a.tertiary, 'deuteranopia'),
          cvdDistanceBetween(a.secondary, a.tertiary, 'deuteranopia')
        ) < MIN_DISTINCT
    );
    expect(lost.length).toBeGreaterThan(0);
  });

  it('makes every accent a colour, and a colourful one', () => {
    for (const a of all) {
      expect(isNeutral(a.tertiary), a.primary.name).toBe(false);
    }
    // Before the accent's hue weight kept rising past 0.08, 201 of 480
    // accents were pastels under chroma 0.1.
    const pastel = all.filter((a) => a.tertiary.colour.c < 0.1).length;
    expect(pastel).toBeLessThan(0.05 * all.length);
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

  // The shape the sheet of the whole wheel settled into, stated loosely
  // enough to survive a retuning and tightly enough to catch a collapse back
  // into the failures the header of `winnow.ts` describes.
  it('pairs the ground with its own hue family and sets the accent against it', () => {
    const family = all.filter((a) => angularDistance(a.secondary.h, a.primary.h) <= 45).length;
    const contrasting = all.filter((a) => angularDistance(a.tertiary.h, a.primary.h) >= 90).length;
    expect(family).toBeGreaterThan(0.9 * all.length);
    expect(contrasting).toBeGreaterThan(0.85 * all.length);
  });

  // Over the colour primaries only. The sixty chalks are near enough the same
  // white that their partners converge, and that is not the collapse this
  // guards against: one colour taking over aesthetics built on colours.
  it('does not hand one colour to a large share of the colour primaries', () => {
    const counts = new Map<ICell, number>();
    for (const a of all.filter((x) => !isNeutral(x.primary))) {
      counts.set(a.secondary, (counts.get(a.secondary) ?? 0) + 1);
    }
    // Under the first version one pale blue was the secondary of 68 of 360.
    expect(Math.max(...counts.values())).toBeLessThan(20);
    expect(counts.size).toBeGreaterThan(120);
  });

  it('turns a neutral ground’s accent with its tint', () => {
    const charcoal = all.filter((a) => a.primary.toneIndex === 0);
    for (const a of charcoal) {
      expect(isNeutral(a.tertiary)).toBe(false);
      expect(angularDistance(a.tertiary.h, a.primary.h)).toBeGreaterThanOrEqual(90);
    }
    // Before the tint counted, every charcoal had a pale cyan or periwinkle.
    expect(new Set(charcoal.map((a) => hueName(a.tertiary.h))).size).toBeGreaterThanOrEqual(6);
  });

  // Two more full passes over the wheel, each about a second uninstrumented;
  // coverage slows them several times over, past the default 5s. The pair took
  // 11s here under coverage and passed 30s on CI, which runs several times slower.
  it('does not hang on the exact figure weight', { timeout: 60_000 }, () => {
    for (const figureWeight of [0.5, 0.8]) {
      const same = CELLS.filter((cell, i) => {
        const other = aestheticFor(cell, { figureWeight });
        return other.secondary === all[i].secondary && other.tertiary === all[i].tertiary;
      }).length;
      expect(same, `weight ${figureWeight} against ${FIGURE_WEIGHT}`).toBeGreaterThanOrEqual(
        0.75 * CELLS.length
      );
    }
  });

  describe('the varied set', () => {
    const sets = CELLS.map((cell) => variations(cell));

    it('starts every set with the aesthetic itself', () => {
      sets.forEach((set, i) => {
        expect(set[0].aesthetic.secondary).toBe(all[i].secondary);
        expect(set[0].aesthetic.tertiary).toBe(all[i].tertiary);
      });
    });

    it('keeps every member good enough and different enough, and labels it truly', () => {
      for (const set of sets) {
        const top = set[0].aesthetic.score;
        expect(new Set(set.map((v) => v.structure)).size).toBe(set.length);
        set.forEach((v, i) => {
          const a = v.aesthetic;
          expect(top - a.score).toBeLessThanOrEqual(VARIATION_FLOOR + 1e-12);
          expect(v.structure).toBe(
            v.structure === 'neutral partner'
              ? 'neutral partner'
              : relationOf(a.primary, a.tertiary)
          );
          if (v.structure === 'neutral partner') {
            expect(isNeutral(a.secondary)).toBe(true);
          }
          for (const earlier of set.slice(0, i)) {
            const d =
              distanceBetween(a.secondary, earlier.aesthetic.secondary) +
              distanceBetween(a.tertiary, earlier.aesthetic.tertiary);
            expect(d).toBeGreaterThanOrEqual(VARIATION_DIFFERENCE);
          }
        });
      }
    });

    // The point of the set: not the best five, which are one cell apart.
    it('offers most primaries at least three structures to choose among', () => {
      const three = sets.filter((s) => s.length >= 3).length;
      expect(three).toBeGreaterThan(0.85 * sets.length);
      expect(sets.every((s) => s.length >= 2)).toBe(true);
    });
  });

  // The magenta corner: at sRGB's gamut peak, the tonal partner sat outside
  // the chroma range Ou & Luo's data covers and lost to chalk, and the accent
  // was the olive one degree outside the old band.
  it('gives the magenta corner a tint of its own, like the rest of its row', () => {
    const bright = TONES.findIndex((t) => t.name === 'Bright');
    for (const hue of [54, 55, 56]) {
      const a = all[cellIndex(hue, bright)];
      expect(isNeutral(a.secondary), a.primary.name).toBe(false);
      expect(angularDistance(a.secondary.h, a.primary.h)).toBeLessThanOrEqual(30);
    }
  });

  it('gives a red ground a tint of its own and a cool accent', () => {
    const red =
      all[
        cellIndex(
          4,
          TONES.findIndex((t) => t.name === 'Bright')
        )
      ];
    expect(angularDistance(red.secondary.h, red.primary.h)).toBeLessThanOrEqual(30);
    expect(angularDistance(red.tertiary.h, red.primary.h)).toBeGreaterThan(120);
  });
});
