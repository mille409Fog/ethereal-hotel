import {
  adjacentSameScript,
  ATLAS_SPREAD,
  ATLAS_TILE_HEIGHT,
  ATLAS_TILE_WIDTH,
  CYCLE_SECONDS,
  type ISentenceScript,
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
  it('sets the shaped scripts at no tracking at all', () => {
    // This test used to assert the opposite of what it asserts now: that no line
    // contained an Arabic or a Devanagari codepoint, because the atlas builder's
    // "type it and photograph it" was only sufficient for scripts that do not
    // reorder or join. It was written to be the place somebody was told when those
    // lines arrived. They have arrived, and what it was really guarding turned out
    // to be one field.
    //
    // Chromium shapes both correctly — that half needed no assertion and could not
    // have had one here, since nothing in a unit test lays out text. What a unit
    // test *can* hold is the tracking, and tracking is the one setting that undoes
    // correct shaping after the fact: it pulls Arabic's joins apart and breaks
    // Devanagari's shirorekha into one segment per glyph. Exactly 0, both.
    //
    // Written as script properties rather than as codepoint ranges: the ranges
    // contain combining marks, and a character class spanning those is exactly what
    // makes a regex quietly match something other than what it looks like.
    const shaped = /[\p{Script=Arabic}\p{Script=Devanagari}]/u;

    for (const script of SENTENCE_SCRIPTS) {
      expect(script.text.length).toBeGreaterThan(0);

      if (shaped.test(script.text)) {
        expect(script.tracking).toBe(0);
      } else {
        expect(script.tracking).toBeGreaterThan(0);
      }
    }
  });

  it('says it in eight languages and seven hands', () => {
    // The count the shader is told separately — SENTENCE_TILES in hotel.frag.ts,
    // which GLSL cannot import and check:docs holds against this table. The seven is
    // the interesting half: it is one fewer than eight because English and French
    // share an alphabet, which is the fact the whole ordering rule below exists for.
    expect(SENTENCE_SCRIPTS).toHaveLength(8);

    const languages = SENTENCE_SCRIPTS.map((script) => script.language);
    expect(new Set(languages).size).toBe(8);
    expect(new Set(SENTENCE_SCRIPTS.map((script) => script.script)).size).toBe(7);
  });

  it('names every line for its language rather than its hand', () => {
    // The rename French forced: `latin` was the English line only while English was
    // the one language written in Latin letters. The id is the vendored face's
    // filename and the key check:docs matches a credits row by, so it has to be the
    // thing that stays unique.
    for (const script of SENTENCE_SCRIPTS) {
      expect(script.id).toBe(script.language.toLowerCase());
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

/**
 * The table's order, which is a constraint rather than a list.
 *
 * Eight languages in seven writing systems means exactly one pair of lines shares an
 * alphabet, and where that pair sits is the difference between the floor's idea and a
 * spellcheck. Nothing at runtime enforces it — a table in the wrong order renders
 * beautifully — so this is the whole of the enforcement.
 */
describe('the order the sentence migrates in', () => {
  /** A table of the given writing systems, in order. Only `script` is read. */
  const table = (...scripts: readonly string[]): readonly ISentenceScript[] =>
    scripts.map((script, index) => ({
      id: `line-${index}`,
      script,
      language: `Language ${index}`,
      text: 'x',
      direction: 'ltr' as const,
      family: 'Noto Serif',
      tracking: 0.08,
    }));

  it('never dissolves one hand into itself, in the table that ships', () => {
    // The assertion this function exists for. If it fails, two lines in the same
    // alphabet have ended up next to each other and the morph between them reads as
    // a typo being corrected — see AUBADE's note on French, which is the only line
    // that can cause it.
    expect(adjacentSameScript()).toEqual([]);
  });

  it('finds a pair sitting next to each other', () => {
    expect(adjacentSameScript(table('Latin', 'Latin', 'Greek', 'Hebrew'))).toEqual([[0, 1]]);
    expect(adjacentSameScript(table('Greek', 'Latin', 'Latin', 'Hebrew'))).toEqual([[1, 2]]);
  });

  it('finds the pair across the wrap, which is the one that gets forgotten', () => {
    // The last line dissolving into the first is a transition like any other, and the
    // only one that is not two rows adjacent on the screen.
    expect(adjacentSameScript(table('Latin', 'Greek', 'Hebrew', 'Latin'))).toEqual([[3, 0]]);
  });

  it('reports pairs in cycle order, each as [from, to]', () => {
    // Direction matters in the result as much as in the room: `[3, 0]` is the wrap
    // and `[0, 3]` is a pair that does not exist.
    expect(adjacentSameScript(table('Latin', 'Latin', 'Greek', 'Greek'))).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });

  it('reports every pair when the whole table is one hand', () => {
    expect(adjacentSameScript(table('Latin', 'Latin', 'Latin'))).toEqual([
      [0, 1],
      [1, 2],
      [2, 0],
    ]);
  });

  it('finds nothing in a table too short to have a neighbour', () => {
    // A table of one is the trap. Its only line both precedes and follows itself, so
    // an unguarded wrap reports `[0, 0]` — a line dissolving into itself, which is
    // not a pair and not a fault.
    expect(adjacentSameScript(table())).toEqual([]);
    expect(adjacentSameScript(table('Latin'))).toEqual([]);
  });

  it('compares hands rather than languages', () => {
    // Two languages in one alphabet is the case; one language twice is not a case at
    // all. `script` is the field that decides, and `language` must not be consulted.
    expect(adjacentSameScript(table('Latin', 'Greek'))).toEqual([]);
  });
});
