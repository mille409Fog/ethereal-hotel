import { BONUS, STATES } from './places.data';
import { STATES_OUTLINE } from './states.outline';

/**
 * What `scripts/build-outline.mjs` committed. The script runs by hand and CI
 * never fetches, so this is the only check the generated file gets.
 */

/**
 * The most path data the outline may carry, in characters. It is about 9KB
 * today; the ceiling is what makes "roughest" a number. A tolerance turned
 * down for looks will cross it, and the right response is to decide that on
 * purpose here rather than let the route's chunk grow unnoticed.
 */
const OUTLINE_CEILING = 12_000;

/** Absolute moves and lines in whole units, each ring closed: what the script writes. */
const PATH_DATA = /^(M-?\d+ -?\d+(L-?\d+ -?\d+)+Z)+$/;

describe('STATES_OUTLINE', () => {
  const ids = STATES_OUTLINE.shapes.map((shape) => shape.id);

  it('draws every state exactly once, and nothing that is not a state', () => {
    expect(new Set(ids).size, 'a state is drawn twice').toBe(ids.length);
    expect([...ids].sort()).toEqual(STATES.map((state) => state.id).sort());
  });

  it('leaves DC and the territories out, because they are not states', () => {
    // The bonus category is counted on the panel and not drawn: at this scale
    // DC is a speck, and the territories are an ocean away from any inset.
    const drawn = new Set<string>(ids);
    expect(BONUS.filter((place) => drawn.has(place.id))).toEqual([]);
  });

  it('gives every shape path data the script could have written', () => {
    for (const shape of STATES_OUTLINE.shapes) {
      expect(shape.d, shape.id).toMatch(PATH_DATA);
    }
    expect(STATES_OUTLINE.viewBox).toMatch(/^-?\d+ -?\d+ \d+ \d+$/);
  });

  it('stays under its size ceiling', () => {
    const size = STATES_OUTLINE.shapes.reduce((sum, shape) => sum + shape.d.length, 0);
    expect(size).toBeLessThanOrEqual(OUTLINE_CEILING);
  });
});
