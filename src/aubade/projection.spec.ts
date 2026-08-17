import {
  benchMask,
  CUE_FRAMES,
  CUE_LEAD_SECONDS,
  FILM_STACK,
  filmFrameAt,
  REEL_SECONDS,
  STACK_BITS,
  THREADED,
  toggled,
  type FilmEffect,
} from './projection';

/**
 * Floor −4's arithmetic.
 *
 * One quantisation and three small pieces of bookkeeping, and the quantisation is
 * the floor. It cannot be checked by looking at the render, which is the reason it
 * is worth a spec of its own: a projector running at the wrong rate looks like a
 * projector, a projector using `round` instead of `floor` shows a frame before it
 * has been struck and nobody can see that either, and a projector that is *nearly*
 * stopped at noon renders a room that crawls very slightly — which is the whole of
 * this floor's answer to the sun quietly becoming a gradient.
 */

describe('the frame in the gate', () => {
  it('strikes a new frame every 1/rate seconds', () => {
    // Twenty-four frames a second, so the show's first second is frames 0 to 23 and
    // the twenty-fifth frame starts the second second.
    expect(filmFrameAt(0, 24).index).toBe(0);
    expect(filmFrameAt(1 / 24 - 0.001, 24).index).toBe(0);
    expect(filmFrameAt(1 / 24 + 0.001, 24).index).toBe(1);
    expect(filmFrameAt(1, 24).index).toBe(24);
    expect(filmFrameAt(2.5, 24).index).toBe(60);
  });

  it('reports the second that frame was struck at, never a later one', () => {
    // `floor`, not `round`, and this is the assertion that says so. A projector
    // showing the frame nearest in time shows frames before they have been struck
    // for half of every interval — which is invisible in a still, invisible in
    // motion, and means the room is drawn from a clock half a frame ahead of the
    // one the grain and the cue dots are counting on.
    for (const seconds of [0, 0.017, 0.4, 1, 3.33, 12.75]) {
      const frame = filmFrameAt(seconds, 24);
      expect(frame.time).toBeLessThanOrEqual(seconds);
      expect(seconds - frame.time).toBeLessThan(1 / 24);
      expect(frame.time).toBeCloseTo(frame.index / 24, 10);
    }
  });

  it('never runs backwards as the clock runs forwards', () => {
    let previousIndex = -Infinity;
    let previousTime = -Infinity;

    for (let step = 0; step <= 400; step += 1) {
      const frame = filmFrameAt(step * 0.0073, 18);
      expect(frame.index).toBeGreaterThanOrEqual(previousIndex);
      expect(frame.time).toBeGreaterThanOrEqual(previousTime);
      previousIndex = frame.index;
      previousTime = frame.time;
    }
  });

  it('lands exactly on the frame boundary at second zero', () => {
    // Not nearly zero, for the reason `cellar.ts` gives about its own curve: the
    // reduced-motion path draws one frame at second zero and `camera/drift.ts` is
    // evaluated at this number, so an answer of 1e-17 puts the held composition off
    // its own anchor on one floor and no other.
    for (const rate of [24, 18, 12, 8]) {
      expect(filmFrameAt(0, rate)).toEqual({ time: 0, index: 0 });
    }
  });

  it('slows down without changing shape', () => {
    // The same second at four rates gives four different frames of the same show.
    // Eight frames a second is a third of twenty-four, so a given second is a third
    // as far into the reel.
    expect(filmFrameAt(3, 24).index).toBe(72);
    expect(filmFrameAt(3, 18).index).toBe(54);
    expect(filmFrameAt(3, 12).index).toBe(36);
    expect(filmFrameAt(3, 8).index).toBe(24);
  });
});

describe('the projector stopped', () => {
  // This is the floor. At noon the rate is exactly zero and the machine is stopped
  // dead with the lamp still on, so the answer must not depend on the second at
  // all — `verify-shader.mjs` renders the shuttered hour at two different clocks
  // and requires the two frames to be identical. A held frame that still advanced
  // its index would leave the grain crawling on a stationary picture, which reads
  // as a bug in a room whose entire argument is that nothing is moving.
  it('holds one frame, whatever the clock says', () => {
    const held = { time: 0, index: 0 };

    for (const seconds of [0, 0.5, 1, 97, 3600, -12]) {
      expect(filmFrameAt(seconds, 0)).toEqual(held);
    }
  });

  it('treats a rate that could not run as stopped rather than as an error', () => {
    // Negative and non-finite rates are not reachable from `PROJECTION_RIGS` and
    // are not allowed to take the page down if they ever become so. A stopped
    // projector is a picture; a thrown exception in a render loop is a dead canvas.
    for (const rate of [-24, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(filmFrameAt(5, rate)).toEqual({ time: 0, index: 0 });
    }
  });

  it('holds when the clock itself is corrupt', () => {
    for (const seconds of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(filmFrameAt(seconds, 24)).toEqual({ time: 0, index: 0 });
    }
  });
});

describe('the bench', () => {
  it('names the six effects AUBADE names, in order', () => {
    expect(FILM_STACK).toEqual(['weave', 'halation', 'grain', 'judder', 'splices', 'cues']);
  });

  it('arrives threaded up and running', () => {
    // Six dead switches is a configuration screen. The room's proposition is that
    // the visitor is standing behind a machine that is already showing something.
    for (const effect of FILM_STACK) {
      expect(THREADED[effect]).toBe(true);
    }
  });

  it('gives every effect its own bit', () => {
    const bits = FILM_STACK.map((effect) => STACK_BITS[effect]);
    expect(new Set(bits).size).toBe(FILM_STACK.length);

    // Powers of two, ascending, so the mask is a bitmask rather than a sum that
    // happens to be unique.
    for (const [index, bit] of bits.entries()) {
      expect(bit).toBe(2 ** index);
    }
  });

  it('packs the whole stack into one integer', () => {
    expect(benchMask(THREADED)).toBe(63);

    const bare = Object.fromEntries(FILM_STACK.map((effect) => [effect, false])) as Record<
      FilmEffect,
      boolean
    >;
    expect(benchMask(bare)).toBe(0);

    expect(benchMask({ ...bare, halation: true })).toBe(STACK_BITS.halation);
    expect(benchMask({ ...bare, halation: true, cues: true })).toBe(
      STACK_BITS.halation | STACK_BITS.cues
    );
  });

  it('throws one switch without touching the others, and without mutating', () => {
    const thrown = toggled(THREADED, 'grain');

    expect(thrown.grain).toBe(false);
    expect(THREADED.grain).toBe(true);
    expect(thrown).not.toBe(THREADED);

    for (const effect of FILM_STACK) {
      if (effect !== 'grain') {
        expect(thrown[effect]).toBe(THREADED[effect]);
      }
    }

    expect(toggled(thrown, 'grain')).toEqual(THREADED);
  });
});

describe('the reel', () => {
  it('is long enough for a change to be an event and short enough to be seen', () => {
    expect(REEL_SECONDS).toBe(40);
    expect(CUE_LEAD_SECONDS).toBe(8);
    expect(CUE_FRAMES).toBe(4);
  });

  it('leaves room for both cues inside one reel', () => {
    // The motor cue is eight seconds out and the changeover cue is at the end. A
    // lead longer than the reel would put the first dot in the previous reel, which
    // is not a reel change, it is a dot.
    expect(CUE_LEAD_SECONDS).toBeLessThan(REEL_SECONDS);
  });
});
