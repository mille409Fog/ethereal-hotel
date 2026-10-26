import { CONTINENTS_OUTLINE } from './continents.outline';
import { COUNTRIES_OUTLINE } from './countries.outline';
import type { IOutline } from './outline';
import { BONUS, CONTINENTS, COUNTRIES, STATES, type IPlace } from './places.data';
import { STATES_OUTLINE } from './states.outline';

/**
 * What `scripts/build-outline.mjs` committed. The script runs by hand and CI
 * never fetches, so this is the only check the generated files get, and every
 * outline is held to the same rules.
 */

/** Absolute moves and lines in whole units, each ring closed: what the script writes. */
const PATH_DATA = /^(M-?\d+ -?\d+(L-?\d+ -?\d+)+Z)+$/;

/**
 * The countries Natural Earth's 1:110m file cannot draw: 29 it does not carry
 * at that scale, then the Bahamas, Luxembourg, Vanuatu and Palestine, which it
 * does but which rounding collapses below a triangle. Held exactly, so a
 * regenerated file that loses one more fails here, and one that gains one
 * says so too.
 */
const UNDRAWN_COUNTRIES = [
  ...['AD', 'AG', 'BH', 'BB', 'CV', 'KM', 'DM', 'GD', 'KI', 'LI', 'MV', 'MT', 'MH', 'MU', 'FM'],
  ...['MC', 'NR', 'PW', 'KN', 'LC', 'VC', 'WS', 'SM', 'ST', 'SC', 'SG', 'TO', 'TV', 'VA'],
  ...['BS', 'LU', 'VU', 'PS'],
];

interface IOutlineCase {
  readonly name: string;
  readonly outline: IOutline;
  readonly places: readonly IPlace[];
  /** Places the source has no drawable shape for. */
  readonly undrawn: readonly string[];
  /**
   * The most path data the outline may carry, in characters: what makes
   * "roughest" a number. A tolerance turned down for looks will cross it, and
   * the right response is to decide that on purpose here rather than let the
   * route's chunk grow unnoticed. The states and continents are about 9KB;
   * the countries about 20KB, because their islands are places.
   */
  readonly ceiling: number;
}

const OUTLINES: readonly IOutlineCase[] = [
  { name: 'STATES_OUTLINE', outline: STATES_OUTLINE, places: STATES, undrawn: [], ceiling: 12_000 },
  {
    name: 'CONTINENTS_OUTLINE',
    outline: CONTINENTS_OUTLINE,
    places: CONTINENTS,
    undrawn: [],
    ceiling: 12_000,
  },
  {
    name: 'COUNTRIES_OUTLINE',
    outline: COUNTRIES_OUTLINE,
    places: COUNTRIES,
    undrawn: UNDRAWN_COUNTRIES,
    ceiling: 24_000,
  },
];

for (const { name, outline, places, undrawn, ceiling } of OUTLINES) {
  describe(name, () => {
    const ids = outline.shapes.map((shape) => shape.id);

    it('draws every place it can exactly once, and nothing that is not one', () => {
      expect(new Set(ids).size, 'a place is drawn twice').toBe(ids.length);
      const drawable = places.filter((place) => !undrawn.includes(place.id));
      expect([...ids].sort()).toEqual(drawable.map((place) => place.id).sort());
    });

    it('names only real places among those it cannot draw', () => {
      const known = new Set<string>(places.map((place) => place.id));
      expect(undrawn.filter((id) => !known.has(id))).toEqual([]);
    });

    it('gives every shape path data the script could have written', () => {
      for (const shape of outline.shapes) {
        expect(shape.d, shape.id).toMatch(PATH_DATA);
      }
      if (outline.unkeyed !== undefined) {
        expect(outline.unkeyed).toMatch(PATH_DATA);
      }
      expect(outline.viewBox).toMatch(/^-?\d+ -?\d+ \d+ \d+$/);
    });

    it('stays under its size ceiling', () => {
      const keyed = outline.shapes.reduce((sum, shape) => sum + shape.d.length, 0);
      expect(keyed + (outline.unkeyed?.length ?? 0)).toBeLessThanOrEqual(ceiling);
    });
  });
}

describe('STATES_OUTLINE', () => {
  it('leaves DC and the territories out, because they are not states', () => {
    // The bonus category is counted on the panel and not drawn: at this scale
    // DC is a speck, and the territories are an ocean away from any inset.
    const drawn = new Set<string>(STATES_OUTLINE.shapes.map((shape) => shape.id));
    expect(BONUS.filter((place) => drawn.has(place.id))).toEqual([]);
    expect(STATES_OUTLINE.unkeyed).toBeUndefined();
  });
});

describe('COUNTRIES_OUTLINE', () => {
  it('draws the land that is none of the 195, unkeyed, so the coastline is whole', () => {
    // Antarctica alone is wider than most of the map; without it, and without
    // Greenland and Taiwan, the world would have holes the count never made.
    expect(COUNTRIES_OUTLINE.unkeyed?.length ?? 0).toBeGreaterThan(0);
  });
});
