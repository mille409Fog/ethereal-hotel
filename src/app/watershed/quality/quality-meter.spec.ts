import { MEASURE_WINDOW_MS, QUALITY_TIERS, SLOW_FRAME_MS, STALL_MS } from './quality-calibration';
import { IQualityMeter, measure, UNMEASURED } from './quality-meter';

const TIERS = QUALITY_TIERS.length;

/** feeds the meter frames `frameMs` apart, starting at `fromMs`, until `forMs` has passed */
const run = (
  meter: IQualityMeter,
  fromMs: number,
  frameMs: number,
  forMs: number
): IQualityMeter => {
  let next = meter;
  for (let now = fromMs; now <= fromMs + forMs; now += frameMs) {
    next = measure(next, now, TIERS);
  }
  return next;
};

const FAST_MS = 16;
const SLOW_MS = 40;

describe('quality meter', () => {
  it('starts at the best tier, unsettled', () => {
    expect(UNMEASURED.tier).toBe(0);
    expect(UNMEASURED.settled).toBe(false);
  });

  it('judges nothing before a window has passed', () => {
    const meter = run(UNMEASURED, 5_000, SLOW_MS, MEASURE_WINDOW_MS / 2);

    expect(meter.tier).toBe(0);
    expect(meter.settled).toBe(false);
  });

  it('keeps the best tier when its frames are fast, and settles', () => {
    const meter = run(UNMEASURED, 5_000, FAST_MS, MEASURE_WINDOW_MS + FAST_MS);

    expect(meter.tier).toBe(0);
    expect(meter.settled).toBe(true);
  });

  it('steps down one tier after a slow window, and watches again before settling', () => {
    const meter = run(UNMEASURED, 5_000, SLOW_MS, MEASURE_WINDOW_MS);

    expect(meter.tier).toBe(1);
    expect(meter.settled).toBe(false);
    expect(meter.frames).toBe(0);
  });

  it('settles on the tier whose window passes', () => {
    const slow = run(UNMEASURED, 5_000, SLOW_MS, MEASURE_WINDOW_MS);
    const meter = run(
      slow,
      5_000 + MEASURE_WINDOW_MS + FAST_MS,
      FAST_MS,
      MEASURE_WINDOW_MS + FAST_MS
    );

    expect(meter.tier).toBe(1);
    expect(meter.settled).toBe(true);
  });

  it('settles on the last tier however slow it is, having nowhere left to go', () => {
    const meter = run(UNMEASURED, 5_000, SLOW_MS, MEASURE_WINDOW_MS * (TIERS + 1));

    expect(meter.tier).toBe(TIERS - 1);
    expect(meter.settled).toBe(true);
  });

  it('never changes once settled', () => {
    const settled = run(UNMEASURED, 5_000, FAST_MS, MEASURE_WINDOW_MS + FAST_MS);

    expect(run(settled, 9_000, SLOW_MS, MEASURE_WINDOW_MS * 3)).toBe(settled);
  });

  it('starts its window again after a stall, rather than blaming the tier for a hidden tab', () => {
    const halfway = run(UNMEASURED, 5_000, FAST_MS, MEASURE_WINDOW_MS / 2);
    const afterStall = measure(halfway, 5_000 + MEASURE_WINDOW_MS / 2 + STALL_MS * 40, TIERS);

    expect(afterStall.tier).toBe(0);
    expect(afterStall.settled).toBe(false);
    expect(afterStall.frames).toBe(0);
  });

  it('draws the line at the calibrated frame time', () => {
    const justFast = run(UNMEASURED, 0, SLOW_FRAME_MS - 1, MEASURE_WINDOW_MS + SLOW_FRAME_MS);
    const justSlow = run(UNMEASURED, 0, SLOW_FRAME_MS + 1, MEASURE_WINDOW_MS + SLOW_FRAME_MS);

    expect(justFast.tier).toBe(0);
    expect(justSlow.tier).toBe(1);
  });

  it('orders the tiers best first: no tier costs more than the one before it', () => {
    for (let index = 1; index < TIERS; index++) {
      const better = QUALITY_TIERS[index - 1];
      const worse = QUALITY_TIERS[index];

      expect(worse.resolutionScale).toBeLessThanOrEqual(better.resolutionScale);
      expect(worse.grid).toBeLessThanOrEqual(better.grid);
      expect(worse.stepsPerFrame).toBeLessThanOrEqual(better.stepsPerFrame);
    }
  });
});
