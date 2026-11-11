/** how the storm is paced on screen. the model's own numbers are in `model/erosion-calibration.ts` */

/**
 * how long a whole storm takes on a device that keeps up, in seconds. the storm is counted in steps, not in
 * these: a device that cannot run this many steps a second takes longer and makes the same land.
 */
export const STORM_SECONDS = 90;

/**
 * a gap between frames longer than this is a tab that was hidden. the clock counts it as this much and no more,
 * so coming back to the tab does not spend a minute's worth of steps in one frame.
 */
export const CLOCK_STALL_MS = 250;

/**
 * the state line says how far the storm has got, and is told every this many steps. the count changes every
 * frame; the sentence a visitor reads, and a screen reader may re-read, should not.
 */
export const REPORT_EVERY = 100;

/**
 * the share of the storm it rains for; the rest lets the land drain. provisional, and here only until the phase
 * that directs the storm gives the rain a curve of its own.
 */
export const RAIN_SHARE = 0.85;
