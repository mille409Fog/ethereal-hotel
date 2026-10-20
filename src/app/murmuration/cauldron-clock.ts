import { CLAMP_SECONDS, TICK_SECONDS } from './batoid-calibration';

/** the elements which define the current conception of time */
export interface IClockState {
  /** the previous frame's time state, possibly undefined */
  readonly lastMs: number | undefined;
  /** some unit of time less than the amount of time required to generate a whole tick, measured in seconds. similar to the remainder after division, we are measuring modulo tick */
  readonly carriedSeconds: number;
}

export const STOPPED_CLOCK: IClockState = { lastMs: undefined, carriedSeconds: 0 };

export interface IClockAdvance {
  readonly state: IClockState;
  readonly ticks: number;
}

export function advance(state: IClockState, nowMs: number): IClockAdvance {
  const elapsed = state.lastMs === undefined ? 0 : (nowMs - state.lastMs) / 1000;
  // fairly similar to the temporal conception in aubade, this is similar to a currency conversion between different forms of time
  const frame = Number.isFinite(elapsed) ? Math.min(Math.max(elapsed, 0), CLAMP_SECONDS) : 0;
  const pool = state.carriedSeconds + frame;
  const ticks = Math.floor(pool / TICK_SECONDS);

  return {
    state: { lastMs: nowMs, carriedSeconds: pool - ticks * TICK_SECONDS },
    ticks,
  };
}
