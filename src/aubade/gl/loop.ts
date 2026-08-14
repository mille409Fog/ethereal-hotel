/**
 * The render loop's clock: a fixed-step accumulator, and the `requestAnimationFrame`
 * driver that turns it.
 *
 * A raymarched still life has no physics, so the obvious question is why the loop
 * is not simply `uTime = performance.now() / 1000`. Three reasons, in order of how
 * much they cost when ignored:
 *
 * 1. **A hitch must not teleport the room.** Tab away for a minute and the next
 *    `requestAnimationFrame` arrives with a 60-second delta. Fed straight to the
 *    camera that is a lurch; clamped to `MAX_FRAME_MS` it is a resumption. The
 *    piece is a slow drift through a room — the one motion it cannot survive is a
 *    jump cut.
 * 2. **The breath rate must not be a function of the display.** Simulated time
 *    advances in whole `FIXED_STEP_MS` ticks, so a 60Hz laptop and a 144Hz monitor
 *    see the same room at the same wall-clock second. A variable step makes the
 *    camera's period depend on how fast the GPU happens to be, which is exactly
 *    the sort of thing nobody notices until two machines are side by side.
 * 3. **Later floors integrate.** The Cellar's breath pacing and the elevator's
 *    morph between two distance fields are stateful in a way the drift is not.
 *    Retrofitting a fixed step under them later means re-timing everything above.
 *
 * The leftover time that did not make a whole tick is carried, not discarded, and
 * returned as `alpha` so the renderer can interpolate across it. Discarding it is
 * how a fixed-step loop acquires a slow, inexplicable judder at frame rates that
 * do not divide evenly into the step.
 */

/**
 * One tick of simulated time, in milliseconds — 120Hz.
 *
 * Twice the common display rate, so a 60Hz frame consumes exactly two ticks and
 * a 120Hz frame exactly one. Higher would burn steps on a room that does not
 * need them; lower would put the tick boundary inside the range of ordinary
 * frame times, where `alpha` does the most visible work.
 */
export const FIXED_STEP_MS = 1000 / 120;

/**
 * The longest single frame the accumulator will believe, in milliseconds.
 *
 * Everything above this is a stall, not a frame: a backgrounded tab, a garbage
 * collection, a laptop lid. Without the clamp the pool grows faster than the
 * loop can drain it, each frame runs more steps than the last, and the loop
 * spirals until the tab is killed. 250ms is four frames' worth of grace at
 * 16.7ms, which absorbs a bad hiccup without letting a genuine stall through.
 */
export const MAX_FRAME_MS = 250;

/** Where the accumulator has got to. Immutable; `advance` returns the next one. */
export interface IAccumulatorState {
  /**
   * Total simulated time, milliseconds, always a whole multiple of
   * `FIXED_STEP_MS`. This is the value every uniform in the piece is derived
   * from — it is the room's clock, not the browser's.
   */
  readonly simulatedMs: number;

  /**
   * Real time received but not yet spent on a whole tick, milliseconds. Always
   * in `[0, FIXED_STEP_MS)`.
   */
  readonly carriedMs: number;
}

/** A loop that has not started. */
export const INITIAL_ACCUMULATOR: IAccumulatorState = {
  simulatedMs: 0,
  carriedMs: 0,
};

/** What one frame's worth of real time did to the accumulator. */
export interface IAccumulatorAdvance {
  /** The accumulator after this frame. */
  readonly state: IAccumulatorState;

  /**
   * How many whole ticks this frame consumed. Zero on a frame shorter than a
   * tick, which is normal above 120Hz and not an error.
   */
  readonly steps: number;

  /**
   * How far into the next tick the carried remainder sits, in `[0, 1)`. The
   * renderer interpolates across this so a display that does not divide evenly
   * into the step still moves smoothly.
   */
  readonly alpha: number;
}

/**
 * Advance the accumulator by one frame of real time.
 *
 * @param state Where the accumulator was at the end of the previous frame.
 * @param frameMs Real milliseconds since the previous frame, as measured by the
 *   caller. Hostile input is expected here rather than guarded against upstream:
 *   `requestAnimationFrame` timestamps can repeat, and the first frame of a
 *   restarted loop has no predecessor.
 * @returns The next state, the number of whole ticks consumed, and the
 *   interpolation alpha.
 */
export function advance(state: IAccumulatorState, frameMs: number): IAccumulatorAdvance {
  // First we check for the edge cases of frameMs and handle the clamping case.
  // `Number.isFinite` rather than a comparison against Infinity: NaN is neither
  // equal to Infinity nor less than zero, so it walks past both tests and comes
  // out the far end as a NaN alpha — which does not throw, does not warn, and
  // renders a black screen.
  if (!Number.isFinite(frameMs) || frameMs <= 0) {
    return { state, steps: 0, alpha: state.carriedMs / FIXED_STEP_MS };
  }

  // What there is to spend: this frame, clamped, plus whatever the last frame
  // received and could not turn into a whole tick.
  const pool = state.carriedMs + Math.min(frameMs, MAX_FRAME_MS);

  // Steps is how many whole ticks the pool covers.
  // The remainder is carried rather than dropped, and alpha is where inside the
  // next tick it leaves us.
  const steps = Math.floor(pool / FIXED_STEP_MS);
  const carriedMs = pool - steps * FIXED_STEP_MS;

  return {
    state: {
      simulatedMs: state.simulatedMs + steps * FIXED_STEP_MS,
      carriedMs,
    },
    steps,
    alpha: carriedMs / FIXED_STEP_MS,
  };
}

/** One frame, as the renderer sees it. */
export interface IFrame {
  /** The room's clock, in seconds. Every time-varying uniform reads this. */
  readonly simulatedSeconds: number;

  /** `IAccumulatorAdvance.alpha`, forwarded. */
  readonly alpha: number;

  /**
   * Real milliseconds this frame took, after clamping. The quality ladder reads
   * it; nothing that affects what is on screen may, or the piece would look
   * different on a slow machine for reasons other than the ones it admits to.
   */
  readonly frameMs: number;
}

/** What the loop is drawn by. Injected so tests need no animation frames. */
export interface IFrameScheduler {
  request(callback: (timestampMs: number) => void): number;
  cancel(handle: number): void;
}

/**
 * The browser's own. Read lazily through a function rather than captured at
 * module load, because the module is imported by the route's chunk and a
 * captured `window.requestAnimationFrame` would be a reference held from a
 * lazily-loaded chunk to a global that may not exist under test.
 */
export const browserScheduler: IFrameScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => {
    cancelAnimationFrame(handle);
  },
};

/**
 * Drives `advance` from animation frames and hands each frame to one callback.
 *
 * Deliberately not an RxJS `interval` or a `signal` `effect`: this is the one
 * place in the repository where the caller wants the browser's vsync and
 * nothing between it and the draw call. Sixty times a second, an emission
 * through a scheduler costs more than the work it schedules.
 */
export class FrameLoop {
  private readonly onFrame: (frame: IFrame) => void;
  private readonly scheduler: IFrameScheduler;

  private accumulator: IAccumulatorState = INITIAL_ACCUMULATOR;
  private handle: number | null = null;
  private previousTimestampMs: number | null = null;

  constructor(onFrame: (frame: IFrame) => void, scheduler: IFrameScheduler = browserScheduler) {
    this.onFrame = onFrame;
    this.scheduler = scheduler;
  }

  /** Whether frames are being requested. */
  public get running(): boolean {
    return this.handle !== null;
  }

  /**
   * Begin. Idempotent — a second call while running is ignored rather than
   * starting a second chain of frames, which is the classic way a loop ends up
   * running at double speed after a resize handler restarts it.
   */
  public start(): void {
    if (this.handle !== null) {
      return;
    }
    // Cleared rather than kept, so the gap across a stop/start pause is not
    // charged to the first frame after it. The clamp would absorb it anyway;
    // this makes the resumption exact instead of merely survivable.
    this.previousTimestampMs = null;
    this.handle = this.scheduler.request(this.tick);
  }

  /** Stop. Idempotent. Simulated time is kept, so a restart resumes. */
  public stop(): void {
    if (this.handle === null) {
      return;
    }
    this.scheduler.cancel(this.handle);
    this.handle = null;
  }

  /**
   * Render one frame without starting the loop.
   *
   * This is what `prefers-reduced-motion` renders: the spec asks for the camera
   * to stop entirely rather than slow down, so the reduced-motion path draws a
   * single still composition and leaves it. It is also how a resize repaints a
   * stopped loop.
   */
  public renderOnce(): void {
    this.onFrame({
      simulatedSeconds: this.accumulator.simulatedMs / 1000,
      alpha: 0,
      frameMs: 0,
    });
  }

  /** An arrow so it can be handed to the scheduler without binding. */
  private readonly tick = (timestampMs: number): void => {
    if (this.handle === null) {
      return;
    }
    this.handle = this.scheduler.request(this.tick);

    const frameMs = this.previousTimestampMs === null ? 0 : timestampMs - this.previousTimestampMs;
    this.previousTimestampMs = timestampMs;

    const advanced = advance(this.accumulator, frameMs);
    this.accumulator = advanced.state;

    this.onFrame({
      simulatedSeconds: advanced.state.simulatedMs / 1000,
      alpha: advanced.alpha,
      frameMs: Math.min(Math.max(frameMs, 0), MAX_FRAME_MS),
    });
  };
}
