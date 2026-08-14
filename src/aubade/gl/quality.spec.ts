import {
  DEMOTE_ABOVE_MS,
  INITIAL_GOVERNOR,
  observeFrame,
  PROMOTE_BELOW_MS,
  QUALITY_TIERS,
  SETTLE_WINDOWS,
  tierFor,
  WINDOW_FRAMES,
  type IGovernorState,
} from './quality';

/**
 * The detail ladder and its governor.
 *
 * AUBADE's fourth non-negotiable is that degradation is deliberate and stated:
 * samples before pixels, and the visitor gets told. The first half of that is a
 * property of the ladder's shape and is asserted directly below rather than left
 * to a reviewer noticing that someone reordered the rungs.
 *
 * The second half — hysteresis — is the part that is easy to get subtly wrong
 * and impossible to notice in review. A governor with too narrow a gap between
 * its thresholds does not fail; it produces a piece that visibly changes quality
 * every second or two on a machine sitting near the boundary, which is worse
 * than either tier and reads as a bug in the shader.
 */

/** Feed the governor `count` frames of `frameMs`. */
function run(state: IGovernorState, frameMs: number, count: number): IGovernorState {
  let current = state;
  for (let index = 0; index < count; index += 1) {
    current = observeFrame(current, frameMs);
  }
  return current;
}

/** Frames enough to force one judgement, allowing for the settling windows. */
const JUDGEMENT = WINDOW_FRAMES * (SETTLE_WINDOWS + 1);

describe('the quality ladder', () => {
  it('starts at full detail with nothing measured', () => {
    expect(INITIAL_GOVERNOR).toEqual({ tier: 0, window: [], settling: 0 });
    expect(tierFor(INITIAL_GOVERNOR).id).toBe(0);
  });

  it('is numbered by position, most detail first', () => {
    QUALITY_TIERS.forEach((tier, index) => {
      expect(tier.id).toBe(index);
    });
  });

  it('never increases detail as it descends', () => {
    for (let index = 1; index < QUALITY_TIERS.length; index += 1) {
      const above = QUALITY_TIERS[index - 1];
      const below = QUALITY_TIERS[index];

      expect(below.marchSteps).toBeLessThanOrEqual(above.marchSteps);
      expect(below.volumetricSamples).toBeLessThanOrEqual(above.volumetricSamples);
      expect(below.shadowSteps).toBeLessThanOrEqual(above.shadowSteps);
      expect(below.renderScale).toBeLessThanOrEqual(above.renderScale);
    }
  });

  it('spends samples before it spends pixels', () => {
    // The order the spec asks for, asserted rather than trusted: no rung may
    // drop resolution while a rung above it still had march steps to give up.
    const firstScaleDrop = QUALITY_TIERS.findIndex((tier) => tier.renderScale < 1);
    const firstSampleDrop = QUALITY_TIERS.findIndex(
      (tier) => tier.marchSteps < QUALITY_TIERS[0].marchSteps
    );

    expect(firstSampleDrop).toBeGreaterThan(0);
    expect(firstScaleDrop).toBeGreaterThan(firstSampleDrop);
  });

  it('says nothing at full detail and something at every other rung', () => {
    // Silent degradation is the failure this note exists to prevent.
    expect(QUALITY_TIERS[0].note).toBeNull();
    for (const tier of QUALITY_TIERS.slice(1)) {
      expect(tier.note).not.toBeNull();
      expect((tier.note ?? '').length).toBeGreaterThan(20);
    }
  });

  it('keeps every rung renderable', () => {
    for (const tier of QUALITY_TIERS) {
      expect(tier.marchSteps).toBeGreaterThan(0);
      expect(tier.volumetricSamples).toBeGreaterThan(0);
      expect(tier.shadowSteps).toBeGreaterThan(0);
      expect(tier.renderScale).toBeGreaterThan(0);
      expect(tier.renderScale).toBeLessThanOrEqual(1);
    }
  });
});

describe('the hysteresis gap', () => {
  it('leaves real room between dropping and climbing', () => {
    // Without this the governor oscillates on any machine near the boundary.
    expect(PROMOTE_BELOW_MS).toBeLessThan(DEMOTE_ABOVE_MS);
    expect(DEMOTE_ABOVE_MS - PROMOTE_BELOW_MS).toBeGreaterThanOrEqual(5);
  });

  it('demotes short of 60fps rather than waiting for 30', () => {
    // The spec says sub-30; this reacts at roughly 55. Waiting for 30 spends a
    // second and a half of a visitor's first eight watching it stutter.
    expect(1000 / DEMOTE_ABOVE_MS).toBeGreaterThan(50);
    expect(1000 / DEMOTE_ABOVE_MS).toBeLessThan(60);
  });
});

describe('the governor', () => {
  describe('judging', () => {
    it('changes nothing before a full window has been seen', () => {
      const state = run(INITIAL_GOVERNOR, 40, WINDOW_FRAMES - 1);
      expect(state.tier).toBe(0);
      expect(state.window).toHaveLength(WINDOW_FRAMES - 1);
    });

    it('drops a tier after a full window over budget', () => {
      const state = run(INITIAL_GOVERNOR, DEMOTE_ABOVE_MS + 5, WINDOW_FRAMES);
      expect(state.tier).toBe(1);
      expect(state.window).toEqual([]);
    });

    it('holds the tier on a window that is neither fast nor slow', () => {
      const between = (DEMOTE_ABOVE_MS + PROMOTE_BELOW_MS) / 2;
      const state = run(INITIAL_GOVERNOR, between, WINDOW_FRAMES * 4);
      expect(state.tier).toBe(0);
    });

    it('will not climb above full detail however fast the machine is', () => {
      const state = run(INITIAL_GOVERNOR, 2, WINDOW_FRAMES * 6);
      expect(state.tier).toBe(0);
    });

    it('will not fall below the last rung however slow it is', () => {
      const state = run(INITIAL_GOVERNOR, 400, JUDGEMENT * (QUALITY_TIERS.length + 3));
      expect(state.tier).toBe(QUALITY_TIERS.length - 1);
    });

    it('walks the whole ladder down under sustained load', () => {
      let state = INITIAL_GOVERNOR;
      for (let rung = 1; rung < QUALITY_TIERS.length; rung += 1) {
        state = run(state, DEMOTE_ABOVE_MS + 10, JUDGEMENT);
        expect(state.tier).toBe(rung);
      }
    });

    it('climbs back when the machine recovers', () => {
      const dropped = run(INITIAL_GOVERNOR, DEMOTE_ABOVE_MS + 10, JUDGEMENT * 2);
      expect(dropped.tier).toBe(2);

      const recovered = run(dropped, PROMOTE_BELOW_MS - 4, JUDGEMENT * 2);
      expect(recovered.tier).toBe(0);
    });
  });

  describe('settling', () => {
    it('discards the window straight after a change', () => {
      // A tier change reallocates the drawing buffer; the frames immediately
      // after it are not representative of the tier they get attributed to.
      const dropped = run(INITIAL_GOVERNOR, DEMOTE_ABOVE_MS + 5, WINDOW_FRAMES);
      expect(dropped.settling).toBe(SETTLE_WINDOWS);

      const settling = run(dropped, PROMOTE_BELOW_MS - 5, WINDOW_FRAMES);
      expect(settling.tier).toBe(1);
      expect(settling.settling).toBe(0);
    });
  });

  describe('the median, not the mean', () => {
    it('ignores a single catastrophic frame in an otherwise fine window', () => {
      // One 400ms hitch while a font loads would drag a mean well over budget
      // and demote a machine that is comfortably making it.
      let state = observeFrame(INITIAL_GOVERNOR, 400);
      state = run(state, 8, WINDOW_FRAMES - 1);

      expect(state.tier).toBe(0);
    });

    it('reacts when most of the window is slow, not just some of it', () => {
      let state = run(INITIAL_GOVERNOR, 2, 20);
      state = run(state, DEMOTE_ABOVE_MS + 6, WINDOW_FRAMES - 20);

      expect(state.tier).toBe(1);
    });
  });

  describe('bad measurements', () => {
    it.each([
      ['zero', 0],
      ['negative', -8],
      ['NaN', Number.NaN],
      ['infinite', Number.POSITIVE_INFINITY],
    ])('ignores a %s frame time entirely', (_name, frameMs) => {
      const state = observeFrame(INITIAL_GOVERNOR, frameMs);
      expect(state).toBe(INITIAL_GOVERNOR);
    });

    it('cannot be promoted by a flood of zero-length frames', () => {
      // The dangerous direction: a broken clock reporting 0ms would otherwise
      // read as an infinitely fast machine and climb the ladder into a stutter.
      const dropped = run(INITIAL_GOVERNOR, DEMOTE_ABOVE_MS + 10, JUDGEMENT);
      const flooded = run(dropped, 0, WINDOW_FRAMES * 10);

      expect(flooded.tier).toBe(dropped.tier);
    });
  });

  describe('immutability', () => {
    it('does not mutate the state it was given', () => {
      const state: IGovernorState = { tier: 1, window: [16, 16], settling: 0 };
      const snapshot = { tier: state.tier, window: [...state.window], settling: state.settling };

      observeFrame(state, 16);

      expect(state.window).toEqual(snapshot.window);
      expect(state.tier).toBe(snapshot.tier);
    });
  });
});

describe('reading the tier', () => {
  it('returns the rung the state names', () => {
    expect(tierFor({ tier: 2, window: [], settling: 0 })).toBe(QUALITY_TIERS[2]);
  });

  it.each([
    ['below the ladder', -3, 0],
    ['above the ladder', 99, QUALITY_TIERS.length - 1],
    ['fractional', 1.7, 1],
  ])('clamps a tier index %s', (_name, tier, expected) => {
    // A bad index must never be able to throw inside a render call: the frame
    // has to go out, and a wrong quality setting is a far cheaper failure than
    // a black screen.
    expect(tierFor({ tier, window: [], settling: 0 }).id).toBe(expected);
  });
});
