import {
  ATLAS_SPREAD,
  ATLAS_TILE_HEIGHT,
  ATLAS_TILE_WIDTH,
  CYCLE_SECONDS,
  migrationAt,
  MIGRATION_SECONDS,
  SCRIPT_SECONDS,
  SENTENCE_SCRIPTS,
  SENTENCE_SOURCE,
  SETTLED_SECONDS,
} from './sentence';

/**
 * Floor −2's arithmetic, and the table it walks.
 *
 * `migrationAt` is one modulo and one comparison, and like the projector's gate one
 * floor down it cannot be checked by looking at the render. A sentence stuck in one
 * script looks like a sentence. A sentence that never quite settles — `across` at
 * 0.0001 rather than 0 — looks like a sentence too, in a room whose whole subject is
 * the shape of letters, because the wrongness is a hundredth of a pixel everywhere
 * rather than a visible fault anywhere. Both of those are here.
 */

describe('where the sentence is', () => {
  it('is settled, exactly, through the whole of a hold', () => {
    // The assertion the shader depends on. `across` multiplies a mix between two
    // sampled distance fields, so a residual fraction is every letterform in the
    // room permanently a little way into the next script's shape.
    for (let offset = 0; offset < SETTLED_SECONDS; offset += 0.25) {
      const settled = migrationAt(offset);
      expect(settled.across).toBe(0);
      expect(settled.to).toBe(settled.from);
      expect(settled.from).toBe(0);
    }
  });

  it('holds each script in turn, in the order the table lists them', () => {
    for (let index = 0; index < SENTENCE_SCRIPTS.length; index += 1) {
      const midHold = migrationAt(index * SCRIPT_SECONDS + SETTLED_SECONDS / 2);
      expect(midHold.from).toBe(index);
      expect(midHold.to).toBe(index);
      expect(midHold.across).toBe(0);
    }
  });

  it('dissolves into the next script, linearly', () => {
    const start = SETTLED_SECONDS;

    expect(migrationAt(start).from).toBe(0);
    expect(migrationAt(start).to).toBe(1);
    expect(migrationAt(start).across).toBe(0);

    expect(migrationAt(start + MIGRATION_SECONDS / 2).across).toBeCloseTo(0.5, 10);
    expect(migrationAt(start + MIGRATION_SECONDS * 0.25).across).toBeCloseTo(0.25, 10);
  });

  it('reports a finished dissolve as the next script settled, never as a full one', () => {
    // `across` is half-open. A value of exactly 1 would name the same picture twice
    // — tile B at fraction 1 and tile B settled — and the two would arrive on
    // consecutive frames, which is a frame of duplicated work rather than a bug, but
    // it also means nothing downstream can use `across === 0` to mean "settled".
    for (let step = 0; step <= 400; step += 1) {
      const morph = migrationAt(step * 0.19);
      expect(morph.across).toBeGreaterThanOrEqual(0);
      expect(morph.across).toBeLessThan(1);
    }
  });

  it('wraps from the last script back to the first', () => {
    const last = SENTENCE_SCRIPTS.length - 1;
    const wrapping = migrationAt(last * SCRIPT_SECONDS + SETTLED_SECONDS + MIGRATION_SECONDS / 2);

    expect(wrapping.from).toBe(last);
    expect(wrapping.to).toBe(0);
    expect(wrapping.across).toBeCloseTo(0.5, 10);
  });

  it('repeats one cycle later', () => {
    // The indices to the bit, the fraction to a tolerance, and the difference
    // between those two claims is the reason `across` is exactly 0 when settled
    // rather than merely small. A subtraction of a large second from a larger one
    // loses low bits — `19.3 + 36` and `19.3` are not the same distance into their
    // turns to the last ulp, and no arrangement of this arithmetic makes them so.
    // The settled case has no such problem because it does not compute a fraction
    // at all: it returns the literal 0, which survives any clock.
    for (const seconds of [0, 2.4, SETTLED_SECONDS, 7.7, 19.3, CYCLE_SECONDS - 0.01]) {
      for (const cycles of [1, 9]) {
        const later = migrationAt(seconds + CYCLE_SECONDS * cycles);
        const now = migrationAt(seconds);

        expect(later.from).toBe(now.from);
        expect(later.to).toBe(now.to);
        expect(later.across).toBeCloseTo(now.across, 10);
      }
    }
  });

  it('cycles backwards rather than reflecting, on a negative clock', () => {
    // A floored modulo, not a truncated one. JavaScript's `%` keeps the sign of its
    // left operand, so −1 % 36 is −1 and `from` comes out as −1 — an index the atlas
    // has no tile for, which samples as whatever is at the other end of the texture.
    expect(migrationAt(-1)).toEqual(migrationAt(CYCLE_SECONDS - 1));
    expect(migrationAt(-CYCLE_SECONDS - 4)).toEqual(migrationAt(CYCLE_SECONDS - 4));

    for (let step = 1; step <= 200; step += 1) {
      const morph = migrationAt(-step * 0.37);
      expect(morph.from).toBeGreaterThanOrEqual(0);
      expect(morph.from).toBeLessThan(SENTENCE_SCRIPTS.length);
    }
  });

  it('never leaves the table, over a long clock', () => {
    for (let step = 0; step <= 2000; step += 1) {
      const morph = migrationAt(step * 0.41);
      expect(Number.isInteger(morph.from)).toBe(true);
      expect(Number.isInteger(morph.to)).toBe(true);
      expect(morph.from).toBeGreaterThanOrEqual(0);
      expect(morph.from).toBeLessThan(SENTENCE_SCRIPTS.length);
      expect(morph.to).toBeGreaterThanOrEqual(0);
      expect(morph.to).toBeLessThan(SENTENCE_SCRIPTS.length);
    }
  });

  it('falls back to the first script rather than passing NaN to a uniform', () => {
    // A driver renders a NaN uniform as a black frame and says nothing about it, so
    // the failure this prevents is the whole route going dark with a clean console.
    for (const broken of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(migrationAt(broken)).toEqual({ from: 0, to: 0, across: 0 });
    }
  });
});

describe('the sentence itself', () => {
  it('ships only scripts whose lines need no shaping', () => {
    // The cut AUBADE's phase note licenses, held as an assertion. Every codepoint
    // below is from an unjoined, unreordered script; the moment an Arabic or a
    // Devanagari line is added, this test is where somebody is told that the atlas
    // builder's "type it and photograph it" approach has stopped being sufficient.
    // Arabic and Devanagari, which are the two AUBADE names by name. Written as
    // script properties rather than as codepoint ranges: the ranges contain
    // combining marks, and a character class spanning those is exactly what makes a
    // regex quietly match something other than what it looks like.
    const shaped = /[\p{Script=Arabic}\p{Script=Devanagari}]/u;

    for (const script of SENTENCE_SCRIPTS) {
      expect(script.text.length).toBeGreaterThan(0);
      expect(shaped.test(script.text)).toBe(false);
    }
  });

  it('says the same thing in every hand it has', () => {
    expect(SENTENCE_SCRIPTS[0].text).toBe(SENTENCE_SOURCE);
    expect(SENTENCE_SCRIPTS[0].language).toBe('English');
  });

  it('names each script once', () => {
    const ids = SENTENCE_SCRIPTS.map((script) => script.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives the atlas room for a field wide enough to morph', () => {
    // The spread is the morph's requirement rather than the lettering's — see the
    // constant's comment. A field that clamps close to its strokes cross-dissolves.
    expect(ATLAS_SPREAD * 4).toBeGreaterThanOrEqual(ATLAS_TILE_HEIGHT);
    expect(ATLAS_TILE_WIDTH % 4).toBe(0);
    expect(ATLAS_TILE_HEIGHT % 4).toBe(0);
  });
});
