/**
 * The detail ladder, and the governor that walks it.
 *
 * AUBADE's fifth non-negotiable is a frame budget — 16ms at 1440p on integrated
 * graphics — and its fourth says the piece degrades deliberately rather than
 * merely getting slower: drop march steps and volumetric samples first, drop
 * resolution second, and **tell the visitor what happened**. Both of those are
 * this file. A raymarcher has exactly two knobs, samples and pixels, and the
 * order matters: halving the resolution of a soft-lit interior is visible as
 * softness, whereas taking the march from 96 steps to 72 in a room six metres
 * across is visible as nothing at all, because no ray in the scene needs the
 * other 24.
 *
 * The governor is a pure reducer over frame times so it can be tested without a
 * GPU, and it judges once per window rather than once per frame. That is not an
 * optimisation — a per-frame decision would chase individual hitches, and the
 * thing it is supposed to detect is a machine that cannot hold the budget, not a
 * machine that dropped one frame while a font loaded.
 *
 * Nothing in here reads the wall clock or the solar state. The quality tier is
 * the one property of the render that is allowed to differ between two visitors
 * for a reason that is not the sun.
 */

/** One rung. Lower `id` is more detail; `0` is everything. */
export interface IQualityTier {
  /** Position on the ladder. `0` is full detail. */
  readonly id: number;

  /** Multiplier handed to `drawingBufferSize`. */
  readonly renderScale: number;

  /** Primary raymarch iteration cap. */
  readonly marchSteps: number;

  /** Samples along the view ray for the light shaft. */
  readonly volumetricSamples: number;

  /** Iterations of the soft-shadow march towards the moon. */
  readonly shadowSteps: number;

  /**
   * What the desk says about this tier, in the register's voice, or `null` at
   * full detail where there is nothing to admit. Silent degradation is how a
   * portfolio piece gets remembered as the one that ran badly on someone's
   * laptop; saying so turns the same frame rate into a deliberate act.
   */
  readonly note: string | null;
}

/**
 * The ladder, most detail first.
 *
 * Rungs 1 and 2 spend samples and keep every pixel; rungs 3 and 4 start giving
 * up pixels, because by then the samples that are left are the ones doing the
 * visible work. The last rung is a floor, not a fallback — a machine that cannot
 * hold it is a machine for the Reader's Edition.
 */
export const QUALITY_TIERS: readonly IQualityTier[] = [
  {
    id: 0,
    renderScale: 1,
    marchSteps: 96,
    volumetricSamples: 20,
    shadowSteps: 28,
    note: null,
  },
  {
    id: 1,
    renderScale: 1,
    marchSteps: 72,
    volumetricSamples: 14,
    shadowSteps: 20,
    note: 'The house has thinned the dust in the shaft to keep the frame rate.',
  },
  {
    id: 2,
    renderScale: 1,
    marchSteps: 56,
    volumetricSamples: 9,
    shadowSteps: 14,
    note: 'The shadows are softer than they should be. Your machine asked.',
  },
  {
    id: 3,
    renderScale: 0.72,
    marchSteps: 56,
    volumetricSamples: 9,
    shadowSteps: 14,
    note: 'The lobby is being rendered small and enlarged. It is a little out of focus.',
  },
  {
    id: 4,
    renderScale: 0.5,
    marchSteps: 44,
    volumetricSamples: 6,
    shadowSteps: 10,
    note: 'Half the light, half the pixels. This is as far down as the hotel goes.',
  },
];

/** Frames judged together. At 60Hz, one decision a second. */
export const WINDOW_FRAMES = 60;

/**
 * Median frame time above which the tier drops: below roughly 55fps.
 *
 * Set against 60, not against the spec's 30. Waiting for sustained sub-30fps
 * before reacting means a visitor spends a second and a half of their first
 * eight seconds watching something stutter, and the first eight seconds are the
 * whole budget the piece has to be worth staying for.
 */
export const DEMOTE_ABOVE_MS = 18;

/**
 * Median frame time below which the tier climbs back: above roughly 90fps.
 *
 * The gap to `DEMOTE_ABOVE_MS` is the hysteresis, and it is wide on purpose. A
 * narrow one produces a piece that visibly changes quality every second or two
 * on a machine sitting near the boundary, which is worse than either tier.
 */
export const PROMOTE_BELOW_MS = 11;

/**
 * Windows to wait after a change before judging again.
 *
 * A tier change resizes the drawing buffer and recompiles nothing but does
 * reallocate; the frames immediately after it are not representative of the
 * tier they are attributed to.
 */
export const SETTLE_WINDOWS = 1;

/** The governor's state. Immutable; `observeFrame` returns the next one. */
export interface IGovernorState {
  /** Index into `QUALITY_TIERS`. */
  readonly tier: number;

  /** Frame times gathered towards the current window. */
  readonly window: readonly number[];

  /** Windows still to be discarded before the next judgement. */
  readonly settling: number;
}

/** Full detail, nothing measured yet. */
export const INITIAL_GOVERNOR: IGovernorState = {
  tier: 0,
  window: [],
  settling: 0,
};

/** The middle value of a non-empty list. Even lengths take the lower middle. */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[(sorted.length - 1) >> 1];
}

/**
 * Fold one frame's measured duration into the governor.
 *
 * @param state The governor after the previous frame.
 * @param frameMs Real milliseconds the previous frame took. Non-finite and
 *   negative values are ignored rather than treated as fast frames — a bad
 *   measurement must never be able to promote the tier.
 * @returns The next state. `tier` changes at most once per full window.
 */
export function observeFrame(state: IGovernorState, frameMs: number): IGovernorState {
  if (!Number.isFinite(frameMs) || frameMs <= 0) {
    return state;
  }

  const window = [...state.window, frameMs];
  if (window.length < WINDOW_FRAMES) {
    return { ...state, window };
  }

  // A full window, spent. Whether it is judged or discarded, it is cleared —
  // carrying frames across a decision would let one slow second influence two.
  if (state.settling > 0) {
    return { tier: state.tier, window: [], settling: state.settling - 1 };
  }

  const centre = median(window);
  const last = QUALITY_TIERS.length - 1;

  if (centre > DEMOTE_ABOVE_MS && state.tier < last) {
    return { tier: state.tier + 1, window: [], settling: SETTLE_WINDOWS };
  }
  if (centre < PROMOTE_BELOW_MS && state.tier > 0) {
    return { tier: state.tier - 1, window: [], settling: SETTLE_WINDOWS };
  }

  return { tier: state.tier, window: [], settling: 0 };
}

/** The tier a governor state names. Clamped, so a bad index cannot crash a frame. */
export function tierFor(state: IGovernorState): IQualityTier {
  const index = Math.min(Math.max(Math.trunc(state.tier), 0), QUALITY_TIERS.length - 1);
  return QUALITY_TIERS[index];
}
