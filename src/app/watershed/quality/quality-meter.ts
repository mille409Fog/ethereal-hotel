/**
 * chooses a quality tier from how long frames actually take, never from what the browser says it is. the meter
 * watches one window of frames at the best tier; if their mean is too slow it steps down and watches again, and
 * the first window that passes, or the last tier, settles it for the rest of the visit.
 *
 * it is a value and a pure function over it, like the flock's clock, so every case is tested without a browser.
 */
import { MEASURE_WINDOW_MS, SLOW_FRAME_MS, STALL_MS } from './quality-calibration';

export interface IQualityMeter {
  /** index into the tiers, 0 the best */
  readonly tier: number;
  /** true once the tier will no longer change */
  readonly settled: boolean;
  /** when the current window began, or null before its first frame */
  readonly windowStartMs: number | null;
  /** the previous frame's timestamp, or null before the first */
  readonly lastMs: number | null;
  /** frames counted in the current window, not counting the one that opened it */
  readonly frames: number;
}

/** a meter that has seen nothing, at the best tier */
export const UNMEASURED: IQualityMeter = {
  tier: 0,
  settled: false,
  windowStartMs: null,
  lastMs: null,
  frames: 0,
};

/** the meter after one more frame at `nowMs`, for a ladder of `tierCount` tiers */
export function measure(meter: IQualityMeter, nowMs: number, tierCount: number): IQualityMeter {
  if (meter.settled) {
    return meter;
  }
  const stalled = meter.lastMs !== null && nowMs - meter.lastMs > STALL_MS;
  if (meter.windowStartMs === null || stalled) {
    return { ...meter, windowStartMs: nowMs, lastMs: nowMs, frames: 0 };
  }
  const frames = meter.frames + 1;
  const elapsed = nowMs - meter.windowStartMs;
  if (elapsed < MEASURE_WINDOW_MS) {
    return { ...meter, lastMs: nowMs, frames };
  }
  const slow = elapsed / frames > SLOW_FRAME_MS;
  const lowest = meter.tier >= tierCount - 1;
  if (slow && !lowest) {
    return { tier: meter.tier + 1, settled: false, windowStartMs: nowMs, lastMs: nowMs, frames: 0 };
  }
  return { ...meter, settled: true, lastMs: nowMs, frames };
}
