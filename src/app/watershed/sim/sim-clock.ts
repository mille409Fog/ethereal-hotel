/**
 * turns frames into whole steps of the simulation. the storm is a fixed number of steps; this decides how many
 * of them each frame runs, so that a device that keeps up finishes in `STORM_SECONDS` whatever its refresh rate.
 *
 * three things it refuses to do. it never runs more steps in a frame than the tier allows, so a slow device
 * falls behind the clock and takes longer over the same land, instead of spending ever longer frames trying to
 * catch up. it never counts a hidden tab's absence as time to make up. and it never runs past the storm's last
 * step. it is a value and a pure function over it, like the flock's clock, so each of those has a spec.
 */
import { CLOCK_STALL_MS } from './sim-calibration';

export interface ISimClock {
  /** the previous frame's timestamp, or null before the first */
  readonly lastMs: number | null;
  /** the fraction of a step owed from earlier frames */
  readonly owed: number;
  /** steps run so far */
  readonly steps: number;
}

export interface ISimTick {
  readonly clock: ISimClock;
  /** how many steps to run this frame */
  readonly steps: number;
}

/** a clock that has seen no frame and run no step */
export const UNSTARTED: ISimClock = { lastMs: null, owed: 0, steps: 0 };

/**
 * the clock after a frame at `nowMs`, and the steps that frame should run: `stepsPerSecond` of them a second,
 * at most `mostPerFrame` at once, and never past `total` in all.
 */
export function tick(
  clock: ISimClock,
  nowMs: number,
  stepsPerSecond: number,
  mostPerFrame: number,
  total: number
): ISimTick {
  if (clock.lastMs === null) {
    return { clock: { ...clock, lastMs: nowMs }, steps: 0 };
  }
  const elapsed = Math.min(Math.max(0, nowMs - clock.lastMs), CLOCK_STALL_MS);
  const due = clock.owed + (elapsed / 1000) * stepsPerSecond;
  const whole = Math.floor(due);
  const steps = Math.min(whole, mostPerFrame, total - clock.steps);
  // steps the cap refused are forgiven, not carried: carrying them is how a slow device spirals
  const owed = whole > steps ? 0 : due - whole;
  return { clock: { lastMs: nowMs, owed, steps: clock.steps + steps }, steps };
}
