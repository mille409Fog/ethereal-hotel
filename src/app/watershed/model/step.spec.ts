import { QUALITY_TIERS } from '../quality/quality-calibration';
import { HERO_SEED } from '../seed/seed';
import {
  cellSize,
  EROSION,
  IErosionConstants,
  stableTimestep,
  STRATA_ENTRIES,
} from './erosion-calibration';
import { createFields, IFields, ITerrain } from './fields';
import { raise } from './reference';
import {
  bedrockAt,
  carry,
  erode,
  evaporate,
  flow,
  levelAt,
  pipeFlux,
  rainFall,
  slump,
  step,
  strataIndex,
  surfaceAt,
} from './step';
import { tally } from './tally';

const SIZE = 32;
/** the calibrated model on cells of 16 m, so a small grid behaves as a patch of the real one */
const K: IErosionConstants = { ...EROSION, extent: SIZE * 16 };
const CELL = cellSize(SIZE, K);
const AREA = CELL * CELL;

/** a land of one bed, raised to `height(x, y)` metres */
const terrainOf = (
  height: (x: number, y: number) => number,
  erodibility = 1,
  size = SIZE
): ITerrain => {
  const uplift = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      uplift[y * size + x] = height(x, y);
    }
  }
  return {
    size,
    uplift,
    warp: new Float32Array(size * size),
    erodibility: new Float32Array(STRATA_ENTRIES).fill(erodibility),
  };
};

const sum = (values: Float32Array): number => values.reduce((total, value) => total + value, 0);
const at = (x: number, y: number, size = SIZE): number => y * size + x;

/** the thickness of rock on the block, in metres summed over cells: what no pass but `carry` may change */
const rockOn = (fields: IFields): number =>
  sum(fields.regolith) + sum(fields.suspended) - sum(fields.cut);

/** a land with water moving on it, sediment in the water and loose material on the ground */
const busyLand = (): { fields: IFields; terrain: ITerrain } => {
  const terrain = terrainOf((x, y) => 200 + 6 * x + 30 * Math.sin(y / 3) + 20 * Math.cos(x / 2));
  const fields = createFields(SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) {
    fields.water[i] = 0.02 + 0.3 * ((i * 7) % 11);
    fields.regolith[i] = (i % 5) * 0.004;
    fields.suspended[i] = ((i * 3) % 7) * 0.02;
    fields.velocityX[i] = ((i * 13) % 9) - 4;
    fields.velocityY[i] = ((i * 5) % 7) - 3;
  }
  return { fields, terrain };
};

describe('the erosion step', () => {
  describe('heights', () => {
    it('are rounded to 32-bit at each sum, as the shader holds them', () => {
      const terrain = terrainOf(() => 2000.1234);
      const fields = createFields(SIZE);
      fields.cut[0] = 0.00001;
      fields.regolith[0] = 0.00002;
      fields.water[0] = 0.00003;

      const bedrock = Math.fround(terrain.uplift[0] - fields.cut[0]);
      const surface = Math.fround(bedrock + fields.regolith[0]);

      expect(bedrockAt(fields, terrain, 0)).toBe(bedrock);
      expect(surfaceAt(fields, terrain, 0)).toBe(surface);
      expect(levelAt(fields, terrain, 0)).toBe(Math.fround(surface + fields.water[0]));
    });

    it('find the bed a height falls in, and hold to the ends of the table beyond it', () => {
      const floor = K.strataFloor;
      const entry = K.strataSpan / STRATA_ENTRIES;

      expect(strataIndex(floor, 0, K, STRATA_ENTRIES)).toBe(0);
      expect(strataIndex(floor + entry * 10.5, 0, K, STRATA_ENTRIES)).toBe(10);
      expect(strataIndex(floor, entry * 3.5, K, STRATA_ENTRIES)).toBe(3);
      expect(strataIndex(floor - 1000, 0, K, STRATA_ENTRIES)).toBe(0);
      expect(strataIndex(floor + K.strataSpan + 1000, 0, K, STRATA_ENTRIES)).toBe(
        STRATA_ENTRIES - 1
      );
    });
  });

  describe('rain', () => {
    it('falls everywhere alike, in proportion to its strength', () => {
      const fields = createFields(SIZE);
      rainFall(fields, K, 0.5);

      expect(fields.water[0]).toBe(Math.fround(K.timestep * K.rainRate * 0.5));
      expect(new Set(fields.water).size).toBe(1);
    });

    it('is entered in the ledger as what the cells actually took', () => {
      const fields = createFields(SIZE);
      rainFall(fields, K, 1);

      expect(fields.ledger.rained).toBe(sum(fields.water) * AREA);
    });

    it('does nothing at no strength', () => {
      const fields = createFields(SIZE);
      rainFall(fields, K, 0);

      expect(sum(fields.water)).toBe(0);
      expect(fields.ledger.rained).toBe(0);
    });
  });

  describe('the pipes', () => {
    it('leave still water on level ground still', () => {
      // base level is far below, so only the cells on the rim have anywhere lower to send water
      const terrain = terrainOf(() => 100);
      const fields = createFields(SIZE);
      fields.water.fill(1);
      pipeFlux(fields, terrain, K);
      const inner = at(SIZE / 2, SIZE / 2);

      expect(fields.fluxLeft[inner]).toBe(0);
      expect(fields.fluxRight[inner]).toBe(0);
      expect(fields.fluxUp[inner]).toBe(0);
      expect(fields.fluxDown[inner]).toBe(0);
    });

    it('send water toward the lower neighbour and none toward the higher', () => {
      const terrain = terrainOf((x) => 100 - x);
      const fields = createFields(SIZE);
      fields.water.fill(1);
      pipeFlux(fields, terrain, K);
      const inner = at(SIZE / 2, SIZE / 2);

      expect(fields.fluxRight[inner]).toBeGreaterThan(0);
      expect(fields.fluxLeft[inner]).toBe(0);
      expect(fields.fluxUp[inner]).toBe(0);
    });

    it('never promise more water than a cell holds, however steep the fall', () => {
      const terrain = terrainOf((x, y) => 500 - 12 * x - 9 * y);
      const fields = createFields(SIZE);
      fields.water.fill(0.001);
      for (let pass = 0; pass < 5; pass++) {
        pipeFlux(fields, terrain, K);
      }

      for (let i = 0; i < SIZE * SIZE; i++) {
        const promised =
          (fields.fluxLeft[i] + fields.fluxRight[i] + fields.fluxUp[i] + fields.fluxDown[i]) *
          K.timestep;
        expect(promised).toBeLessThanOrEqual(fields.water[i] * AREA * (1 + 1e-6));
      }
    });

    it('send nothing from a dry cell', () => {
      const terrain = terrainOf((x) => 100 - x);
      const fields = createFields(SIZE);
      pipeFlux(fields, terrain, K);

      expect(sum(fields.fluxRight)).toBe(0);
    });

    it('drain an edge cell outward when its water stands above base level, and not otherwise', () => {
      const high = createFields(SIZE);
      high.water.fill(1);
      pipeFlux(
        high,
        terrainOf(() => 50),
        K
      );
      const low = createFields(SIZE);
      low.water.fill(1);
      pipeFlux(
        low,
        terrainOf(() => K.baseLevel - 5),
        K
      );

      expect(high.fluxLeft[at(0, 5)]).toBeGreaterThan(0);
      expect(high.fluxUp[at(5, 0)]).toBeGreaterThan(0);
      expect(low.fluxLeft[at(0, 5)]).toBe(0);
    });
  });

  describe('flow', () => {
    it('moves water downhill on a tilted plane, and it leaves by the low edge', () => {
      // falls toward x = last, where it meets base level; the far rim is high, and drains too, so look inland
      const terrain = terrainOf((x) => (SIZE - 1 - x) * 2);
      const fields = createFields(SIZE);
      for (let n = 0; n < 200; n++) {
        step(fields, terrain, K, 1);
      }

      for (let y = 4; y < SIZE - 4; y++) {
        for (let x = SIZE / 2; x < SIZE - 1; x++) {
          expect(fields.velocityX[at(x, y)]).toBeGreaterThan(0);
        }
        expect(fields.fluxRight[at(SIZE - 1, y)]).toBeGreaterThan(0);
      }
      expect(fields.ledger.drained).toBeGreaterThan(0);
    });

    it('gives still water no velocity', () => {
      const terrain = terrainOf(() => K.baseLevel - 10);
      const fields = createFields(SIZE);
      fields.water.fill(2);
      pipeFlux(fields, terrain, K);
      flow(fields, K);

      expect(sum(fields.velocityX.map(Math.abs))).toBe(0);
      expect(sum(fields.velocityY.map(Math.abs))).toBe(0);
    });

    it('credits a film thinner than the depth floor with no velocity, rather than dividing by it', () => {
      const terrain = terrainOf((x) => 100 - 5 * x);
      const fields = createFields(SIZE);
      fields.water.fill(K.depthFloor / 4);
      pipeFlux(fields, terrain, K);
      flow(fields, K);

      expect(sum(fields.velocityX.map(Math.abs))).toBe(0);
    });

    it('never lets the water outrun the speed limit', () => {
      const terrain = terrainOf((x) => 2000 - 60 * x);
      const fields = createFields(SIZE);
      fields.water.fill(0.5);
      for (let n = 0; n < 30; n++) {
        pipeFlux(fields, terrain, K);
        flow(fields, K);
      }
      const fastest = Math.max(
        ...Array.from(fields.velocityX, (speedX, i) => Math.hypot(speedX, fields.velocityY[i]))
      );

      expect(fastest).toBeGreaterThan(K.maxSpeed * 0.99);
      expect(fastest).toBeLessThanOrEqual(K.maxSpeed * (1 + 1e-6));
    });

    it('keeps the water books: what is on the land is what rained less what left', () => {
      const { fields, terrain } = raise(HERO_SEED, 48, { ...EROSION, extent: 48 * 16 });
      const constants = { ...EROSION, extent: 48 * 16 };
      for (let n = 0; n < 150; n++) {
        step(fields, terrain, constants, n < 100 ? 1 : 0);
      }
      const { rained, evaporated, drained } = fields.ledger;
      const water = tally(fields, terrain, constants).water;

      // no depth went negative and was clamped, or water would have appeared from nowhere here
      expect(fields.water.every((depth) => depth >= 0)).toBe(true);
      expect(drained).toBeGreaterThan(0);
      expect(evaporated).toBeGreaterThan(0);
      // measured at 8.4e-10 of the rain over a hundred steps of this land
      expect(Math.abs(water - (rained - evaporated - drained))).toBeLessThan(rained * 1e-6);
    });
  });

  describe('sediment in the pipes', () => {
    it('goes nowhere in still water', () => {
      const { fields } = busyLand();
      const before = Float32Array.from(fields.suspended);
      carry(fields, K);

      expect(fields.suspended).toEqual(before);
    });

    it('leaves a cell in the share its water leaves, toward where the water goes', () => {
      const fields = createFields(SIZE);
      const from = at(10, 10);
      fields.water[from] = 1;
      fields.suspended[from] = 0.4;
      // a quarter of the cell's water leaves to the right this step
      fields.fluxRight[from] = (0.25 * AREA) / K.timestep;
      carry(fields, K);

      expect(fields.suspended[from]).toBeCloseTo(0.3, 6);
      expect(fields.suspended[at(11, 10)]).toBeCloseTo(0.1, 6);
      expect(fields.suspended[at(9, 10)]).toBe(0);
    });

    it('creates and destroys none, and counts what crosses the edge', () => {
      const terrain = terrainOf((x, y) => 300 - 4 * x - 3 * y + 15 * Math.sin(x / 2));
      const fields = createFields(SIZE);
      fields.water.fill(0.4);
      fields.suspended.fill(0.05);
      const before = sum(fields.suspended);
      for (let n = 0; n < 40; n++) {
        pipeFlux(fields, terrain, K);
        carry(fields, K);
        flow(fields, K);
      }
      const exported = fields.ledger.exported / AREA;

      expect(exported).toBeGreaterThan(0);
      expect(sum(fields.suspended) + exported).toBeCloseTo(before, 4);
      expect(fields.suspended.every((held) => held >= 0)).toBe(true);
    });
  });

  describe('erosion and deposition', () => {
    /** measured at 2.6e-9 of the rock exchanged on `busyLand`: the rounding of 32-bit cells, with room to spare */
    const EXCHANGE_DRIFT = 1e-6;

    it('moves rock between ground and water and makes none', () => {
      const { fields, terrain } = busyLand();
      const before = rockOn(fields);
      const suspendedBefore = Float32Array.from(fields.suspended);
      erode(fields, terrain, K);
      const exchanged = fields.suspended.reduce(
        (total, held, i) => total + Math.abs(held - suspendedBefore[i]),
        0
      );

      expect(exchanged).toBeGreaterThan(1);
      expect(Math.abs(rockOn(fields) - before)).toBeLessThan(exchanged * EXCHANGE_DRIFT);
    });

    it('both picks up and lays down on a land with fast and slow water', () => {
      const { fields, terrain } = busyLand();
      const before = Float32Array.from(fields.suspended);
      erode(fields, terrain, K);

      expect(fields.suspended.some((held, i) => held > before[i])).toBe(true);
      expect(fields.suspended.some((held, i) => held < before[i])).toBe(true);
    });

    it('takes loose material before rock', () => {
      const terrain = terrainOf((x) => 300 - 5 * x);
      const fields = createFields(SIZE);
      fields.water.fill(1);
      fields.velocityX.fill(3);
      fields.regolith.fill(5);
      erode(fields, terrain, K);

      expect(sum(fields.cut)).toBe(0);
      expect(sum(fields.suspended)).toBeGreaterThan(0);
    });

    it('cuts rock when there is no loose material, at the rate its bed allows', () => {
      const cutFrom = (erodibility: number): number => {
        const terrain = terrainOf((x) => 300 - 5 * x, erodibility);
        const fields = createFields(SIZE);
        fields.water.fill(1);
        fields.velocityX.fill(3);
        erode(fields, terrain, K);
        return sum(fields.cut);
      };

      expect(cutFrom(1)).toBeGreaterThan(0);
      expect(cutFrom(0.25) / cutFrom(1)).toBeCloseTo(0.25, 5);
    });

    it('picks up nothing in still water, and lays down what the water held', () => {
      const terrain = terrainOf((x) => 300 - 5 * x);
      const fields = createFields(SIZE);
      fields.water.fill(1);
      fields.suspended.fill(0.2);
      erode(fields, terrain, K);

      expect(sum(fields.cut)).toBe(0);
      expect(fields.suspended[0]).toBeCloseTo(0.2 * (1 - K.timestep * K.depositRate), 6);
      expect(fields.regolith[0]).toBeCloseTo(0.2 * K.timestep * K.depositRate, 6);
    });

    it('credits a film with less than its speed implies', () => {
      const pickedUpAt = (depth: number): number => {
        const terrain = terrainOf((x) => 300 - 5 * x);
        const fields = createFields(SIZE);
        fields.water.fill(depth);
        fields.velocityX.fill(3);
        erode(fields, terrain, K);
        return sum(fields.suspended);
      };

      expect(pickedUpAt(K.rampDepth / 2) / pickedUpAt(K.rampDepth)).toBeCloseTo(0.5, 5);
      expect(pickedUpAt(K.rampDepth * 4)).toBeCloseTo(pickedUpAt(K.rampDepth), 5);
    });

    it('lets water crossing a flat still carry something', () => {
      const terrain = terrainOf(() => 100);
      const fields = createFields(SIZE);
      fields.water.fill(1);
      fields.velocityX.fill(3);
      erode(fields, terrain, K);

      expect(fields.suspended[at(SIZE / 2, SIZE / 2)]).toBeCloseTo(
        K.timestep * K.dissolveRate * K.capacity * K.minTilt * 3,
        7
      );
    });
  });

  describe('evaporation', () => {
    it('takes the same depth from a lake as from a film, so the lake is what remains', () => {
      const fields = createFields(SIZE);
      fields.water[0] = 10;
      fields.water[1] = 0.01;
      evaporate(fields, K);
      const taken = K.timestep * K.evaporationRate;

      expect(fields.water[0]).toBeCloseTo(10 - taken, 5);
      expect(fields.water[1]).toBeCloseTo(0.01 - taken, 7);
    });

    it('takes no more than there is', () => {
      const fields = createFields(SIZE);
      fields.water[0] = K.timestep * K.evaporationRate * 0.5;
      evaporate(fields, K);

      expect(fields.water[0]).toBe(0);
      expect(fields.ledger.evaporated).toBeCloseTo(K.timestep * K.evaporationRate * 0.5 * AREA, 9);
    });

    it('lays down what a cell was carrying when it dries, and leaves wet cells their load', () => {
      const fields = createFields(SIZE);
      fields.water[0] = K.dryDepth / 2;
      fields.suspended[0] = 0.3;
      fields.water[1] = 1;
      fields.suspended[1] = 0.3;
      const before = rockOn(fields);
      evaporate(fields, K);

      expect(fields.suspended[0]).toBe(0);
      expect(fields.regolith[0]).toBeCloseTo(0.3, 6);
      expect(fields.suspended[1]).toBeCloseTo(0.3, 6);
      expect(rockOn(fields)).toBeCloseTo(before, 6);
    });
  });

  describe('slumping', () => {
    const restLoose = K.talusRegolith * CELL;

    it('leaves alone a slope loose material can rest on', () => {
      const terrain = terrainOf((x) => x * restLoose * 0.9);
      const fields = createFields(SIZE);
      fields.regolith.fill(2);
      slump(fields, terrain, K);

      expect(new Set(fields.regolith)).toEqual(new Set([2]));
      expect(sum(fields.cut)).toBe(0);
    });

    it('slides loose material down a slope it cannot rest on, and makes none', () => {
      const terrain = terrainOf((x) => x * restLoose * 1.5);
      const fields = createFields(SIZE);
      fields.regolith.fill(2);
      const before = rockOn(fields);
      slump(fields, terrain, K);
      const inner = at(SIZE / 2, SIZE / 2);

      expect(fields.slumpLeft[inner]).toBeGreaterThan(0);
      expect(fields.slumpRight[inner]).toBe(0);
      expect(Math.abs(rockOn(fields) - before)).toBeLessThan(1e-4);
    });

    it('lowers a step without ever turning it over', () => {
      // one high column of loose material; each step sheds toward four neighbours at once
      const terrain = terrainOf(() => 100);
      const fields = createFields(SIZE);
      const top = at(SIZE / 2, SIZE / 2);
      fields.regolith[top] = 60;
      for (let n = 0; n < 50; n++) {
        const before = surfaceAt(fields, terrain, top) - surfaceAt(fields, terrain, top + 1);
        slump(fields, terrain, K);
        const after = surfaceAt(fields, terrain, top) - surfaceAt(fields, terrain, top + 1);

        expect(after).toBeGreaterThanOrEqual(0);
        expect(after).toBeLessThanOrEqual(before);
      }
      expect(surfaceAt(fields, terrain, top) - surfaceAt(fields, terrain, top + 1)).toBeLessThan(
        60
      );
    });

    it('holds bare rock at a slope loose material would not rest on', () => {
      const terrain = terrainOf((x) => x * restLoose * 1.3);
      const fields = createFields(SIZE);
      slump(fields, terrain, K);

      expect(sum(fields.cut)).toBe(0);
      expect(sum(fields.regolith)).toBe(0);
    });

    it('breaks rock steeper than its bed can hold, and the debris arrives next door as loose material', () => {
      const terrain = terrainOf((x) => x * K.talusRockSoft * CELL * 1.5);
      const fields = createFields(SIZE);
      const before = rockOn(fields);
      slump(fields, terrain, K);

      expect(sum(fields.cut)).toBeGreaterThan(0);
      expect(sum(fields.regolith)).toBeCloseTo(sum(fields.cut), 3);
      expect(Math.abs(rockOn(fields) - before)).toBeLessThan(1e-4);
    });

    it('lets a hard bed stand at a face a soft one cannot', () => {
      const face = (x: number): number => (x * (K.talusRockSoft + K.talusRockHard) * CELL) / 2;
      const soft = createFields(SIZE);
      slump(soft, terrainOf(face, 1), K);
      const hard = createFields(SIZE);
      slump(hard, terrainOf(face, 0), K);

      expect(sum(soft.cut)).toBeGreaterThan(0);
      expect(sum(hard.cut)).toBe(0);
    });

    it('slides nothing off the edge of the block', () => {
      const terrain = terrainOf(() => 5000);
      const fields = createFields(SIZE);
      fields.regolith.fill(3);
      slump(fields, terrain, K);

      expect(sum(fields.slumpLeft) + sum(fields.slumpRight)).toBe(0);
      expect(sum(fields.slumpUp) + sum(fields.slumpDown)).toBe(0);
    });
  });

  describe('a whole step', () => {
    const SMALL = 48;
    const constants: IErosionConstants = { ...EROSION, extent: SMALL * 16 };

    it('is the same every time: one seed, two runs, identical lands', () => {
      const run = (): IFields => {
        const { fields, terrain } = raise(HERO_SEED, SMALL, constants);
        for (let n = 0; n < 60; n++) {
          step(fields, terrain, constants, 1);
        }
        return fields;
      };
      const first = run();
      const second = run();

      expect(first.cut).toEqual(second.cut);
      expect(first.regolith).toEqual(second.regolith);
      expect(first.water).toEqual(second.water);
      expect(first.suspended).toEqual(second.suspended);
      expect(first.ledger).toEqual(second.ledger);
    });

    /**
     * the rock on the block plus the rock exported, over a hundred steps, as a share of the rock that moved.
     * measured at 8.8e-9 on this land, and at 1.6e-7 over three thousand steps of a 256 grid. nothing in the
     * model creates rock, so this is the rounding of 32-bit cells and nothing else; if it grows by orders of
     * magnitude, a pass has stopped conserving.
     */
    const ROCK_DRIFT = 1e-6;

    it('keeps the rock books over a hundred steps: nothing is made, and what leaves is counted', () => {
      const { fields, terrain } = raise(HERO_SEED, SMALL, constants);
      const before = tally(fields, terrain, constants).solid;
      for (let n = 0; n < 100; n++) {
        step(fields, terrain, constants, 1);
      }
      const after = tally(fields, terrain, constants);

      expect(after.cut).toBeGreaterThan(0);
      expect(fields.ledger.exported).toBeGreaterThan(0);
      expect(Math.abs(after.solid + fields.ledger.exported - before)).toBeLessThan(
        after.cut * ROCK_DRIFT
      );
    });

    it('stays finite and keeps every depth and thickness at or above zero', () => {
      const { fields, terrain } = raise(HERO_SEED, SMALL, constants);
      for (let n = 0; n < 300; n++) {
        step(fields, terrain, constants, 1);
      }

      for (const layer of [fields.cut, fields.regolith, fields.water, fields.suspended]) {
        expect(layer.every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
      }
    });

    it('keeps a cone four-fold symmetric under uniform rain', () => {
      const middle = (SIZE - 1) / 2;
      const terrain = terrainOf((x, y) => 400 - 9 * Math.hypot(x - middle, y - middle));
      const fields = createFields(SIZE);
      for (let n = 0; n < 100; n++) {
        step(fields, terrain, K, 1);
      }

      expect(sum(fields.cut)).toBeGreaterThan(0);
      for (const layer of [fields.cut, fields.water, fields.regolith]) {
        for (let y = 0; y < SIZE / 2; y++) {
          for (let x = 0; x < SIZE / 2; x++) {
            const here = layer[at(x, y)];
            const tolerance = 1e-4 * Math.max(1, Math.abs(here));
            expect(Math.abs(layer[at(SIZE - 1 - x, y)] - here)).toBeLessThanOrEqual(tolerance);
            expect(Math.abs(layer[at(x, SIZE - 1 - y)] - here)).toBeLessThanOrEqual(tolerance);
            expect(Math.abs(layer[at(y, x)] - here)).toBeLessThanOrEqual(tolerance);
          }
        }
      }
    });

    it('runs inside the stable timestep on the finest grid any tier uses', () => {
      for (const tier of QUALITY_TIERS) {
        const limit = stableTimestep(cellSize(tier.grid, EROSION), EROSION);

        expect(EROSION.timestep).toBeLessThan(limit);
      }
    });

    it('blows up past the stable timestep, which is what the limit is a limit of', () => {
      // not a wish: the proof that `stableTimestep` bounds something real, and not a formula that happens to pass
      const sloshing = (timestep: number): number => {
        const still: IErosionConstants = { ...K, timestep, rainRate: 0, evaporationRate: 0 };
        const terrain = terrainOf(() => K.baseLevel - 50);
        const fields = createFields(SIZE);
        for (let i = 0; i < SIZE * SIZE; i++) {
          // a checkerboard of depth: the fastest mode the pipes have
          fields.water[i] = 5 + ((i + Math.floor(i / SIZE)) % 2 === 0 ? 0.01 : -0.01);
        }
        for (let n = 0; n < 400; n++) {
          pipeFlux(fields, terrain, still);
          flow(fields, still);
        }
        const inner = at(SIZE / 2, SIZE / 2);
        return Math.abs(fields.water[inner] - fields.water[inner + 1]);
      };
      const limit = stableTimestep(CELL, K);

      expect(sloshing(limit * 0.9)).toBeLessThan(0.1);
      expect(sloshing(limit * 1.1)).toBeGreaterThan(1);
    });
  });
});
