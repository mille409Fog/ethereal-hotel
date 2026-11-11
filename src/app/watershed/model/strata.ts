/**
 * what the land is made of: a stack of beds, each with its own resistance and its own colour, read by elevation.
 *
 * the stack is one table for the whole block, and a point's bed is found from the height of its bedrock plus a
 * small offset that varies across the block. the offset is what tilts and folds the beds; without it every bed
 * would outcrop along a contour line and the land would look like a terraced model. because the lookup is by the
 * bedrock's present height, erosion moves a point down through the stack: a stream that has cut through a soft
 * bed meets the hard one under it and slows, and the bench and the cliff appear where nobody placed them.
 *
 * a leaf module: see `fields.ts`.
 */
import type { IErosionConstants } from './erosion-calibration';
import type { INoise } from './noise';

export interface IStrata {
  /** how readily each entry erodes, in [hardestBed, 1], lowest elevation first */
  readonly erodibility: Float32Array;
  /** each entry's colour as linear red, green, blue in [0, 1], three numbers an entry */
  readonly colours: Float32Array;
}

/**
 * rock colours, linear, from which each bed takes a mix of two neighbours. provisional: the phase that tunes the
 * look sets them against the sky and the grade. ordered so that neighbours in the list are plausible neighbours
 * in a cliff.
 */
const ROCKS: ReadonlyArray<readonly [number, number, number]> = [
  [0.21, 0.17, 0.14],
  [0.33, 0.25, 0.18],
  [0.45, 0.34, 0.24],
  [0.52, 0.45, 0.36],
  [0.4, 0.38, 0.35],
  [0.27, 0.26, 0.26],
];

/**
 * the stack of beds, drawn from `random`. beds are runs of entries sharing one resistance and one colour, so a
 * bed has a thickness; resistance is drawn with a lean toward the soft end, so hard beds are the exception that
 * stands out.
 */
export function strataTable(
  random: () => number,
  constants: IErosionConstants,
  entries: number
): IStrata {
  const erodibility = new Float32Array(entries);
  const colours = new Float32Array(entries * 3);
  let entry = 0;
  while (entry < entries) {
    const thickness =
      constants.bedThinnest +
      Math.floor(random() * (constants.bedThickest - constants.bedThinnest + 1));
    // the square root leans the draw toward 1: most beds are soft
    const soft = constants.hardestBed + (1 - constants.hardestBed) * Math.sqrt(random());
    const along = random() * (ROCKS.length - 1);
    const from = ROCKS[Math.floor(along)];
    const to = ROCKS[Math.min(ROCKS.length - 1, Math.floor(along) + 1)];
    const mix = along - Math.floor(along);
    for (let within = 0; within < thickness && entry < entries; within++, entry++) {
      erodibility[entry] = soft;
      for (let channel = 0; channel < 3; channel++) {
        colours[entry * 3 + channel] = from[channel] + (to[channel] - from[channel]) * mix;
      }
    }
  }
  return { erodibility, colours };
}

/**
 * fills `target` with the offset added to a bedrock height before the lookup, in metres: a plane, which dips the
 * beds across the block in a direction the noise chooses, plus two swirls of fold.
 */
export function strataWarp(
  target: Float32Array,
  size: number,
  constants: IErosionConstants,
  noise: INoise
): void {
  const last = size - 1;
  const bearing = noise.at(3.3, 7.7) * Math.PI;
  const dipX = Math.cos(bearing) * constants.strataDip;
  const dipY = Math.sin(bearing) * constants.strataDip;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const acrossX = x / last;
      const acrossY = y / last;
      const dip = (acrossX - 0.5) * dipX + (acrossY - 0.5) * dipY;
      const fold = noise.fbm(acrossX * 1.6 + 71.3, acrossY * 1.6 - 23.9, 2) * constants.strataFold;
      target[y * size + x] = dip + fold;
    }
  }
}
