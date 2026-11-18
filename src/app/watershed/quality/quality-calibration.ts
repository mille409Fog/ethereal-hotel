/**
 * the quality tiers, best first, and the numbers that decide between them.
 *
 * a tier is four costs. `resolutionScale` multiplies the capped pixel ratio and `samples` is the antialiasing of the
 * buffer the scene is drawn into; the component applies both. `grid` is the side of the simulation's textures and
 * `stepsPerFrame` how many simulation steps one frame may spend; the simulation driver and its clock read those two.
 *
 * the tier is measured twice. first on the empty stage, which is quick and sends a slow device straight down
 * without making it pay for a storm; then with the storm running on that tier, which may step down further and
 * never up. a step down to a smaller grid starts the storm again on it, within its first second or two; the
 * empty stage alone let a device settle on a grid it could not keep up with. so the grid of the top two tiers
 * differs and the bottom two share one, and a storm restarts at most once.
 *
 * ## frame times, measured during the storm against the production build
 *
 *     device                          settled on   median     95th pct   when
 *     RTX 3070 Ti, Chromium, D3D11    high         16.7 ms    16.7 ms    2026-11-18, the display's 60, on pace
 *     SwiftShader, this box           low          383 ms     1183 ms    2026-11-18, slower, the same storm
 *
 * no phone has been measured, and no device here settles on the middle tier. a phone emulated by throttling a
 * desktop would be a desktop's number with a phone's name, so the table does not have one; the first real phone
 * that loads the route is where the next row comes from.
 *
 * the storm's start was one main-thread task of 902 ms on the RTX box with the land raised there, and is 514 ms
 * with it raised in a worker (`sim/raise-land.ts`). what is left is the storm's own setup, compiling its shaders and
 * uploading its textures, and no tier changes that.
 */

export interface IQualityTier {
  readonly name: string;
  /** multiplies the pixel ratio the picture is drawn at; 1 is the capped device ratio */
  readonly resolutionScale: number;
  /** side of the square simulation textures, in texels */
  readonly grid: number;
  /** the most simulation steps one frame may run */
  readonly stepsPerFrame: number;
  /**
   * samples a pixel of the buffer the scene is drawn into: 0 is none, and the land's ridgelines stair-step. four
   * cost nothing that showed on this box's graphics card (2026-11-12) and took the software rasteriser's empty
   * stage from 117 ms a frame to 420, which the meter now steps down from; so the lowest tier has none
   */
  readonly samples: number;
}

/** best first: the meter starts at the top and only ever steps down */
export const QUALITY_TIERS: readonly IQualityTier[] = [
  { name: 'high', resolutionScale: 1, grid: 1024, stepsPerFrame: 8, samples: 4 },
  { name: 'middle', resolutionScale: 1, grid: 512, stepsPerFrame: 6, samples: 4 },
  { name: 'low', resolutionScale: 0.6, grid: 512, stepsPerFrame: 3, samples: 0 },
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

/**
 * this many such gaps in a row, with no ordinary frame between, are not a hidden tab but a device that slow, and
 * are judged as a slow window would be. a tab comes back once; a slow device never stops taking this long.
 */
export const SLOW_STALLS = 4;
