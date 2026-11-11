import { HERO_SEED, mulberry32 } from '../seed/seed';
import { EROSION, STRATA_ENTRIES } from './erosion-calibration';
import { ILandParts, raiseLand } from './land';
import { createNoise } from './noise';
import { LAND_PARTS, raise } from './reference';
import { strataTable, strataWarp } from './strata';
import { tally } from './tally';
import { uplift } from './uplift';

const SIZE = 33;

const noiseOf = (seed: number): ReturnType<typeof createNoise> => createNoise(mulberry32(seed));

const raisedBy = (seed: number, size: number): Float32Array => {
  const target = new Float32Array(size * size);
  uplift(target, size, EROSION, noiseOf(seed));
  return target;
};

describe('noise', () => {
  it('is the same from the same seed and different from another', () => {
    const first = noiseOf(7);
    const again = noiseOf(7);
    const other = noiseOf(8);

    expect(first.at(1.3, 4.7)).toBe(again.at(1.3, 4.7));
    expect(first.at(1.3, 4.7)).not.toBe(other.at(1.3, 4.7));
  });

  it('is zero at every whole coordinate, as a gradient noise is', () => {
    const noise = noiseOf(7);

    expect(Math.abs(noise.at(3, 5))).toBe(0);
    expect(Math.abs(noise.at(-2, 300))).toBe(0);
  });

  it('stays within about one either way, and uses most of that', () => {
    const noise = noiseOf(11);
    let least = Infinity;
    let most = -Infinity;
    for (let step = 0; step < 4000; step++) {
      const value = noise.at(step * 0.137, step * 0.071);
      least = Math.min(least, value);
      most = Math.max(most, value);
    }

    expect(least).toBeGreaterThanOrEqual(-1.001);
    expect(most).toBeLessThanOrEqual(1.001);
    expect(most - least).toBeGreaterThan(1.2);
  });

  it('is continuous: a small move is a small change', () => {
    const noise = noiseOf(11);

    expect(Math.abs(noise.at(2.5, 2.5) - noise.at(2.5001, 2.5))).toBeLessThan(1e-3);
    expect(Math.abs(noise.at(2.9999, 2.5) - noise.at(3.0001, 2.5))).toBeLessThan(1e-3);
  });

  it('sums octaves into the same range, and ridges into zero to one', () => {
    const noise = noiseOf(5);
    for (let step = 0; step < 2000; step++) {
      const x = step * 0.091;
      const y = step * 0.047;

      expect(Math.abs(noise.fbm(x, y, 5))).toBeLessThanOrEqual(1.001);
      expect(noise.ridged(x, y, 5)).toBeGreaterThanOrEqual(0);
      expect(noise.ridged(x, y, 5)).toBeLessThanOrEqual(1);
    }
  });
});

describe('uplift', () => {
  it('is exactly at base level on all four edges, so the rim is neither a cliff nor a moat', () => {
    const land = raisedBy(HERO_SEED, SIZE);
    for (let along = 0; along < SIZE; along++) {
      expect(land[along]).toBe(EROSION.baseLevel);
      expect(land[(SIZE - 1) * SIZE + along]).toBe(EROSION.baseLevel);
      expect(land[along * SIZE]).toBe(EROSION.baseLevel);
      expect(land[along * SIZE + SIZE - 1]).toBe(EROSION.baseLevel);
    }
  });

  it('has its highest ground inland, well clear of the rim', () => {
    const land = raisedBy(HERO_SEED, SIZE);
    const peak = land.indexOf(Math.max(...land));
    const margin = Math.floor(SIZE * EROSION.edgeWidth);
    const x = peak % SIZE;
    const y = Math.floor(peak / SIZE);

    expect(Math.min(x, y, SIZE - 1 - x, SIZE - 1 - y)).toBeGreaterThan(margin);
  });

  it('rises above base level everywhere inside the rim, and never past the calibrated relief', () => {
    const land = raisedBy(HERO_SEED, SIZE);
    for (let y = 1; y < SIZE - 1; y++) {
      for (let x = 1; x < SIZE - 1; x++) {
        expect(land[y * SIZE + x]).toBeGreaterThan(EROSION.baseLevel);
      }
    }

    expect(Math.max(...land)).toBeLessThanOrEqual(EROSION.baseLevel + EROSION.relief);
    expect(Math.max(...land)).toBeGreaterThan(EROSION.baseLevel + EROSION.relief * 0.4);
  });

  it('raises the same land on a finer grid: a tier changes the sampling, not the place', () => {
    const coarse = raisedBy(HERO_SEED, 33);
    const fine = raisedBy(HERO_SEED, 65);
    for (let y = 0; y < 33; y++) {
      for (let x = 0; x < 33; x++) {
        expect(fine[y * 2 * 65 + x * 2]).toBe(coarse[y * 33 + x]);
      }
    }
  });

  it('raises a different land from a different seed', () => {
    expect(raisedBy(1, SIZE)).not.toEqual(raisedBy(2, SIZE));
  });
});

describe('strata', () => {
  const table = (seed: number): ReturnType<typeof strataTable> =>
    strataTable(mulberry32(seed), EROSION, STRATA_ENTRIES);

  it('gives every entry a resistance between the hardest bed and none', () => {
    const { erodibility } = table(3);

    expect(erodibility).toHaveLength(STRATA_ENTRIES);
    for (const soft of erodibility) {
      expect(soft).toBeGreaterThanOrEqual(Math.fround(EROSION.hardestBed));
      expect(soft).toBeLessThanOrEqual(1);
    }
  });

  it('is made of beds: runs of entries alike, each within the calibrated thickness', () => {
    const { erodibility } = table(3);
    const runs: number[] = [];
    let run = 1;
    for (let entry = 1; entry < STRATA_ENTRIES; entry++) {
      if (erodibility[entry] === erodibility[entry - 1]) {
        run++;
      } else {
        runs.push(run);
        run = 1;
      }
    }

    expect(runs.length).toBeGreaterThanOrEqual(
      Math.floor(STRATA_ENTRIES / EROSION.bedThickest) - 1
    );
    for (const thickness of runs) {
      expect(thickness).toBeGreaterThanOrEqual(EROSION.bedThinnest);
      // two beds may draw the same resistance by chance only in principle; a float draw does not repeat
      expect(thickness).toBeLessThanOrEqual(EROSION.bedThickest);
    }
  });

  it('colours every entry, in range, one colour to a bed', () => {
    const { colours, erodibility } = table(3);

    expect(colours).toHaveLength(STRATA_ENTRIES * 3);
    expect(colours.every((channel) => channel >= 0 && channel <= 1)).toBe(true);
    for (let entry = 1; entry < STRATA_ENTRIES; entry++) {
      if (erodibility[entry] === erodibility[entry - 1]) {
        expect(colours[entry * 3]).toBe(colours[(entry - 1) * 3]);
      }
    }
  });

  it('is the same stack from the same seed and another from another', () => {
    expect(table(3).erodibility).toEqual(table(3).erodibility);
    expect(table(3).erodibility).not.toEqual(table(4).erodibility);
  });

  it('tilts and folds the beds by no more than the calibration allows, and by something', () => {
    const warp = new Float32Array(SIZE * SIZE);
    strataWarp(warp, SIZE, EROSION, noiseOf(HERO_SEED));
    const reach = EROSION.strataDip / 2 + EROSION.strataFold;

    expect(Math.max(...warp)).toBeLessThanOrEqual(reach * 1.001);
    expect(Math.min(...warp)).toBeGreaterThanOrEqual(-reach * 1.001);
    expect(Math.max(...warp) - Math.min(...warp)).toBeGreaterThan(reach * 0.2);
  });
});

describe('raising a land', () => {
  it('starts still, dry and uncut, with empty books', () => {
    const { fields } = raise(HERO_SEED, SIZE);

    for (const layer of [fields.cut, fields.regolith, fields.water, fields.suspended]) {
      expect(layer.every((value) => value === 0)).toBe(true);
    }
    expect(fields.ledger).toEqual({ rained: 0, evaporated: 0, drained: 0, exported: 0 });
    expect(fields.size).toBe(SIZE);
  });

  it('is the same land from the same seed, rock and all', () => {
    const first = raise(HERO_SEED, SIZE);
    const again = raise(HERO_SEED, SIZE);

    expect(first.terrain.uplift).toEqual(again.terrain.uplift);
    expect(first.terrain.warp).toEqual(again.terrain.warp);
    expect(first.terrain.erodibility).toEqual(again.terrain.erodibility);
    expect(first.seed).toBe(HERO_SEED);
  });

  it('hands the model the same resistance the picture will colour', () => {
    const land = raise(HERO_SEED, SIZE);

    expect(land.terrain.erodibility).toBe(land.strata.erodibility);
    expect(land.strata.colours).toHaveLength(STRATA_ENTRIES * 3);
  });

  it('draws the beds from their own stream, so the noise cannot reshuffle the rock', () => {
    // a noise that spends two extra draws raises other ground, and must leave the seed's beds as they were
    const plain = raise(HERO_SEED, SIZE).terrain;
    const greedy: ILandParts = {
      ...LAND_PARTS,
      createNoise: (random) => {
        random();
        random();
        return createNoise(random);
      },
    };
    const { terrain } = raiseLand(HERO_SEED, SIZE, EROSION, STRATA_ENTRIES, greedy);

    expect(terrain.uplift).not.toEqual(plain.uplift);
    expect(terrain.erodibility).toEqual(plain.erodibility);
  });
});

describe('tally', () => {
  const constants = { ...EROSION, extent: SIZE * 10 };
  const area = 100;

  it('counts a raised land as bedrock and nothing else', () => {
    const { fields, terrain } = raise(HERO_SEED, SIZE, constants);
    const raised = terrain.uplift.reduce((total, height) => total + height, 0) * area;
    const counted = tally(fields, terrain, constants);

    expect(counted.bedrock).toBeCloseTo(raised, 3);
    expect(counted.solid).toBe(counted.bedrock);
    expect(counted).toMatchObject({ regolith: 0, suspended: 0, water: 0, cut: 0 });
  });

  it('counts each layer by its thickness times the area of a cell', () => {
    const { fields, terrain } = raise(HERO_SEED, SIZE, constants);
    const before = tally(fields, terrain, constants).bedrock;
    fields.cut[5] = 2;
    fields.regolith[6] = 0.5;
    fields.suspended[7] = 0.25;
    fields.water[8] = 3;
    const counted = tally(fields, terrain, constants);

    expect(counted.cut).toBe(2 * area);
    expect(counted.regolith).toBe(0.5 * area);
    expect(counted.suspended).toBe(0.25 * area);
    expect(counted.water).toBe(3 * area);
    expect(counted.bedrock).toBeCloseTo(before - 2 * area, 3);
    expect(counted.solid).toBeCloseTo(before - 2 * area + 0.75 * area, 3);
  });
});
