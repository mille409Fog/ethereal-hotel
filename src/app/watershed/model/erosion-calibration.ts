/**
 * every number the model runs on, with its unit.
 *
 * ## what these numbers are, and what they are not
 *
 * lengths are metres and times are seconds, and the equations are dimensionally honest, so a volume read out of
 * the model is a real quantity of the model's rock. but the rates are not a climate and the rock is not a rock:
 * the rain is a deluge no sky has delivered and the erodibility is tuned so that a storm of `stormSteps` steps
 * carves a landscape a visitor can watch form. the model has no calendar, and nothing derived from it may claim one.
 *
 * all of them are provisional until the phase that tunes the look, which sets them with the picture running.
 * the two that are not free are the timestep, which `stableTimestep` bounds, and the three rates multiplied by
 * it, which `step.ts` requires to be at most 1; `erosion-calibration.spec.ts` holds both.
 *
 * a leaf module: see `fields.ts`.
 */

export interface IErosionConstants {
  /** side of the block, metres */
  readonly extent: number;
  /** the height of the ground outside the block, which is where every river is going, metres */
  readonly baseLevel: number;
  /** metres per second squared */
  readonly gravity: number;
  /** seconds of model time in one step */
  readonly timestep: number;
  /**
   * depth of the notional pipe that carries water between two cells, metres. the pipe is as wide as a cell, so
   * its area is this times the cell size, and a wave crosses the land at the square root of gravity times this.
   */
  readonly pipeDepth: number;
  /** depth of rain falling per second at full strength, metres a second */
  readonly rainRate: number;
  /** depth of standing water lost to the air per second, metres a second. a rate, not a share: a lake outlasts a film */
  readonly evaporationRate: number;
  /** water shallower than this is a film with no velocity worth dividing by, metres */
  readonly depthFloor: number;
  /** the fastest the water is allowed to move, metres a second */
  readonly maxSpeed: number;

  /** sediment a flow can hold, as thickness in metres, per unit of tilt and per metre a second of speed: seconds */
  readonly capacity: number;
  /** share of the unfilled capacity picked up per second, 1/s */
  readonly dissolveRate: number;
  /** share of the excess sediment laid down per second, 1/s */
  readonly depositRate: number;
  /** how many times more readily loose material is picked up than the softest bedrock */
  readonly regolithFactor: number;
  /** the least tilt a flow is credited with, as a sine, so water crossing a flat still carries something */
  readonly minTilt: number;
  /** water shallower than this carries less than its speed implies, in proportion, metres */
  readonly rampDepth: number;
  /** below this depth a cell is dry and whatever its water still held is laid down, metres */
  readonly dryDepth: number;

  /** the slope loose material comes to rest at, as rise over run */
  readonly talusRegolith: number;
  /** the slope the softest bedrock holds before it breaks, as rise over run */
  readonly talusRockSoft: number;
  /** the slope the hardest bedrock holds, as rise over run */
  readonly talusRockHard: number;
  /** share of the excess over the talus slope that slides in one step */
  readonly slumpShare: number;

  /** height of the highest ground above base level before erosion, metres */
  readonly relief: number;
  /** how far in from an edge the land has risen to its full height, as a share of the side */
  readonly edgeWidth: number;
  /** features across the block at the lowest octave of the ridges */
  readonly ridgeFrequency: number;
  readonly ridgeOctaves: number;
  /** how far the ridges are pushed about, as a share of the side, and how many swirls across do the pushing */
  readonly warpStrength: number;
  readonly warpFrequency: number;

  /** the elevation of the lowest bed's floor, and the height all the beds together span, metres */
  readonly strataFloor: number;
  readonly strataSpan: number;
  /** the least and most table entries one bed spans; an entry is `strataSpan / 256` thick */
  readonly bedThinnest: number;
  readonly bedThickest: number;
  /** the erodibility of the hardest bed there can be; the softest is 1 */
  readonly hardestBed: number;
  /** how far the beds dip from one side of the block to the other, and how far they are folded, metres */
  readonly strataDip: number;
  readonly strataFold: number;

  /** steps in one storm */
  readonly stormSteps: number;
}

export const EROSION: IErosionConstants = {
  extent: 8000,
  baseLevel: 0,
  gravity: 9.81,
  timestep: 1,
  pipeDepth: 1,
  rainRate: 1.5e-4,
  evaporationRate: 1e-5,
  depthFloor: 1e-3,
  maxSpeed: 12,

  capacity: 0.8,
  dissolveRate: 0.03,
  depositRate: 0.05,
  regolithFactor: 4,
  minTilt: 0.02,
  rampDepth: 0.05,
  dryDepth: 1e-4,

  talusRegolith: 0.7,
  talusRockSoft: 1.1,
  talusRockHard: 3,
  slumpShare: 0.1,

  relief: 1900,
  edgeWidth: 0.16,
  ridgeFrequency: 2.6,
  ridgeOctaves: 6,
  warpStrength: 0.11,
  warpFrequency: 1.7,

  strataFloor: -500,
  strataSpan: 2900,
  bedThinnest: 4,
  bedThickest: 22,
  hardestBed: 0.12,
  strataDip: 260,
  strataFold: 140,

  stormSteps: 12000,
};

/** entries in the strata table. a texture's width on the GPU, so not a tunable */
export const STRATA_ENTRIES = 256;

/** the side of one cell on a grid of `size`, metres */
export function cellSize(size: number, constants: IErosionConstants): number {
  return constants.extent / size;
}

/**
 * the longest timestep the pipe model survives on cells of this size, seconds.
 *
 * the fastest thing the pipes can do is slosh between neighbouring cells in a checkerboard: every cell's four
 * pipes push the same way, and each pipe's flow lowers one end and raises the other, so the head across a pipe
 * falls at eight flows per cell area. and a pipe here is two one-way flows that cannot go negative. while the
 * slosh is reversing both are above zero, one growing as the other dies, so the net flow answers the head twice
 * as hard as either does alone. that makes an oscillator of angular frequency
 * `sqrt(16 * area * gravity / (length * cell^2))`, and the update, which moves the flux and then the depth with
 * the new flux, holds one only while frequency times timestep is under 2. with a pipe as long and as wide as a
 * cell that comes to the line below. the depth of the water does not appear in it; in this model the pipe's
 * depth stands in for it.
 *
 * the first version of this line forgot the doubling and allowed a timestep 1.41 times too long, and the spec
 * that runs a checkerboard either side of the limit caught it. the line was then measured, not only derived:
 * bisecting for the timestep at which a checkerboard grows gave 0.501 of `cell / sqrt(gravity * pipeDepth)` at
 * every cell size, pipe depth and water depth tried, and 0.709 for stripes, which have half the pipes.
 */
export function stableTimestep(cell: number, constants: IErosionConstants): number {
  return cell / (2 * Math.sqrt(constants.gravity * constants.pipeDepth));
}
