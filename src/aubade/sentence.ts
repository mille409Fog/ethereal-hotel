/**
 * The Library's sentence: one line of writing that will not stay in one script.
 *
 * AUBADE gives Floor −2 a single idea — "One sentence, migrating across eight
 * writing systems, glyphs dissolving into one another rather than cutting" — and
 * `rooms/library-rig.ts` built the room around the half of it that is a light rig.
 * This file is the other half: what the sentence says, which hands it is written
 * in, and where in a thirty-six second cycle it currently is between two of them.
 *
 * ## Four hands, not eight, and that is a decision rather than a stopping point
 *
 * AUBADE's phase note says, in as many words, "get the Arabic and Devanagari
 * shaping right or cut those two; broken shaping is an insult, not an effect."
 * That licence is taken here and extended by the same argument to Han and Hangul,
 * for two different reasons that happen to point the same way.
 *
 * The first is shaping. Every script below is *unjoined*: a Greek sigma, a
 * Cyrillic ze and a Hebrew mem are the same shape wherever in a word they fall,
 * and Hebrew's five final forms are separate codepoints rather than a contextual
 * substitution. So the line that goes into the atlas is the line that was typed,
 * and there is no shaper to get wrong. Arabic joins, Devanagari reorders its
 * matras and stacks conjuncts, and both are a class of correctness this file
 * cannot assert about itself.
 *
 * The second is authorship, and it is the one AUBADE's sixth non-negotiable is
 * actually about. `docs/aubade-credits.md` states the provenance of every line
 * below, and `check:docs` fails if a script ships without an entry there. Four
 * lines whose provenance is written down beat eight where half are hoped for.
 *
 * The remaining four are a data change and a font, not an architecture: add an
 * entry, re-run `npm run build:sentence`, and the atlas grows a tile. Nothing in
 * the shader, the renderer or the gates counts to four.
 *
 * ## The order is the order the letterforms are related in
 *
 * Latin, Greek, Cyrillic, Hebrew — and then back to Latin. Three of those four
 * transitions are between neighbours on the same family tree: Latin's letters are
 * Greek letters that went west, Cyrillic's are Greek letters that went north, and
 * a dissolve between two related hands reads as a letter *drifting* rather than
 * as one letter being swapped for another. The fourth is the wrap, Hebrew back to
 * Latin, which is the one jump in the cycle with nothing shared at either end —
 * and it is the one that reads, correctly, as the sentence starting over.
 *
 * ## The sentence fades with the spines, and by the same uniform
 *
 * Nothing here reads the clock. `uInk` — the one field of `LIBRARY_RIGS` the sun
 * moves — multiplies the lettering on the frieze exactly as it multiplies the gilt
 * on the spines, so at the shuttered hour there is no sentence at all in a room
 * whose lamps are burning at the strength they burned at three in the morning.
 * That was written into `rooms/library-rig.ts` before this file existed, and the
 * whole of this phase's answer to the clock is that it changed nothing there.
 *
 * Nothing here imports from `src/app/`.
 */

/** A writing system the sentence passes through, and the line it says in it. */
export interface ISentenceScript {
  /** Stable identifier. Names the writing system, not the language. */
  readonly id: string;

  /** The writing system, in English, for the credits and the Reader's Edition. */
  readonly script: string;

  /** The language the line below is in — which is not the same question. */
  readonly language: string;

  /**
   * The sentence. Typed as it is laid out: every script here is unjoined and
   * unreordered, so the atlas builder hands this string to the browser and gets
   * back the line a reader of that script would expect. See the file comment for
   * why that is a property of *these four* rather than of writing in general.
   */
  readonly text: string;

  /** Which way the line runs. The atlas builder sets the canvas direction from it. */
  readonly direction: 'ltr' | 'rtl';

  /**
   * The face, as a Google Fonts family name. Two files cover all four scripts —
   * Noto Serif carries Latin, Greek and Cyrillic between them — which is why the
   * frieze reads as one inscription in four hands rather than four inscriptions.
   */
  readonly family: string;

  /**
   * Tracking, in ems, for the inscription.
   *
   * A field rather than a constant because it is the first thing a joining script
   * will need set to zero: letter-spacing an Arabic line pulls the joins apart and
   * produces exactly the insult AUBADE names. None of the four below joins, so all
   * four can carry the loose tracking a carved inscription wants.
   */
  readonly tracking: number;
}

/**
 * The line, in the language it was written in.
 *
 * Held separately as well as in the table because it is the sentence the other
 * three are translations *of*, and the credits file and the Reader's Edition both
 * need to say so.
 */
export const SENTENCE_SOURCE = 'Give me shelter from the light.';

/**
 * The scripts the sentence passes through, in cycle order.
 *
 * The array's order is the migration's order and its indices are the atlas's tile
 * indices. Those three things being the same number is deliberate and is what
 * keeps `migrationAt` from needing a lookup table.
 */
export const SENTENCE_SCRIPTS: readonly ISentenceScript[] = [
  {
    id: 'latin',
    script: 'Latin',
    language: 'English',
    text: SENTENCE_SOURCE,
    direction: 'ltr',
    family: 'Noto Serif',
    tracking: 0.08,
  },
  {
    id: 'greek',
    script: 'Greek',
    language: 'Greek',
    text: 'Δώσε μου καταφύγιο από το φως.',
    direction: 'ltr',
    family: 'Noto Serif',
    tracking: 0.08,
  },
  {
    id: 'cyrillic',
    script: 'Cyrillic',
    language: 'Russian',
    text: 'Укрой меня от света.',
    direction: 'ltr',
    family: 'Noto Serif',
    tracking: 0.08,
  },
  {
    id: 'hebrew',
    script: 'Hebrew',
    language: 'Hebrew',
    text: 'תן לי מחסה מן האור.',
    direction: 'rtl',
    family: 'Noto Serif Hebrew',
    tracking: 0.06,
  },
];

/**
 * How long the sentence holds still in one language, in seconds.
 *
 * Long enough to register as a finished sentence and no longer. This was six —
 * long enough to *read* the line twice — and six is what a floor of eight
 * languages cannot afford: at nine seconds a turn the full cycle is seventy-two,
 * which nobody stays for. The hold is what gave way rather than the dissolve,
 * because the dissolve is the room and the hold was sized for a reading that
 * mostly does not happen. Most visitors cannot read most of these lines and are
 * not meant to; what they are meant to catch is one sentence refusing to stay
 * still.
 */
export const SETTLED_SECONDS = 2;

/**
 * How long one script takes to become the next, in seconds.
 *
 * Half again as long as it takes to read a word, and deliberately close to the
 * lift's seven and a half: AUBADE calls the elevator "a timed morph between two
 * distance fields, visible and unhurried", and this is the same event at the scale
 * of a letter. A dissolve fast enough to feel like a transition is a cut with
 * blur on it.
 *
 * It is now longer than the hold, which is the right proportion for this floor
 * rather than an accident of shortening the other one: the sentence spends more
 * of its time moving than standing, and the moving is the exhibit.
 */
export const MIGRATION_SECONDS = 3;

/** One language's whole turn: its hold, and its dissolve into the next. */
export const SCRIPT_SECONDS = SETTLED_SECONDS + MIGRATION_SECONDS;

/** The full cycle. Every language in the table at five seconds each. */
export const CYCLE_SECONDS = SCRIPT_SECONDS * SENTENCE_SCRIPTS.length;

/**
 * Where the sentence is between two scripts.
 *
 * The two indices are tile indices into the atlas — see `SENTENCE_SCRIPTS`, whose
 * order is the atlas's order — and `across` is how far the dissolve between them
 * has got. The shader samples both tiles and mixes their distance fields, which is
 * why this is a pair and a fraction rather than a single blended thing: two glyphs
 * cannot be averaged, but the two distance functions that describe them can, and
 * the average is another valid distance function.
 */
export interface ISentenceMorph {
  /** The script being left. An index into `SENTENCE_SCRIPTS`. */
  readonly from: number;

  /** The script being arrived at. Equal to `from` while the sentence is settled. */
  readonly to: number;

  /**
   * How far across, in [0, 1). Linear — the easing is in the shader, next to the
   * mix it shapes.
   *
   * **Exactly 0 whenever the sentence is settled**, which is most of the time and
   * is the property the whole thing rests on. See `migrationAt`.
   */
  readonly across: number;
}

/** The sentence, settled in its first script. The fallback, and the first frame. */
const AT_REST: ISentenceMorph = { from: 0, to: 0, across: 0 };

/**
 * Which two scripts the sentence is between at a given moment, and how far.
 *
 * The cycle is `SENTENCE_SCRIPTS.length` turns of `SCRIPT_SECONDS`, each turn a
 * hold of `SETTLED_SECONDS` followed by a dissolve of `MIGRATION_SECONDS` into the
 * next script — wrapping from the last script back to the first, which is the one
 * transition in the cycle between two unrelated hands.
 *
 * ## The exactness is the whole function
 *
 * During a hold this returns `across` of **exactly** zero and `to` equal to `from`.
 * Not nearly zero. The shader mixes two sampled distance fields by this number, so
 * a settled sentence with a residual fraction in it is a sentence permanently
 * dissolved a little way into the next script — every letterform slightly wrong,
 * at every hour, in a room whose entire subject is letterforms. It is the same
 * requirement `descent.ts` makes of the lift and `projection.ts` makes of the
 * projector's gate, and it fails the same way: invisibly, and everywhere at once.
 *
 * @param seconds The room's clock — `IFrame.simulatedSeconds`, not `performance.now()`.
 *   Non-finite input returns the sentence settled in its first script rather than
 *   propagating `NaN` into a uniform, which a driver renders as a black frame with
 *   nothing in the console. Negative input cycles rather than clamping; the modulo
 *   below is floored rather than truncated so that −1s and 35s are the same instant
 *   of the same cycle.
 * @returns The pair of tile indices and the fraction between them. Both indices are
 *   always in range, and `across` is always in [0, 1) — a completed dissolve is
 *   reported as the next script settled, never as the previous one finished.
 */
export function migrationAt(seconds: number): ISentenceMorph {
  if (!Number.isFinite(seconds)) {
    return AT_REST;
  }

  const scripts = SENTENCE_SCRIPTS.length;

  // Floored rather than truncated, so a negative second lands in the cycle instead
  // of reflecting it. `%` on a negative left operand keeps the sign in JavaScript,
  // which would put `from` at a negative index.
  const intoCycle = seconds - Math.floor(seconds / CYCLE_SECONDS) * CYCLE_SECONDS;

  const from = Math.floor(intoCycle / SCRIPT_SECONDS);
  const intoTurn = intoCycle - from * SCRIPT_SECONDS;

  if (intoTurn < SETTLED_SECONDS) {
    return { from, to: from, across: 0 };
  }

  return {
    from,
    to: (from + 1) % scripts,
    across: (intoTurn - SETTLED_SECONDS) / MIGRATION_SECONDS,
  };
}

/**
 * The atlas's tile width, in pixels.
 *
 * Wide, because the tile holds a whole shaped line rather than a glyph. A sentence
 * that fills 1024 pixels puts about forty across each letter of the Latin line,
 * which is more than a distance field needs and about what the Hebrew needs.
 */
export const ATLAS_TILE_WIDTH = 1024;

/** The atlas's tile height, in pixels. One line, with room above and below it. */
export const ATLAS_TILE_HEIGHT = 128;

/**
 * How far the distance field runs from a stroke before it clamps, in tile pixels.
 *
 * Generous — a quarter of the tile's height — and that is the morph's requirement
 * rather than the lettering's. A field that clamps close to its strokes is flat
 * everywhere else, and mixing two flat fields gives a flat field: the letters of
 * the outgoing script would fade out on the spot while the incoming ones faded in
 * beside them, which is a cross-dissolve and is the thing AUBADE says this floor
 * must not do. A field that is still sloping thirty pixels out is one whose mix
 * with another has a real zero-crossing that *travels*, and a travelling zero
 * crossing is a letter changing shape.
 *
 * Costs precision: eight bits over ±32 pixels is a quarter of a pixel per code,
 * which is four codes across the width of an antialiased edge and plenty.
 */
export const ATLAS_SPREAD = 32;

/** Where the built atlas is served from. Written by `scripts/build-sentence-atlas.mjs`. */
export const SENTENCE_ATLAS_PATH = '/aubade-sentence.png';
