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
 * the readout's volumes are read back from the GPU at most this often, milliseconds. the read is asynchronous and
 * costs no stall, but each is a sum of the whole land, and a figure that changes faster than it can be read is
 * not read.
 */
export const READ_EVERY_MS = 1000;

/**
 * the readout is not a live region; a one-sentence digest of it is, and is rewritten this often, milliseconds.
 * the dashboard's reasoning (`metrics-grid.ts`): a live region that changes every second queues speech faster
 * than it can be heard, and 30 s is about the shortest gap at which one sentence finishes with room after it.
 */
export const ANNOUNCE_EVERY_MS = 30_000;
