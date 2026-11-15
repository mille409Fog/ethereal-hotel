import { DIRECTION } from './direction-calibration';
import {
  accumulation,
  coarsen,
  drainage,
  findValley,
  groundAt,
  stem,
  waterSurface,
} from './valley';

const SIZE = 33;
const MID = 16;
const EXTENT = 3300;
const centre = (k: number): number => ((k + 0.5) / SIZE - 0.5) * EXTENT;

/** a valley down the middle of the grid, falling toward row 0: steep sides, a gentle floor */
const vee = (): Float32Array => {
  const surface = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      surface[y * SIZE + x] = 40 * Math.abs(x - MID) + 5 * y;
    }
  }
  return surface;
};

describe('the main valley', () => {
  it('averages a grid down by blocks', () => {
    const fine = Float32Array.from({ length: 16 }, (_, i) => i);

    expect(Array.from(coarsen(fine, 4, 2))).toEqual([2.5, 4.5, 10.5, 12.5]);
  });

  it('reads the water’s surface as uplift less the cut, plus the regolith, plus the water', () => {
    const land = Float32Array.from([3, 2, 1, 99, 0, 0, 0, 7]);

    expect(Array.from(waterSurface(land, [100, 50]))).toEqual([100, 50]);
    expect(Array.from(waterSurface(Float32Array.from([10, 1, 2, 0]), [100]))).toEqual([93]);
  });

  it('drains every cell to an edge, pits and all', () => {
    const surface = vee();
    // a pit on the valley floor, deeper than anything round it
    surface[10 * SIZE + MID] = -500;
    const { receiver } = drainage(surface, SIZE);
    for (let start = 0; start < receiver.length; start++) {
      let at = start;
      for (let hops = 0; receiver[at] !== -1; hops++) {
        expect(hops).toBeLessThan(receiver.length);
        at = receiver[at];
      }
      const x = at % SIZE;
      const y = Math.floor(at / SIZE);
      expect(x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1).toBe(true);
    }
  });

  it('counts every cell once among the mouths it drains to', () => {
    const { receiver, order } = drainage(vee(), SIZE);
    const held = accumulation(receiver, order);
    let mouths = 0;
    for (let i = 0; i < receiver.length; i++) {
      if (receiver[i] === -1) {
        mouths += held[i];
      }
    }

    expect(mouths).toBe(SIZE * SIZE);
  });

  it('traces the stem from the mouth with the most behind it, up the valley floor', () => {
    const cells = stem(vee(), SIZE, DIRECTION.valleyStem);

    expect(cells[0]).toBe(MID);
    expect(cells.length).toBeGreaterThan(SIZE / 2);
    for (const cell of cells) {
      expect(cell % SIZE).toBe(MID);
    }
  });

  it('crosses a pit on the floor instead of ending in it', () => {
    const surface = vee();
    surface[10 * SIZE + MID] = -500;

    expect(stem(surface, SIZE, DIRECTION.valleyStem).length).toBeGreaterThan(12);
  });

  it('hands the camera points mouth first, evenly spaced, on the ground under them', () => {
    const surface = vee();
    const valley = findValley(surface, SIZE, EXTENT, DIRECTION);
    const points = valley?.points ?? [];

    expect(points.length).toBeGreaterThan(10);
    expect(points[0][0]).toBeCloseTo(centre(MID), 6);
    expect(points[0][2]).toBeCloseTo(centre(0), 6);
    for (let k = 1; k < points.length; k++) {
      const [x, ground, z] = points[k];
      expect(z).toBeGreaterThan(points[k - 1][2]);
      expect(ground).toBeCloseTo(groundAt(surface, SIZE, EXTENT, x, z), 9);
      if (k < points.length - 1) {
        const gap = Math.hypot(x - points[k - 1][0], z - points[k - 1][2]);
        expect(gap).toBeCloseTo(DIRECTION.valleySpacing, 6);
      }
    }
  });

  it('reads the ground between cells by mixing the four round the point', () => {
    const surface = vee();

    expect(groundAt(surface, SIZE, EXTENT, centre(MID), centre(4))).toBeCloseTo(20, 9);
    expect(
      groundAt(surface, SIZE, EXTENT, (centre(MID) + centre(MID + 1)) / 2, centre(0))
    ).toBeCloseTo(20, 9);
    expect(groundAt(Float32Array.of(7), 1, EXTENT, 0, 0)).toBe(7);
  });

  it('finds none on a grid too small to have one', () => {
    expect(findValley(new Float32Array(4), 2, EXTENT, DIRECTION)).toBeNull();
  });

  it('finds none where no stem is more than its mouth', () => {
    // a stem may climb only into a cell carrying the whole of the mouth's water, which none does
    expect(findValley(vee(), SIZE, EXTENT, { ...DIRECTION, valleyStem: 1 })).toBeNull();
  });
});
