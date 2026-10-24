import { CLAMP_SECONDS, TICK_SECONDS } from '../../batoid/batoid-calibration';
import { advance, clockSeconds, IClockState, STOPPED_CLOCK } from './cauldron-clock';

/** A clock that last saw a frame at `lastMs` and is carrying nothing. */
const runningAt = (lastMs: number): IClockState => ({
  lastMs,
  carriedSeconds: 0,
  flownSeconds: 0,
});

/** Feed `timestamps` through one clock in order; the ticks each frame was worth. */
const ticksFor = (timestamps: readonly number[]): number[] => {
  let clock = STOPPED_CLOCK;
  return timestamps.map((nowMs) => {
    const advanced = advance(clock, nowMs);
    clock = advanced.state;
    return advanced.ticks;
  });
};

/** `pool - ticks * TICK_SECONDS` leaves float dust where the answer is zero. */
const DUST = 12;

describe('advance', () => {
  it('is worth nothing on the first frame, whatever its timestamp', () => {
    for (const nowMs of [0, 16, 90_000]) {
      const advanced = advance(STOPPED_CLOCK, nowMs);

      expect(advanced.ticks).toBe(0);
      expect(advanced.state).toEqual({ lastMs: nowMs, carriedSeconds: 0, flownSeconds: 0 });
    }
  });

  it('turns a gap below the clamp into exactly that many whole ticks', () => {
    // TICK_SECONDS is 1/60, so every 50ms is three ticks.
    for (const [gapMs, ticks] of [
      [50, 3],
      [100, 6],
      [200, 12],
    ] as const) {
      const advanced = advance(runningAt(1_000), 1_000 + gapMs);

      expect(advanced.ticks).toBe(ticks);
      expect(advanced.state.carriedSeconds).toBeCloseTo(0, DUST);
    }
  });

  it('believes no gap longer than the clamp', () => {
    const capped = Math.floor(CLAMP_SECONDS / TICK_SECONDS);

    for (const gapMs of [CLAMP_SECONDS * 1000, 1_000, 60_000]) {
      expect(advance(runningAt(1_000), 1_000 + gapMs).ticks).toBe(capped);
    }
  });

  it('carries time too short for a tick into the next frame rather than dropping it', () => {
    const first = advance(runningAt(0), 10);
    const second = advance(first.state, 20);

    expect(first.ticks).toBe(0);
    expect(first.state.carriedSeconds).toBeCloseTo(0.01, DUST);
    expect(second.ticks).toBe(1);
    expect(second.state.carriedSeconds).toBeCloseTo(0.02 - TICK_SECONDS, DUST);
  });

  it('accounts for every second of sixty 60Hz frames, in ticks or in what it carries', () => {
    // Not "exactly sixty ticks": rAF stamps are absolute, so the gaps between
    // them carry rounding, and the sixtieth tick can land a hair under the
    // line and be carried into the next frame. Late is allowed; lost is not.
    let clock = STOPPED_CLOCK;
    let ticks = 0;
    for (let i = 0; i <= 60; i++) {
      const advanced = advance(clock, (i * 1000) / 60);
      clock = advanced.state;
      ticks += advanced.ticks;
    }

    expect(ticks * TICK_SECONDS + clock.carriedSeconds).toBeCloseTo(1, DUST);
    expect(clockSeconds(clock)).toBeCloseTo(1, DUST);
    expect(ticks).toBeGreaterThanOrEqual(59);
  });

  it('is worth nothing for a repeated or backwards timestamp, and keeps what it carried', () => {
    const carrying: IClockState = {
      lastMs: 1_000,
      carriedSeconds: TICK_SECONDS / 2,
      flownSeconds: 3 * TICK_SECONDS,
    };

    for (const nowMs of [1_000, 900]) {
      const advanced = advance(carrying, nowMs);

      expect(advanced.ticks).toBe(0);
      expect(advanced.state.carriedSeconds).toBe(TICK_SECONDS / 2);
      expect(advanced.state.flownSeconds).toBe(3 * TICK_SECONDS);
    }
  });

  it('survives a non-finite timestamp and resumes counting two frames later', () => {
    // The bad stamp is worth nothing, and so is the next frame, which is
    // measured from it; the one after is measured from a real stamp again.
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(ticksFor([1_000, bad, 1_100, 1_200])).toEqual([0, 0, 0, 6]);
    }
  });

  it('keeps what it carries below one tick and loses no time, across mixed refresh rates', () => {
    const gapsMs = [1000 / 60, 1000 / 144, 1000 / 120, 1000 / 30, 1000 / 75, 3, 41];
    let clock = STOPPED_CLOCK;
    let nowMs = 0;
    let ticks = 0;

    for (let frame = 0; frame < 10_000; frame++) {
      nowMs += gapsMs[frame % gapsMs.length];
      const advanced = advance(clock, nowMs);
      clock = advanced.state;
      ticks += advanced.ticks;

      expect(clock.carriedSeconds).toBeGreaterThanOrEqual(0);
      expect(clock.carriedSeconds).toBeLessThan(TICK_SECONDS);
    }

    // Every gap is under the clamp, so the ticks must account for all of the
    // time after the first frame, give or take float rounding at the last one.
    const firstMs = gapsMs[0];
    const owed = Math.floor((nowMs - firstMs) / 1000 / TICK_SECONDS);
    expect(Math.abs(ticks - owed)).toBeLessThanOrEqual(1);
  });

  it('leaves the state it was given untouched', () => {
    const state = Object.freeze(runningAt(1_000));

    advance(state, 1_100);

    expect(state).toEqual(runningAt(1_000));
  });

  it('adds to what it has flown only in whole ticks, so the carried remainder is never counted twice', () => {
    const first = advance(runningAt(0), 50);
    const second = advance(first.state, 60);

    expect(first.state.flownSeconds).toBeCloseTo(3 * TICK_SECONDS, DUST);
    expect(second.ticks).toBe(0);
    expect(second.state.flownSeconds).toBe(first.state.flownSeconds);
  });
});

describe('clockSeconds', () => {
  it('is what has been flown plus what is carried', () => {
    const state: IClockState = {
      lastMs: 0,
      carriedSeconds: TICK_SECONDS / 4,
      flownSeconds: 10 * TICK_SECONDS,
    };

    expect(clockSeconds(state)).toBe(10 * TICK_SECONDS + TICK_SECONDS / 4);
  });

  it('starts at zero', () => {
    expect(clockSeconds(STOPPED_CLOCK)).toBe(0);
  });

  it('glides forward between ticks instead of jumping at each one', () => {
    // 4ms frames are a quarter of a tick, so most of them bring no tick at all
    let clock = advance(STOPPED_CLOCK, 0).state;
    let previous = clockSeconds(clock);
    for (let nowMs = 4; nowMs <= 200; nowMs += 4) {
      clock = advance(clock, nowMs).state;
      const seconds = clockSeconds(clock);

      expect(seconds).toBeCloseTo(previous + 0.004, DUST);
      previous = seconds;
    }
  });

  it('moves on no more than the clamp when a hidden tab comes back, so the camera does not swing round', () => {
    const running = advance(advance(STOPPED_CLOCK, 0).state, 1_000).state;
    const returned = advance(running, 1_000 + 60_000).state;

    expect(clockSeconds(returned) - clockSeconds(running)).toBeCloseTo(CLAMP_SECONDS, DUST);
  });

  it('never runs backwards, whatever the timestamps do', () => {
    let clock = STOPPED_CLOCK;
    let previous = clockSeconds(clock);
    for (const nowMs of [1_000, 1_020, 900, Number.NaN, 1_050, 1_050, 5_000]) {
      clock = advance(clock, nowMs).state;

      expect(clockSeconds(clock)).toBeGreaterThanOrEqual(previous);
      previous = clockSeconds(clock);
    }
  });
});
