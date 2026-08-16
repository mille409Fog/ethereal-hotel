import {
  BREATH_CYCLE_SECONDS,
  BREATH_HOLD_SECONDS,
  BREATH_IN_SECONDS,
  BREATH_OUT_SECONDS,
  breathAt,
  SETTLE_SECONDS,
  settleStep,
  UNSETTLE_SECONDS,
} from './cellar';

/**
 * Floor −3's arithmetic.
 *
 * Two pure functions and nothing else, which is unusually easy to test and
 * unusually worth testing: neither of them can be checked by looking at the
 * render. A breath curve with the wrong hold length produces a camera that moves
 * plausibly and paces the visitor at something other than 4-7-8, and a stillness
 * that drains at the wrong rate produces a room that resolves — just not on the
 * terms the floor claims. Both look completely fine.
 */

describe('the breath', () => {
  it('is a 4-7-8 cycle and nineteen seconds long', () => {
    expect(BREATH_IN_SECONDS).toBe(4);
    expect(BREATH_HOLD_SECONDS).toBe(7);
    expect(BREATH_OUT_SECONDS).toBe(8);
    expect(BREATH_CYCLE_SECONDS).toBe(19);
  });

  it('starts on an empty chest, exactly', () => {
    // Not nearly zero. `camera/drift.ts` blends this against its own sines to
    // place the camera, and the reduced-motion still is that function at second
    // zero — so a curve starting anywhere but empty puts the held composition a
    // few millimetres off its own anchor on one floor and no other, which is
    // invisible, permanent, and would be blamed on the anchor.
    expect(breathAt(0)).toBe(0);
  });

  it('holds at the top for exactly seven seconds, flat', () => {
    // The corners are the technique. A sine through the top of the hold would be
    // easier, smoother, and a different exercise — what makes 4-7-8 do anything is
    // that the hold is long enough to be uncomfortable.
    const held = [4, 5, 7, 9, 10.99].map(breathAt);
    for (const value of held) {
      expect(value).toBe(1);
    }

    // And it is over by the time the exhale starts.
    expect(breathAt(11.5)).toBeLessThan(1);
  });

  it('rises over the inhale and falls over the exhale, without overshooting', () => {
    const sample = (from: number, to: number, steps = 40): number[] =>
      Array.from({ length: steps + 1 }, (_unused, index) =>
        breathAt(from + ((to - from) * index) / steps)
      );

    const inhale = sample(0, BREATH_IN_SECONDS);
    for (let index = 1; index < inhale.length; index += 1) {
      expect(inhale[index]).toBeGreaterThanOrEqual(inhale[index - 1]);
    }

    const exhale = sample(BREATH_IN_SECONDS + BREATH_HOLD_SECONDS, BREATH_CYCLE_SECONDS);
    for (let index = 1; index < exhale.length; index += 1) {
      expect(exhale[index]).toBeLessThanOrEqual(exhale[index - 1]);
    }

    for (const value of [...inhale, ...exhale]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('repeats, and repeats identically', () => {
    // The one deliberate loop in the piece — see the note in `camera/drift.ts`,
    // where every other period is chosen so nothing ever repeats. A pace a visitor
    // cannot find is not a pace they can keep.
    for (const second of [0, 2.5, 6, 13.75, 18.9]) {
      expect(breathAt(second + BREATH_CYCLE_SECONDS)).toBeCloseTo(breathAt(second), 12);
      expect(breathAt(second + BREATH_CYCLE_SECONDS * 7)).toBeCloseTo(breathAt(second), 10);
    }
  });

  it('handles a negative or corrupted clock rather than producing a NaN uniform', () => {
    // This reaches the shader as `uBreath` and the camera as an offset. A NaN in
    // either is a black screen with nothing in the console.
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(breathAt(bad)).toBe(0);
    }

    // Negative seconds are reachable: the renderer evaluates the camera at
    // `simulatedSeconds + alpha × step`, and nothing forbids a caller asking about
    // a moment before the loop started.
    for (const second of [-1, -12.5, -40]) {
      const value = breathAt(second);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    expect(breathAt(-BREATH_CYCLE_SECONDS)).toBeCloseTo(0, 12);
  });
});

describe('the stillness', () => {
  it('takes ninety seconds of quiet to fill and twelve of movement to empty', () => {
    expect(SETTLE_SECONDS).toBe(90);
    expect(UNSETTLE_SECONDS).toBe(12);
  });

  it('fills over exactly the settling time', () => {
    // Integrated in whatever steps the loop happens to hand over, so the useful
    // property is that the total is right rather than that any one step is.
    let settled = 0;
    const step = 1 / 60;
    for (let elapsed = 0; elapsed < SETTLE_SECONDS; elapsed += step) {
      settled = settleStep(settled, step, false);
    }

    expect(settled).toBeCloseTo(1, 6);
  });

  it('drains about seven and a half times faster than it fills', () => {
    // The ratio is the floor's demand written as a number. One flick of a pointer
    // costs a couple of seconds of ground; a fidget costs the room.
    const gained = settleStep(0, 1, false);
    const lost = 1 - settleStep(1, 1, true);

    expect(lost / gained).toBeCloseTo(SETTLE_SECONDS / UNSETTLE_SECONDS, 6);
  });

  it('drains rather than resets', () => {
    // The one concession in the design. A reset would mean eighty-nine seconds of
    // stillness and one mouse jog puts a visitor back at the beginning, and nobody
    // comes back from that twice.
    const after = settleStep(0.9, 1 / 3, true);

    expect(after).toBeLessThan(0.9);
    expect(after).toBeGreaterThan(0.85);
  });

  it('clamps at both ends', () => {
    expect(settleStep(1, 10, false)).toBe(1);
    expect(settleStep(0, 10, true)).toBe(0);
    expect(settleStep(0.5, 1e6, false)).toBe(1);
    expect(settleStep(0.5, 1e6, true)).toBe(0);
  });

  it('treats a corrupted carry or a stalled frame as no change', () => {
    // The caller holds this across frames, so one bad frame would otherwise be
    // permanent rather than momentary.
    expect(settleStep(Number.NaN, 1, false)).toBe(1 / SETTLE_SECONDS);
    expect(settleStep(-4, 1, true)).toBe(0);
    expect(settleStep(9, 1, false)).toBe(1);

    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(settleStep(0.4, bad, false)).toBe(0.4);
      expect(settleStep(0.4, bad, true)).toBe(0.4);
    }
  });
});
