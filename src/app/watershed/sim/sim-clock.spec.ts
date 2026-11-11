import { CLOCK_STALL_MS } from './sim-calibration';
import { ISimClock, tick, UNSTARTED } from './sim-clock';

const RATE = 100; // steps a second: one every 10ms
const MOST = 6;
const TOTAL = 1000;

/** runs frames at the given timestamps and returns the clock and the steps each frame ran */
const run = (
  timestamps: readonly number[],
  from: ISimClock = UNSTARTED,
  total = TOTAL
): { clock: ISimClock; ran: number[] } => {
  let clock = from;
  const ran: number[] = [];
  for (const now of timestamps) {
    const ticked = tick(clock, now, RATE, MOST, total);
    clock = ticked.clock;
    ran.push(ticked.steps);
  }
  return { clock, ran };
};

describe('sim clock', () => {
  it('runs nothing on the first frame, whatever its timestamp', () => {
    const { clock, ran } = run([90_000]);

    expect(ran).toEqual([0]);
    expect(clock.steps).toBe(0);
  });

  it('runs a step for every step-length of time that has passed', () => {
    const { clock, ran } = run([1_000, 1_030, 1_050]);

    expect(ran).toEqual([0, 3, 2]);
    expect(clock.steps).toBe(5);
  });

  it('carries a part of a step across frames, so short frames add up', () => {
    const { ran } = run([1_000, 1_004, 1_008, 1_012]);

    // 4ms, 8ms, then 12ms in all: the third frame crosses a whole step
    expect(ran).toEqual([0, 0, 0, 1]);
  });

  it('keeps the same pace at any frame rate', () => {
    const at60 = run(Array.from({ length: 61 }, (_, frame) => 1_000 + (frame * 1000) / 60));
    const at30 = run(Array.from({ length: 31 }, (_, frame) => 1_000 + (frame * 1000) / 30));

    expect(Math.abs(at60.clock.steps - RATE)).toBeLessThanOrEqual(1);
    expect(Math.abs(at30.clock.steps - RATE)).toBeLessThanOrEqual(1);
  });

  it('runs no more in a frame than the tier allows, and forgives the rest instead of owing it', () => {
    // 200ms is twenty steps' worth; the cap is six
    const { clock, ran } = run([1_000, 1_200, 1_210]);

    expect(ran).toEqual([0, MOST, 1]);
    expect(clock.steps).toBe(MOST + 1);
  });

  it('counts a hidden tab as one stall, not as time to make up', () => {
    const stalled = run([1_000, 61_000]);
    const capped = run([1_000, 1_000 + CLOCK_STALL_MS]);

    expect(stalled.ran).toEqual(capped.ran);
  });

  it('ignores a timestamp that runs backwards', () => {
    const { ran } = run([1_000, 900]);

    expect(ran).toEqual([0, 0]);
  });

  it('stops at the last step of the storm and runs nothing after it', () => {
    const { clock, ran } = run([1_000, 1_050, 1_100, 1_150], UNSTARTED, 8);

    expect(ran).toEqual([0, 5, 3, 0]);
    expect(clock.steps).toBe(8);
  });
});
