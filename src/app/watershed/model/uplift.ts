/**
 * raises the land: the height of the bedrock before a drop of rain has fallen on it.
 *
 * it is deliberately not a finished landscape. it is ridged noise under a broad dome, which is what fractal
 * terrain looks like and why fractal terrain looks fake: the ridges are there and the valleys do not connect.
 * connecting them is the simulation's work, and the less this file pretends to have done it the more of the
 * result is the model's.
 *
 * three things about its shape are requirements, not taste:
 *
 * - **every edge cell is exactly at base level.** water leaves the model by flowing off the edge, toward ground
 *   outside that is at base level. an edge standing above it would be a cliff the whole perimeter pours over; one
 *   below it would be a moat. so the height is multiplied by a term that is exactly zero on the outermost cells.
 * - **the high ground is inland**, so there is a divide and the rivers run outward from it to all four sides.
 * - **it is a function of position on the block, not of the grid**, so 512 and 1024 cells raise the same land
 *   and a tier changes how finely it is sampled, not which land it is.
 *
 * a leaf module: see `fields.ts`.
 */
import type { IErosionConstants } from './erosion-calibration';
import type { INoise } from './noise';

/** share of the full height the lowest inland ground still has, so the valleys of the noise are not at sea level */
const FLOOR_SHARE = 0.22;
/** how much of the shape is ridges; the rest is rolling ground */
const RIDGE_SHARE = 0.7;
/** below 1 the dome is broad and flat-topped, so the divide is a region rather than a point */
const DOME_POWER = 0.55;

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** fills `target` with the raised bedrock for a grid of `size`, row by row, in metres */
export function uplift(
  target: Float32Array,
  size: number,
  constants: IErosionConstants,
  noise: INoise
): void {
  const last = size - 1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // 0 on the first cell and 1 on the last, so the outermost cells sit exactly on the block's edge
      const acrossX = x / last;
      const acrossY = y / last;

      const pushX = noise.fbm(
        acrossX * constants.warpFrequency + 31.7,
        acrossY * constants.warpFrequency + 11.3,
        3
      );
      const pushY = noise.fbm(
        acrossX * constants.warpFrequency - 19.1,
        acrossY * constants.warpFrequency + 47.9,
        3
      );
      const atX = (acrossX + pushX * constants.warpStrength) * constants.ridgeFrequency;
      const atY = (acrossY + pushY * constants.warpStrength) * constants.ridgeFrequency;

      const ridges = noise.ridged(atX, atY, constants.ridgeOctaves);
      const rolling = noise.fbm(atX * 0.5 + 5.2, atY * 0.5 - 8.4, 4) * 0.5 + 0.5;
      const shape = RIDGE_SHARE * ridges + (1 - RIDGE_SHARE) * rolling;

      const dome = Math.pow(
        (1 - (2 * acrossX - 1) ** 2) * (1 - (2 * acrossY - 1) ** 2),
        DOME_POWER
      );
      const fromEdge = Math.min(acrossX, 1 - acrossX, acrossY, 1 - acrossY);
      const risen = smoothstep(0, constants.edgeWidth, fromEdge);

      target[y * size + x] =
        constants.baseLevel +
        constants.relief * risen * dome * (FLOOR_SHARE + (1 - FLOOR_SHARE) * shape);
    }
  }
}
