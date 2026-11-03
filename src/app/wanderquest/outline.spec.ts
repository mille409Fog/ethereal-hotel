import { BONUS_OUTLINE } from './bonus.outline';
import { CONTINENTS_OUTLINE } from './continents.outline';
import { COUNTRIES_OUTLINE } from './countries.outline';
import { EUROPE_OUTLINE } from './europe.outline';
import type { IOutline } from './outline';
import { BONUS, CONTINENTS, COUNTRIES, STATES, type IPlace } from './places.data';
import { frameOf } from './quest-outline';
import { STATES_OUTLINE } from './states.outline';

/**
 * What `scripts/build-outline.mjs` committed. The script runs by hand and CI
 * never fetches, so this is the only check the generated files get, and every
 * outline is held to the same rules.
 */

/**
 * Absolute moves and lines in whole units, each ring closed, or a dot: a
 * circle as two half arcs. What the script writes, and nothing else.
 */
const PATH_DATA =
  /^((M-?\d+ -?\d+(L-?\d+ -?\d+)+Z)+|M-?\d+ -?\d+(A\d+ \d+ 0 1 0 -?\d+ -?\d+){2}Z)$/;

/** A dot's centre and radius, or null for a shape. */
function dotOf(d: string): { x: number; y: number; r: number } | null {
  const match = /^M(-?\d+) (-?\d+)A(\d+) \3 0 1 0 (-?\d+) \2A\3 \3 0 1 0 \1 \2Z$/.exec(d);
  if (!match) {
    return null;
  }
  const [left, y, r, right] = match.slice(1, 5).map(Number);
  return right - left === 2 * r ? { x: left + r, y, r } : null;
}

/**
 * The countries Natural Earth's 1:110m file cannot draw, which the outline
 * draws as dots: 29 it does not carry at that scale, then the Bahamas,
 * Luxembourg, Vanuatu and Palestine, which it does but which rounding
 * collapses below a triangle. Held exactly, so a regenerated file that
 * shrinks one more to a dot fails here, and one that draws one says so too.
 */
const DOTTED_COUNTRIES = [
  ...['AD', 'AG', 'BH', 'BB', 'CV', 'KM', 'DM', 'GD', 'KI', 'LI', 'MV', 'MT', 'MH', 'MU', 'FM'],
  ...['MC', 'NR', 'PW', 'KN', 'LC', 'VC', 'WS', 'SM', 'ST', 'SC', 'SG', 'TO', 'TV', 'VA'],
  ...['BS', 'LU', 'VU', 'PS'],
];

/** The countries the outline cannot draw at all, now that the smallest are dots. */
const UNDRAWN_COUNTRIES: readonly string[] = [];

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
  // About 2.5KB: six places, most of them a single island.
  { name: 'BONUS_OUTLINE', outline: BONUS_OUTLINE, places: BONUS, undrawn: [], ceiling: 4_000 },
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
      for (const extra of [outline.unkeyed, outline.sphere]) {
        if (extra !== undefined) {
          expect(extra).toMatch(PATH_DATA);
        }
      }
      expect(outline.viewBox).toMatch(/^-?\d+ -?\d+ \d+ \d+$/);
    });

    it('stays under its size ceiling', () => {
      const keyed = outline.shapes.reduce((sum, shape) => sum + shape.d.length, 0);
      const extra = (outline.unkeyed?.length ?? 0) + (outline.sphere?.length ?? 0);
      expect(keyed + extra).toBeLessThanOrEqual(ceiling);
    });
  });
}

describe('STATES_OUTLINE', () => {
  it('leaves DC and the territories out, because they are not states', () => {
    // The bonus is drawn on a map of its own, `BONUS_OUTLINE`: at this scale
    // DC is a speck, and the territories are an ocean away from any inset.
    const drawn = new Set<string>(STATES_OUTLINE.shapes.map((shape) => shape.id));
    expect(BONUS.filter((place) => drawn.has(place.id))).toEqual([]);
    expect(STATES_OUTLINE.unkeyed).toBeUndefined();
  });
});

describe('the sphere', () => {
  /** The extremes of every point in some path data. */
  const extent = (d: string): { left: number; top: number; right: number; bottom: number } => {
    const points = rings(d).flat();
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    return {
      left: Math.min(...xs),
      top: Math.min(...ys),
      right: Math.max(...xs),
      bottom: Math.max(...ys),
    };
  };

  it('is drawn for the Equal Earth outlines, and not for Albers USA or the tiles', () => {
    // The states are three projections in one frame, and the bonus six; neither has a globe.
    expect(STATES_OUTLINE.sphere).toBeUndefined();
    expect(BONUS_OUTLINE.sphere).toBeUndefined();
    for (const outline of [CONTINENTS_OUTLINE, COUNTRIES_OUTLINE, EUROPE_OUTLINE]) {
      expect(outline.sphere, outline.label).toBeDefined();
    }
  });

  it('is the whole globe on the world maps, 960 units across, and the crop holds it', () => {
    for (const outline of [CONTINENTS_OUTLINE, COUNTRIES_OUTLINE]) {
      const globe = extent(outline.sphere ?? '');
      expect([globe.left, globe.top, globe.right], outline.label).toEqual([0, 0, 960]);
      const [left, top, width, height] = outline.viewBox.split(' ').map(Number);
      expect(left <= globe.left && left + width >= globe.right, outline.label).toBe(true);
      expect(top <= globe.top && top + height >= globe.bottom, outline.label).toBe(true);
    }
  });

  it('holds all the land on the world maps, so no coast runs off into the page', () => {
    // Inside the edge, or within a unit of it: both are rounded to whole
    // units, so a coast on the antimeridian (Chukotka, Antarctica's corners)
    // can land 0.75 past it, which is under a pixel at the map's widest. A
    // dot is a marker, not land, and is not held to it.
    for (const outline of [CONTINENTS_OUTLINE, COUNTRIES_OUTLINE]) {
      const [globe] = rings(outline.sphere ?? '');
      const land = [...outline.shapes.map((shape) => shape.d), outline.unkeyed ?? ''];
      for (const d of land.filter((candidate) => !dotOf(candidate))) {
        for (const point of rings(d).flat()) {
          expect(
            within(point, globe) || distanceTo(point, globe) <= 1,
            `${outline.label} ${point.join(' ')}`
          ).toBe(true);
        }
      }
    }
  });

  it('is the frame on the inset, which lies wholly inside the globe', () => {
    const frame = frameOf(EUROPE_OUTLINE);
    expect(extent(EUROPE_OUTLINE.sphere ?? '')).toEqual({
      left: 0,
      top: 0,
      right: frame.width,
      bottom: frame.height,
    });
    expect(rings(EUROPE_OUTLINE.sphere ?? '')).toHaveLength(1);
  });
});

/** Whether a point lies inside a ring, by the even-odd rule. */
function within([x, y]: [number, number], ring: Array<[number, number]>): boolean {
  let inside = false;
  ring.forEach(([ax, ay], i) => {
    const [bx, by] = ring[(i + ring.length - 1) % ring.length];
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) {
      inside = !inside;
    }
  });
  return inside;
}

/** How far a point is from the nearest edge of a ring. */
function distanceTo([x, y]: [number, number], ring: Array<[number, number]>): number {
  return Math.min(
    ...ring.map(([ax, ay], i) => {
      const [bx, by] = ring[(i + 1) % ring.length];
      const [dx, dy] = [bx - ax, by - ay];
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(x - ax - t * dx, y - ay - t * dy);
    })
  );
}

/** Each closed ring of some path data, as its points. */
function rings(d: string): Array<Array<[number, number]>> {
  return d
    .split('Z')
    .filter(Boolean)
    .map((ring) =>
      ring
        .slice(1)
        .split('L')
        .map((point): [number, number] => {
          const [x, y] = point.split(' ').map(Number);
          return [x, y];
        })
    );
}

describe('BONUS_OUTLINE', () => {
  const shape = (id: string): string =>
    BONUS_OUTLINE.shapes.find((candidate) => candidate.id === id)?.d ?? '';

  it('draws all six, in BONUS order, each in a tile of its own', () => {
    // The undrawn rule does not reach the bonus: every tile is fitted to its
    // place, so an islet can go but a place cannot.
    expect(BONUS_OUTLINE.shapes.map((candidate) => candidate.id)).toEqual(
      BONUS.map((place) => place.id)
    );
    expect(BONUS_OUTLINE.tiles?.map((tile) => tile.id)).toEqual(BONUS.map((place) => place.id));
  });

  it('keeps every shape inside its own tile, so no two places overlap', () => {
    for (const tile of BONUS_OUTLINE.tiles ?? []) {
      const points = rings(shape(tile.id)).flat();
      expect(points.length, tile.id).toBeGreaterThan(0);
      for (const [x, y] of points) {
        expect(x >= tile.x && x <= tile.x + tile.size, `${tile.id} x ${x}`).toBe(true);
        expect(y >= tile.y && y <= tile.y + tile.size, `${tile.id} y ${y}`).toBe(true);
      }
    }
  });

  it('draws only the Northern Marianas in part, and says what it leaves out', () => {
    // The one exception to fitting the whole place, named in the generator's
    // `PARTIAL`. A second would be a decision, and should fail here first.
    expect(BONUS_OUTLINE.tiles?.filter((tile) => tile.partial).map((tile) => tile.id)).toEqual([
      'MP',
    ]);
  });

  describe('the rings round scattered land', () => {
    const tiles = BONUS_OUTLINE.tiles ?? [];
    /** A tile's land as a share of its square, by the shoelace formula. */
    const share = (id: string, size: number): number =>
      rings(shape(id)).reduce((sum, ring) => {
        const twice = ring.reduce((acc, [x0, y0], i) => {
          const [x1, y1] = ring[(i + 1) % ring.length];
          return acc + x0 * y1 - x1 * y0;
        }, 0);
        return sum + Math.abs(twice) / 2;
      }, 0) /
      (size * size);

    it('rings the scattered three and leaves the three that fill their tiles alone', () => {
      expect(tiles.filter((tile) => tile.circles).map((tile) => tile.id)).toEqual([
        'VI',
        'MP',
        'AS',
      ]);
    });

    it('rings by land share, so every ringed tile has less land than every other', () => {
      // The threshold is the script's; what is held here is that it is one
      // line through the shares, not a list someone picked.
      const ringed = tiles.filter((tile) => tile.circles).map((t) => share(t.id, t.size));
      const plain = tiles.filter((tile) => !tile.circles).map((t) => share(t.id, t.size));
      expect(Math.max(...ringed)).toBeLessThan(Math.min(...plain));
    });

    it('puts every piece of land inside a ring, and every ring inside its square', () => {
      for (const tile of tiles.filter((candidate) => candidate.circles)) {
        const circles = tile.circles ?? [];
        for (const [x, y] of rings(shape(tile.id)).flat()) {
          expect(
            circles.some(({ cx, cy, r }) => Math.hypot(x - cx, y - cy) < r),
            `${tile.id} ${x} ${y}`
          ).toBe(true);
        }
        for (const { cx, cy, r } of circles) {
          expect(cx - r > tile.x && cx + r < tile.x + tile.size, `${tile.id} x`).toBe(true);
          expect(cy - r > tile.y && cy + r < tile.y + tile.size, `${tile.id} y`).toBe(true);
        }
      }
    });

    it('rings each island group once, so no two rings in a tile overlap', () => {
      for (const tile of tiles) {
        const circles = tile.circles ?? [];
        circles.forEach((one, i) => {
          for (const two of circles.slice(i + 1)) {
            expect(Math.hypot(one.cx - two.cx, one.cy - two.cy), tile.id).toBeGreaterThan(
              one.r + two.r
            );
          }
        });
      }
    });
  });

  it("keeps American Samoa's Manu'a group, not just Tutuila", () => {
    // Manu'a lies a hundred kilometres east of Tutuila, the largest piece. A
    // fit set by Rose Atoll and Swains Island shrank it below the island
    // filter, which is the failure this holds against.
    const pieces = rings(shape('AS'));
    const width = (ring: Array<[number, number]>): number =>
      Math.max(...ring.map(([x]) => x)) - Math.min(...ring.map(([x]) => x));
    const tutuila = pieces.reduce((widest, ring) => (width(ring) > width(widest) ? ring : widest));
    const east = Math.max(...tutuila.map(([x]) => x));
    expect(pieces.filter((ring) => ring.every(([x]) => x > east)).length).toBeGreaterThan(0);
  });
});

interface IDot {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

/** An outline's dots, with the place each is. */
function dotsOf(outline: IOutline): IDot[] {
  return outline.shapes.flatMap((shape) => {
    const dot = dotOf(shape.d);
    return dot ? [{ id: shape.id, ...dot }] : [];
  });
}

/** The dots that overlap another. */
function crowdedOf(dots: readonly IDot[]): IDot[] {
  return dots.filter((one) =>
    dots.some((two) => one !== two && Math.hypot(one.x - two.x, one.y - two.y) < one.r + two.r)
  );
}

/**
 * The shapes a dot hides whole: every point of the outline lies under some
 * dot, so the place can no longer be seen or clicked on that map, only
 * ticked in the list.
 */
function hiddenOf(outline: IOutline): string[] {
  const dots = dotsOf(outline);
  return outline.shapes
    .filter(
      (shape) =>
        !dotOf(shape.d) &&
        rings(shape.d)
          .flat()
          .every(([x, y]) => dots.some((dot) => Math.hypot(x - dot.x, y - dot.y) <= dot.r))
    )
    .map((shape) => shape.id);
}

/**
 * The countries Europe's inset draws where they can be seen and aimed at:
 * drawn there, and neither a dot touching another nor a shape under them.
 */
const CLEAR_IN_EUROPE = new Set<string>(
  EUROPE_OUTLINE.shapes
    .map((shape) => shape.id)
    .filter(
      (id) =>
        !crowdedOf(dotsOf(EUROPE_OUTLINE)).some((dot) => dot.id === id) &&
        !hiddenOf(EUROPE_OUTLINE).includes(id)
    )
);

describe('COUNTRIES_OUTLINE', () => {
  const name = new Map<string, string>(COUNTRIES.map((country) => [country.id, country.name]));
  const dots = dotsOf(COUNTRIES_OUTLINE);
  const note = COUNTRIES_OUTLINE.note ?? '';

  it('draws the land that is none of the 195, unkeyed, so the coastline is whole', () => {
    // Antarctica alone is wider than most of the map; without it, and without
    // Greenland and Taiwan, the world would have holes the count never made.
    expect(COUNTRIES_OUTLINE.unkeyed?.length ?? 0).toBeGreaterThan(0);
  });

  it('draws exactly the countries too small for a shape as dots, all one size', () => {
    expect(dots.map((dot) => dot.id).sort()).toEqual([...DOTTED_COUNTRIES].sort());
    expect(new Set(dots.map((dot) => dot.r)).size).toBe(1);
  });

  it('draws every dot after every shape, so no shape paints over one', () => {
    const firstDot = COUNTRIES_OUTLINE.shapes.findIndex((shape) => dotOf(shape.d));
    expect(COUNTRIES_OUTLINE.shapes.slice(firstDot).every((shape) => dotOf(shape.d))).toBe(true);
  });

  it('keeps every dot whole inside the viewBox', () => {
    const [left, top, width, height] = COUNTRIES_OUTLINE.viewBox.split(' ').map(Number);
    for (const { id, x, y, r } of dots) {
      expect(x - r >= left && x + r <= left + width, `${id} x`).toBe(true);
      expect(y - r >= top && y + r <= top + height, `${id} y`).toBe(true);
    }
  });

  it('names on the panel every country whose dot overlaps another, unless Europe draws it clear', () => {
    const crowded = crowdedOf(dots);
    expect(crowded.length).toBeGreaterThan(0);
    for (const dot of crowded) {
      if (!CLEAR_IN_EUROPE.has(dot.id)) {
        expect(note, dot.id).toContain(name.get(dot.id));
      }
    }
  });

  it('names on the panel every country a dot hides whole, unless Europe draws it clear', () => {
    const hidden = hiddenOf(COUNTRIES_OUTLINE);
    expect(hidden.sort()).toEqual(['BE', 'CH', 'IL', 'LB', 'QA', 'TT']);
    for (const id of hidden.filter((candidate) => !CLEAR_IN_EUROPE.has(candidate))) {
      expect(note, id).toContain(`${name.get(id)}, under`);
    }
  });

  it('stops naming what the inset draws clear, and says that it does', () => {
    // The overlap of Europe's microstates and the two countries under them
    // were the reason for the inset; the note naming them is what it ends.
    for (const id of ['AD', 'LI', 'LU', 'MT', 'MC', 'SM', 'VA', 'BE', 'CH']) {
      expect(CLEAR_IN_EUROPE.has(id), id).toBe(true);
      expect(note, id).not.toContain(name.get(id));
    }
    expect(note).toContain('Europe is drawn again below');
  });
});

describe('EUROPE_OUTLINE', () => {
  const ids = EUROPE_OUTLINE.shapes.map((shape) => shape.id);
  const frame = frameOf(EUROPE_OUTLINE);
  const enlarges = EUROPE_OUTLINE.enlarges;

  it('draws each country at most once, under the ids the world map uses', () => {
    expect(new Set(ids).size, 'a place is drawn twice').toBe(ids.length);
    const world = new Set(COUNTRIES_OUTLINE.shapes.map((shape) => shape.id));
    expect(ids.filter((id) => !world.has(id))).toEqual([]);
  });

  it('gives every shape path data the script could have written, under its ceiling', () => {
    for (const shape of EUROPE_OUTLINE.shapes) {
      expect(shape.d, shape.id).toMatch(PATH_DATA);
    }
    expect(EUROPE_OUTLINE.unkeyed ?? '').toMatch(PATH_DATA);
    // About 23KB: the 1:50m coast at six times the scale. More than the
    // world map, which is why it is held separately rather than raised there.
    const bytes =
      EUROPE_OUTLINE.shapes.reduce((sum, shape) => sum + shape.d.length, 0) +
      (EUROPE_OUTLINE.unkeyed?.length ?? 0);
    expect(bytes).toBeLessThanOrEqual(26_000);
  });

  it('is the rectangle it marks on the world map, at a whole multiple of its scale', () => {
    expect(enlarges).toBeDefined();
    const { x, y, width, height } = enlarges ?? { x: 0, y: 0, width: 0, height: 0 };
    const scale = frame.width / width;
    expect(Number.isInteger(scale), `scale ${scale}`).toBe(true);
    expect(frame.height).toBe(height * scale);

    const [left, top, worldWidth, worldHeight] = COUNTRIES_OUTLINE.viewBox.split(' ').map(Number);
    expect(x >= left && x + width <= left + worldWidth).toBe(true);
    expect(y >= top && y + height <= top + worldHeight).toBe(true);
  });

  it('keeps every shape inside its frame, cut there rather than running on', () => {
    for (const shape of EUROPE_OUTLINE.shapes.filter((candidate) => !dotOf(candidate.d))) {
      for (const [px, py] of rings(shape.d).flat()) {
        expect(px >= 0 && px <= frame.width, `${shape.id} x ${px}`).toBe(true);
        expect(py >= 0 && py <= frame.height, `${shape.id} y ${py}`).toBe(true);
      }
    }
  });

  it('dots only what would fit inside a dot, so no target is smaller than one', () => {
    // The four the 1:50m file cannot shape at this scale, and four more it
    // can but would draw smaller than a dot: Lebanon is the sliver north of
    // the frame's edge. Held exactly, as the world map's dots are.
    expect(
      dotsOf(EUROPE_OUTLINE)
        .map((dot) => dot.id)
        .sort()
    ).toEqual(['AD', 'LB', 'LI', 'LU', 'MC', 'MT', 'SM', 'VA']);
    for (const shape of EUROPE_OUTLINE.shapes.filter((candidate) => !dotOf(candidate.d))) {
      const points = rings(shape.d).flat();
      const extent = (axis: 0 | 1): number =>
        Math.max(...points.map((point) => point[axis])) -
        Math.min(...points.map((point) => point[axis]));
      expect(Math.max(extent(0), extent(1)), shape.id).toBeGreaterThanOrEqual(20);
    }
    expect(ids).toEqual(expect.arrayContaining(['BE', 'CH']));
  });

  it('keeps every dot whole inside its frame', () => {
    for (const { id, x, y, r } of dotsOf(EUROPE_OUTLINE)) {
      expect(x - r >= 0 && x + r <= frame.width, `${id} x`).toBe(true);
      expect(y - r >= 0 && y + r <= frame.height, `${id} y`).toBe(true);
    }
  });

  it('crowds and hides nothing, so its note has nothing to say', () => {
    expect(crowdedOf(dotsOf(EUROPE_OUTLINE))).toEqual([]);
    expect(hiddenOf(EUROPE_OUTLINE)).toEqual([]);
    expect(EUROPE_OUTLINE.note).toBeUndefined();
  });
});
