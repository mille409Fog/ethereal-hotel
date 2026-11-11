/**
 * raises a whole land from one seed: the bedrock, the beds it is made of, and still, dry fields over it.
 *
 * the order chance is drawn in is part of what a seed means, so it is written once, here, and both the app and
 * the Node scripts go through this function. that is why it takes its collaborators as an argument instead of
 * importing them: this is a leaf module (see `fields.ts`), a leaf may not import a sibling's code, and the
 * alternative was the same six lines of wiring in two places, free to drift until a seed raised one land in the
 * browser and another in the stored image. `reference.ts` hands it the parts for the app; a script hands it the
 * same parts, imported by Node.
 */
import type { IErosionConstants } from './erosion-calibration';
import type { createFields, IFields, ITerrain } from './fields';
import type { createNoise } from './noise';
import type { IStrata, strataTable, strataWarp } from './strata';
import type { uplift } from './uplift';

export interface ILandParts {
  /** a generator of draws in [0, 1) from a 32-bit seed: `mulberry32` in `seed/seed.ts` */
  readonly random: (seed: number) => () => number;
  readonly createNoise: typeof createNoise;
  readonly createFields: typeof createFields;
  readonly uplift: typeof uplift;
  readonly strataTable: typeof strataTable;
  readonly strataWarp: typeof strataWarp;
}

export interface ILand {
  readonly seed: number;
  readonly fields: IFields;
  readonly terrain: ITerrain;
  /** the beds' colours beside their resistance; the model reads only the resistance, the picture reads both */
  readonly strata: IStrata;
}

/**
 * the beds are drawn from a second stream, started at the seed turned by this constant, so that changing how
 * many draws the noise makes cannot reshuffle the rock a seed is made of.
 */
const STRATA_STREAM = 0x9e3779b9;

export function raiseLand(
  seed: number,
  size: number,
  constants: IErosionConstants,
  entries: number,
  parts: ILandParts
): ILand {
  const noise = parts.createNoise(parts.random(seed));
  const strata = parts.strataTable(parts.random((seed ^ STRATA_STREAM) >>> 0), constants, entries);
  const raised = new Float32Array(size * size);
  const warp = new Float32Array(size * size);
  parts.uplift(raised, size, constants, noise);
  parts.strataWarp(warp, size, constants, noise);
  return {
    seed,
    fields: parts.createFields(size),
    terrain: { size, uplift: raised, warp, erodibility: strata.erodibility },
    strata,
  };
}
