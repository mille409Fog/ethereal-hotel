import { CONTINENTS_OUTLINE } from './continents.outline';
import type { IOutline } from './outline';
import { BONUS, CONTINENTS, STATES, type IPlace } from './places.data';
import { STATES_OUTLINE } from './states.outline';

/**
 * What `scripts/build-outline.mjs` committed. The script runs by hand and CI
 * never fetches, so this is the only check the generated files get, and every
 * outline is held to the same rules.
 */

/**
 * The most path data an outline may carry, in characters. Each is about 9KB
 * today; the ceiling is what makes "roughest" a number. A tolerance turned
 * down for looks will cross it, and the right response is to decide that on
 * purpose here rather than let the route's chunk grow unnoticed.
 */
const OUTLINE_CEILING = 12_000;

/** Absolute moves and lines in whole units, each ring closed: what the script writes. */
const PATH_DATA = /^(M-?\d+ -?\d+(L-?\d+ -?\d+)+Z)+$/;

interface IOutlineCase {
  readonly name: string;
  readonly outline: IOutline;
  readonly places: readonly IPlace[];
}

const OUTLINES: readonly IOutlineCase[] = [
  { name: 'STATES_OUTLINE', outline: STATES_OUTLINE, places: STATES },
  { name: 'CONTINENTS_OUTLINE', outline: CONTINENTS_OUTLINE, places: CONTINENTS },
];

for (const { name, outline, places } of OUTLINES) {
  describe(name, () => {
    const ids = outline.shapes.map((shape) => shape.id);

    it('draws every place exactly once, and nothing that is not one', () => {
      expect(new Set(ids).size, 'a place is drawn twice').toBe(ids.length);
      expect([...ids].sort()).toEqual(places.map((place) => place.id).sort());
    });

    it('gives every shape path data the script could have written', () => {
      for (const shape of outline.shapes) {
        expect(shape.d, shape.id).toMatch(PATH_DATA);
      }
      expect(outline.viewBox).toMatch(/^-?\d+ -?\d+ \d+ \d+$/);
    });

    it('stays under its size ceiling', () => {
      const size = outline.shapes.reduce((sum, shape) => sum + shape.d.length, 0);
      expect(size).toBeLessThanOrEqual(OUTLINE_CEILING);
    });
  });
}

describe('STATES_OUTLINE', () => {
  it('leaves DC and the territories out, because they are not states', () => {
    // The bonus category is counted on the panel and not drawn: at this scale
    // DC is a speck, and the territories are an ocean away from any inset.
    const drawn = new Set<string>(STATES_OUTLINE.shapes.map((shape) => shape.id));
    expect(BONUS.filter((place) => drawn.has(place.id))).toEqual([]);
  });
});
