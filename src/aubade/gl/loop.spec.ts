import {
  advance,
  browserScheduler,
  FIXED_STEP_MS,
  FrameLoop,
  INITIAL_ACCUMULATOR,
  MAX_FRAME_MS,
  type IAccumulatorState,
  type IFrame,
  type IFrameScheduler,
} from './loop';

/**
 * The accumulator, and the loop that turns it.
 *
 * Everything time-varying in AUBADE is a function of `simulatedMs`, so a bug in
 * here is not a bug in one room — it is a bug in the clock every room reads, and
 * it presents as "the camera is subtly wrong on my machine", which is close to
 * undebuggable after the fact. Hence the disproportionate number of tests for
 * forty lines of arithmetic.
 *
 * Two properties carry most of the weight and are worth naming before the cases:
 *
 * - **Conservation.** Simulated time plus carried time equals every millisecond
 *   the accumulator was given and believed. Nothing is invented and nothing is
 *   dropped. This is what makes the piece run at the same rate as the wall clock
 *   rather than drifting away from it over an hour.
 * - **Boundedness.** `carriedMs` stays inside one tick and `alpha` inside `[0, 1)`
 *   for every input, including the hostile ones. This is what stops a stall from
 *   compounding.
 */

/** Sum a run of frames onto a starting state, returning the last advance. */
function run(from: IAccumulatorState, frames: readonly number[]): IAccumulatorState {
  return frames.reduce((state, frameMs) => advance(state, frameMs).state, from);
}

describe('the fixed-step accumulator', () => {
  describe('the constants', () => {
    it('ticks at 120Hz', () => {
      // Twice 60 so an ordinary frame is exactly two ticks and nothing is
      // carried on the common case.
      expect(FIXED_STEP_MS).toBeCloseTo(8.3333, 4);
      expect(1000 / FIXED_STEP_MS).toBeCloseTo(120, 10);
    });

    it('refuses to believe a frame longer than a quarter second', () => {
      expect(MAX_FRAME_MS).toBe(250);
      // Whatever the number is, it has to be several ordinary frames or a
      // hiccup becomes a visible stutter.
      expect(MAX_FRAME_MS).toBeGreaterThan(FIXED_STEP_MS * 8);
    });

    it('starts at zero with nothing carried', () => {
      expect(INITIAL_ACCUMULATOR).toEqual({ simulatedMs: 0, carriedMs: 0 });
    });
  });

  describe('ordinary frames', () => {
    it('spends a 60Hz frame on exactly two ticks', () => {
      const advanced = advance(INITIAL_ACCUMULATOR, 1000 / 60);

      expect(advanced.steps).toBe(2);
      expect(advanced.state.simulatedMs).toBeCloseTo(FIXED_STEP_MS * 2, 10);
      expect(advanced.state.carriedMs).toBeCloseTo(0, 10);
      expect(advanced.alpha).toBeCloseTo(0, 10);
    });

    it('spends a 120Hz frame on exactly one', () => {
      const advanced = advance(INITIAL_ACCUMULATOR, FIXED_STEP_MS);

      expect(advanced.steps).toBe(1);
      expect(advanced.state.simulatedMs).toBeCloseTo(FIXED_STEP_MS, 10);
    });

    it('takes no step on a frame shorter than a tick, and keeps the time', () => {
      // A 240Hz display. Half the frames do no simulation work at all; the piece
      // must still move, which it does through `alpha` on those frames and a
      // step on the next.
      const advanced = advance(INITIAL_ACCUMULATOR, FIXED_STEP_MS / 2);

      expect(advanced.steps).toBe(0);
      expect(advanced.state.simulatedMs).toBe(0);
      expect(advanced.state.carriedMs).toBeCloseTo(FIXED_STEP_MS / 2, 10);
      expect(advanced.alpha).toBeCloseTo(0.5, 10);
    });

    it('carries a remainder into the next frame rather than dropping it', () => {
      // The failure this prevents: discard the remainder and a 100Hz display
      // loses 1.7ms every frame — six seconds an hour, which reads as the piece
      // slowly falling behind for no visible reason.
      const first = advance(INITIAL_ACCUMULATOR, 10);
      expect(first.steps).toBe(1);
      expect(first.state.carriedMs).toBeCloseTo(10 - FIXED_STEP_MS, 10);

      const second = advance(first.state, 10);
      expect(second.steps).toBe(1);
      expect(second.state.simulatedMs + second.state.carriedMs).toBeCloseTo(20, 10);
    });

    it('runs several ticks on one long-but-believable frame', () => {
      const advanced = advance(INITIAL_ACCUMULATOR, 100);

      expect(advanced.steps).toBe(12);
      expect(advanced.state.simulatedMs).toBeCloseTo(FIXED_STEP_MS * 12, 10);
    });
  });

  describe('the clamp', () => {
    it('believes a frame exactly at the ceiling', () => {
      const advanced = advance(INITIAL_ACCUMULATOR, MAX_FRAME_MS);
      expect(advanced.state.simulatedMs + advanced.state.carriedMs).toBeCloseTo(MAX_FRAME_MS, 10);
    });

    it('charges a backgrounded tab only the ceiling', () => {
      // Sixty seconds away. Simulated time must advance by a quarter of a second,
      // not a minute: the room resumes where it was rather than jump-cutting.
      const advanced = advance(INITIAL_ACCUMULATOR, 60_000);

      expect(advanced.state.simulatedMs + advanced.state.carriedMs).toBeCloseTo(MAX_FRAME_MS, 10);
      expect(advanced.state.simulatedMs).toBeLessThanOrEqual(MAX_FRAME_MS);
    });

    it('cannot spiral: a run of stalls costs the same as one', () => {
      // The failure mode the clamp exists for. Unclamped, each stalled frame
      // queues more steps than the last and the loop never catches up.
      const stalled = run(INITIAL_ACCUMULATOR, [30_000, 30_000, 30_000]);
      expect(stalled.simulatedMs + stalled.carriedMs).toBeCloseTo(MAX_FRAME_MS * 3, 10);
    });
  });

  describe('a clock that misbehaves', () => {
    /**
     * All of these reach `advance` in normal operation. `requestAnimationFrame`
     * hands out the same timestamp to two callbacks in the same frame, which
     * makes a zero delta; a restarted loop has no previous timestamp; and a
     * timestamp that goes backwards is rare but has been observed across a tab
     * moving between displays. None of them is an error worth throwing over —
     * the piece has to keep rendering — so each is worth exactly nothing.
     */
    it.each([
      ['zero', 0],
      ['negative', -16.7],
      ['NaN', Number.NaN],
      ['infinite', Number.POSITIVE_INFINITY],
      ['negatively infinite', Number.NEGATIVE_INFINITY],
    ])('advances nothing on a %s frame', (_name, frameMs) => {
      const advanced = advance(INITIAL_ACCUMULATOR, frameMs);

      expect(advanced.steps).toBe(0);
      expect(advanced.state.simulatedMs).toBe(0);
      expect(advanced.state.carriedMs).toBe(0);
      expect(advanced.alpha).toBe(0);
    });

    it('leaves an in-progress accumulator untouched on a bad frame', () => {
      // The carried remainder is the part that is easy to lose here: a guard
      // that returns `INITIAL_ACCUMULATOR` instead of the state it was given
      // would pass the case above and silently reset the room's clock.
      const partway = advance(INITIAL_ACCUMULATOR, 30).state;
      const advanced = advance(partway, Number.NaN);

      expect(advanced.state).toEqual(partway);
      expect(advanced.alpha).toBeCloseTo(partway.carriedMs / FIXED_STEP_MS, 10);
    });

    it('never turns simulated time backwards', () => {
      let state = INITIAL_ACCUMULATOR;
      for (const frameMs of [16.7, -5, 0, Number.NaN, 8, -1000, 16.7]) {
        const next = advance(state, frameMs);
        expect(next.state.simulatedMs).toBeGreaterThanOrEqual(state.simulatedMs);
        state = next.state;
      }
    });
  });

  describe('the invariants, over a long run', () => {
    /**
     * Frame times from a real-ish session: vsync with jitter, a hitch, a stall,
     * then a faster display. Deterministic on purpose — a randomised sequence
     * here would turn a conservation bug into a test that fails once a fortnight.
     */
    const session = [
      ...Array.from({ length: 200 }, (_unused, index) => 16.6 + Math.sin(index) * 0.4),
      48,
      16.7,
      MAX_FRAME_MS * 4,
      ...Array.from({ length: 200 }, () => 8.3),
    ];

    it('conserves every millisecond it believed', () => {
      const believed = session.reduce(
        (total, frameMs) => total + Math.min(frameMs, MAX_FRAME_MS),
        0
      );
      const state = run(INITIAL_ACCUMULATOR, session);

      expect(state.simulatedMs + state.carriedMs).toBeCloseTo(believed, 6);
    });

    it('keeps the carry inside one tick and alpha inside the unit interval', () => {
      let state = INITIAL_ACCUMULATOR;

      for (const frameMs of session) {
        const next = advance(state, frameMs);

        expect(next.state.carriedMs).toBeGreaterThanOrEqual(0);
        expect(next.state.carriedMs).toBeLessThan(FIXED_STEP_MS);
        expect(next.alpha).toBeGreaterThanOrEqual(0);
        expect(next.alpha).toBeLessThan(1);
        expect(next.steps).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(next.steps)).toBe(true);

        state = next.state;
      }
    });

    it('keeps simulated time a whole number of ticks', () => {
      // Not decoration: a half-tick in `simulatedMs` means some frame added raw
      // real time instead of stepping, and the display-independence property is
      // gone without anything visibly breaking.
      const state = run(INITIAL_ACCUMULATOR, session);
      expect(state.simulatedMs / FIXED_STEP_MS).toBeCloseTo(
        Math.round(state.simulatedMs / FIXED_STEP_MS),
        6
      );
    });

    it('tracks the wall clock over a simulated minute of 60Hz frames', () => {
      const frames = Array.from({ length: 3600 }, () => 1000 / 60);
      const state = run(INITIAL_ACCUMULATOR, frames);

      // Within one tick of a minute. A loop that drops its remainders lands
      // about half a second short here, which is the whole point of carrying
      // them; the slack is one tick because simulated time is quantised to one.
      expect(Math.abs(state.simulatedMs - 60_000)).toBeLessThan(FIXED_STEP_MS);
    });
  });

  describe('immutability', () => {
    it('does not mutate the state it was handed', () => {
      const state: IAccumulatorState = { simulatedMs: 100, carriedMs: 3 };
      const snapshot = { ...state };

      advance(state, 16.7);

      expect(state).toEqual(snapshot);
    });
  });
});

/** A scheduler the test drives by hand, one frame at a time. */
class ManualScheduler implements IFrameScheduler {
  private callbacks = new Map<number, (timestampMs: number) => void>();
  private nextHandle = 1;

  public request(callback: (timestampMs: number) => void): number {
    const handle = this.nextHandle;
    this.nextHandle += 1;
    this.callbacks.set(handle, callback);
    return handle;
  }

  public cancel(handle: number): void {
    this.callbacks.delete(handle);
  }

  /** Fire whatever is pending, exactly once, at `timestampMs`. */
  public flush(timestampMs: number): void {
    const pending = [...this.callbacks.entries()];
    this.callbacks.clear();
    for (const [, callback] of pending) {
      callback(timestampMs);
    }
  }

  public get pending(): number {
    return this.callbacks.size;
  }
}

describe('the browser scheduler', () => {
  /**
   * The default scheduler is four lines of forwarding, and the only thing worth
   * asserting about it is that it forwards to the *animation* frame rather than
   * to a timer. A `setTimeout` here would tear on every display: the frame would
   * be composited at some arbitrary point in the refresh cycle instead of at
   * vsync, which on a full-screen render is the difference between smooth and
   * visibly juddering.
   */
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests an animation frame, not a timer', () => {
    const request = vi.fn().mockReturnValue(42);
    vi.stubGlobal('requestAnimationFrame', request);

    const callback = (): void => undefined;
    expect(browserScheduler.request(callback)).toBe(42);
    expect(request).toHaveBeenCalledWith(callback);
  });

  it('cancels the handle it was given', () => {
    const cancel = vi.fn();
    vi.stubGlobal('cancelAnimationFrame', cancel);

    browserScheduler.cancel(42);
    expect(cancel).toHaveBeenCalledWith(42);
  });
});

describe('the frame loop', () => {
  let scheduler: ManualScheduler;
  let frames: IFrame[];
  let loop: FrameLoop;

  beforeEach(() => {
    scheduler = new ManualScheduler();
    frames = [];
    loop = new FrameLoop((frame) => frames.push(frame), scheduler);
  });

  it('requests nothing until started', () => {
    expect(scheduler.pending).toBe(0);
    expect(loop.running).toBe(false);
  });

  it('charges the first frame nothing, having no previous timestamp to subtract', () => {
    loop.start();
    scheduler.flush(1_000_000);

    expect(frames).toHaveLength(1);
    expect(frames[0].simulatedSeconds).toBe(0);
    expect(frames[0].frameMs).toBe(0);
  });

  it('advances the room clock from the gaps between timestamps', () => {
    loop.start();
    scheduler.flush(0);
    scheduler.flush(1000 / 60);
    scheduler.flush(2000 / 60);

    expect(frames).toHaveLength(3);
    expect(frames[2].simulatedSeconds).toBeCloseTo((FIXED_STEP_MS * 4) / 1000, 6);
  });

  it('keeps asking for the next frame while it runs', () => {
    loop.start();
    for (let index = 1; index <= 5; index += 1) {
      expect(scheduler.pending).toBe(1);
      scheduler.flush(index * 16.7);
    }
    expect(frames).toHaveLength(5);
  });

  it('ignores a second start rather than running at double speed', () => {
    // The realistic way this happens: a resize handler that restarts the loop.
    // Two chains means two callbacks per vsync, and the room moves twice as fast
    // for reasons nobody can see in the code.
    loop.start();
    loop.start();

    expect(scheduler.pending).toBe(1);
    scheduler.flush(16.7);
    expect(frames).toHaveLength(1);
  });

  it('stops, and stays stopped', () => {
    loop.start();
    scheduler.flush(0);
    loop.stop();

    expect(loop.running).toBe(false);
    expect(scheduler.pending).toBe(0);

    scheduler.flush(1000);
    expect(frames).toHaveLength(1);
  });

  it('tolerates a stop it was not running for', () => {
    expect(() => {
      loop.stop();
    }).not.toThrow();
  });

  it('resumes where it stopped, without charging the pause', () => {
    loop.start();
    scheduler.flush(0);
    scheduler.flush(100);
    const beforePause = frames[frames.length - 1].simulatedSeconds;

    loop.stop();
    loop.start();
    // Ten seconds of real time passed while stopped. The room did not.
    scheduler.flush(10_100);

    expect(frames[frames.length - 1].simulatedSeconds).toBe(beforePause);
  });

  it('reports the clamped frame time, so the quality ladder cannot see a stall', () => {
    loop.start();
    scheduler.flush(0);
    scheduler.flush(60_000);

    expect(frames[1].frameMs).toBe(MAX_FRAME_MS);
  });

  it('renders a single still frame without starting', () => {
    // The reduced-motion path: the spec asks for the camera to stop entirely,
    // not to slow down, so this draws one composition and leaves it.
    loop.renderOnce();

    expect(frames).toHaveLength(1);
    expect(frames[0].simulatedSeconds).toBe(0);
    expect(frames[0].alpha).toBe(0);
    expect(loop.running).toBe(false);
    expect(scheduler.pending).toBe(0);
  });
});
