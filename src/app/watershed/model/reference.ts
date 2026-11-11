/**
 * the reference model as the app uses it: `raise` a land from a seed, then `step` it.
 *
 * this is the one file under `model/` that is not a leaf. it imports its siblings' code, which Node cannot do,
 * so no script imports it; a script imports the leaves and hands `raiseLand` the same parts this does.
 */
import { mulberry32 } from '../seed/seed';
import { EROSION, IErosionConstants, STRATA_ENTRIES } from './erosion-calibration';
import { createFields } from './fields';
import { ILand, ILandParts, raiseLand } from './land';
import { createNoise } from './noise';
import { strataTable, strataWarp } from './strata';
import { uplift } from './uplift';

export const LAND_PARTS: ILandParts = {
  random: mulberry32,
  createNoise,
  createFields,
  uplift,
  strataTable,
  strataWarp,
};

/** the land a seed names, on a grid of `size`, raised and not yet rained on */
export function raise(seed: number, size: number, constants: IErosionConstants = EROSION): ILand {
  return raiseLand(seed, size, constants, STRATA_ENTRIES, LAND_PARTS);
}
