/**
 * the quality tiers, best first, and the numbers that decide between them.
 *
 * a tier is three costs. `resolutionScale` multiplies the capped pixel ratio and is applied by the component today.
 * `grid` is the side of the simulation's textures and `stepsPerFrame` how many simulation steps one frame may spend;
 * the simulation driver and its clock read those two, so a tier is chosen once and means the same thing to all three.
 */

export interface IQualityTier {
  readonly name: string;
  /** multiplies the pixel ratio the picture is drawn at; 1 is the capped device ratio */
  readonly resolutionScale: number;
  /** side of the square simulation textures, in texels */
  readonly grid: number;
  /** the most simulation steps one frame may run */
  readonly stepsPerFrame: number;
}

/** best first: the meter starts at the top and only ever steps down */
export const QUALITY_TIERS: readonly IQualityTier[] = [
  { name: 'high', resolutionScale: 1, grid: 1024, stepsPerFrame: 8 },
  { name: 'middle', resolutionScale: 1, grid: 512, stepsPerFrame: 6 },
  { name: 'low', resolutionScale: 0.6, grid: 512, stepsPerFrame: 3 },
];

/** how long the meter watches a tier before judging it, in milliseconds */
export const MEASURE_WINDOW_MS = 1000;

/**
 * a window whose mean frame is longer than this steps down a tier: 45 frames a second. a display paints no faster
 * than its refresh, so frame time can show that a tier is too dear and can never show that a dearer one would fit;
 * that is why the tiers are tried from the top.
 */
export const SLOW_FRAME_MS = 1000 / 45;

/**
 * a single gap this long is a tab that was hidden, not a slow frame. the window starts again rather than
 * blaming the tier for it.
 */
export const STALL_MS = 250;
