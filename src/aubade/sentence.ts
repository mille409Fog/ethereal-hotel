/**
 * The Library's sentence: one line of writing that will not stay in one language.
 *
 * AUBADE gives Floor −2 a single idea — "One sentence, migrating across eight
 * languages in seven writing systems, glyphs dissolving into one another rather
 * than cutting" — and `rooms/library-rig.ts` built the room around the half of it
 * that is a light rig. This file is the other half: what the sentence says, which
 * hands it is written in, and where in a forty-second cycle it currently is
 * between two of them.
 *
 * ## Eight languages, seven hands, and the difference is the floor
 *
 * The table below migrates between *languages*. Seven writing systems is what
 * eight languages happen to cost, rather than the thing being counted — and the
 * distinction is not pedantry, because English and French share an alphabet. That
 * pair is the proof the room is not about alphabets: the dissolve between them is
 * the same travelling zero crossing as every other, moving a fraction of the
 * distance, and if the floor still reads as the same event there then the floor
 * was never about letterforms in the first place.
 *
 * It also makes the order a constraint rather than a list. Two lines in one hand
 * placed next to each other morph over a distance short enough to read as a typo
 * being corrected, so English and French sit as far apart in the cycle as the
 * other six allow. `adjacentSameScript` is that rule written down, and
 * `sentence.spec.ts` is the only thing that enforces it — a table in the wrong
 * order renders perfectly.
 *
 * ## Shaping was answered by not doing it, and authorship by asking
 *
 * AUBADE's phase note says "get the Arabic and Devanagari shaping right or cut
 * those two; broken shaping is an insult, not an effect." Neither happened. The
 * atlas is laid out by Playwright's Chromium, which shapes with HarfBuzz — so
 * Arabic's joining forms, Devanagari's reordered matras and stacked conjuncts, and
 * both right-to-left runs are answered by the same engine that answers them for a
 * reader of those scripts every day. See `scripts/build-sentence-atlas.mjs`, whose
 * header is where that argument lives.
 *
 * What outlived the shaping problem was authorship, which is what AUBADE's sixth
 * non-negotiable is actually about: a line nobody here can vouch for is not a
 * thing to carve on a wall. That is why this table was four rows long for as long
 * as it was, and why it is eight now — every line below has a named reviewer in
 * `docs/aubade-credits.md`, and `check:docs` fails if one reaches the frieze
 * without one. Chinese is not here for exactly that reason and no other.
 *
 * ## The order is the order the letterforms are related in
 *
 * English, Greek, Russian — three neighbours on one family tree, since Latin's
 * letters are Greek letters that went west and Cyrillic's are Greek letters that
 * went north, and a dissolve between two related hands reads as a letter
 * *drifting* rather than as one letter being swapped for another. Then Hebrew into
 * Arabic, two right-to-left abjads, which is the same argument again in the other
 * direction of writing. French, Hindi and Korean are the jumps, and the wrap from
 * Korean back to English is the one with nothing shared at either end — the one
 * that reads, correctly, as the sentence starting over.
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
  /**
   * Stable identifier. Names the **language**, not the writing system.
   *
   * It named the writing system until French arrived, and French is what made that
   * wrong: `latin` was the English line only for as long as English was the one
   * language in the table written in Latin letters. The id is load-bearing beyond
   * this file — it is the name of the vendored face in `scripts/library-fonts/`, the
   * key `check:docs` matches a row of `docs/aubade-credits.md` by, and the name the
   * atlas builder registers the `@font-face` under — so the two sides of each of
   * those pairs move together or the gate says so.
   */
  readonly id: string;

  /** The writing system, in English, for the credits and the Reader's Edition. */
  readonly script: string;

  /** The language the line below is in — which is not the same question. */
  readonly language: string;

  /**
   * The sentence, in logical order — the order it is typed and stored, which for
   * Arabic and Hebrew is not the order it is drawn in.
   *
   * Nothing here reorders, substitutes or joins anything. The atlas builder hands
   * this string to Chromium, and HarfBuzz returns the line a reader of that script
   * would expect: Arabic's initial, medial and final forms selected and joined,
   * Devanagari's matras moved to where they are read rather than where they are
   * typed, and both right-to-left runs laid out from the right. That is a property
   * of the layout engine rather than of these particular eight lines, which is why
   * adding a ninth is a row and a font.
   */
  readonly text: string;

  /** Which way the line runs. The atlas builder sets the canvas direction from it. */
  readonly direction: 'ltr' | 'rtl';

  /**
   * The face, as a Google Fonts family name.
   *
   * Five families cover the eight lines, because Noto Serif carries English,
   * French, Greek and Russian between them — which is why the frieze reads as one
   * inscription in several hands rather than as several inscriptions. The other
   * four are the Noto serifs for their scripts, except Arabic: Google publishes no
   * "Noto Serif Arabic", and Naskh *is* the Arabic serif tradition rather than a
   * substitute for one.
   *
   * Each line is still cut its own subset under its own `aubade-<id>` name — see
   * `loadFonts` in the atlas builder, which explains why four subsets sharing the
   * real family name would silently draw each other's lines.
   */
  readonly family: string;

  /**
   * Tracking, in ems, for the inscription.
   *
   * A field rather than a constant because a carved inscription wants loose letters
   * and two of these scripts cannot have them. Letter-spacing Arabic pulls its
   * joins apart, and letter-spacing Devanagari opens gaps in the shirorekha — the
   * headline that runs across the top of a word — which is the same fault in a
   * different place: a line that is meant to be continuous, broken at every glyph.
   * Both are set to **exactly 0**, and both were checked by eye against the built
   * atlas rather than reasoned about, because this is the one property of the
   * frieze no gate in the repository can see.
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
    id: 'english',
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
    id: 'russian',
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
  {
    id: 'arabic',
    script: 'Arabic',
    language: 'Arabic',
    text: 'امنحني مأوىً من الضوء.',
    direction: 'rtl',
    family: 'Noto Naskh Arabic',
    tracking: 0,
  },
  {
    id: 'french',
    script: 'Latin',
    language: 'French',
    text: 'Offre-moi un abri contre la lumière.',
    direction: 'ltr',
    family: 'Noto Serif',
    tracking: 0.08,
  },
  {
    id: 'hindi',
    script: 'Devanagari',
    language: 'Hindi',
    text: 'मुझे रोशनी से पनाह दो।',
    direction: 'ltr',
    family: 'Noto Serif Devanagari',
    tracking: 0,
  },
  {
    id: 'korean',
    script: 'Hangul',
    language: 'Korean',
    text: '빛을 피할 안식처를 내게 주오.',
    direction: 'ltr',
    family: 'Noto Serif KR',
    tracking: 0.06,
  },
];

/**
 * Every place in the cycle where one line dissolves into another in the same hand.
 *
 * ## Why this is a rule and not a preference
 *
 * The floor migrates between *languages*, and seven writing systems is what eight
 * languages happen to cost — so English and French are the one pair in the table
 * that share an alphabet. AUBADE is explicit about what that costs if they are
 * allowed to sit next to each other: "a short morph between two Latin lines reads as
 * a typo being corrected rather than as the sentence moving". The dissolve still
 * works — the zero crossing still travels — it just travels a fraction of the
 * distance, and a visitor reads the result as a spelling change rather than as the
 * room's one idea.
 *
 * So the table's order is a constraint rather than a list, and this is the constraint
 * written down. Nothing at runtime calls it: the renderer does not care, and a table
 * that violated it would render perfectly. `sentence.spec.ts` is the only caller, and
 * that is the point — this is the shape of claim `check:docs` cannot make, because
 * the answer is not in any one file's text.
 *
 * Adjacency **wraps**. The last line dissolving back into the first is a transition
 * like any other — `migrationAt` treats it as one — and it is the pair most easily
 * forgotten, because it is the only one that is not two rows next to each other on
 * the screen.
 *
 * @param scripts The table to check, in cycle order. Defaults to the shipped one.
 * @returns One pair of indices into `scripts` for each adjacent pair sharing a
 *   `script`, in cycle order, each pair in cycle order — `[from, to]`, so the wrap
 *   pair reads `[length - 1, 0]` rather than `[0, length - 1]`. Empty when the table
 *   is well ordered, which is what the test asserts of the shipped table.
 */
export function adjacentSameScript(
  scripts: readonly ISentenceScript[] = SENTENCE_SCRIPTS
): ReadonlyArray<readonly [number, number]> {
  // Fewer than two lines is not a cycle. The guard is before the modulo rather than
  // inside it because `1 % 1` is 0: a table of one wraps onto itself and would be
  // reported as dissolving into itself, which is not a pair and not a fault.
  if (scripts.length < 2) {
    return [];
  }

  const clashes: Array<readonly [number, number]> = [];

  for (let from = 0; from < scripts.length; from += 1) {
    const to = (from + 1) % scripts.length;
    if (scripts[from].script === scripts[to].script) {
      clashes.push([from, to]);
    }
  }

  return clashes;
}

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

/**
 * The atlas's tile height, in pixels. One line, with room above and below it.
 *
 * It has to clear `ATLAS_SPREAD` above the tallest ink and below the lowest, or a
 * field clamps against the tile boundary and morphs into its neighbour's edge
 * rather than into its neighbour's letters. That was the open question when Arabic
 * and Devanagari were added — Devanagari hangs a headline above and stacks
 * conjuncts below — and the atlas is one column of equal tiles, so a line that did
 * not fit moved this number for all eight.
 *
 * Measured, rather than reasoned about: at the size the eight lines share, the
 * tightest tile is the **Arabic**, not the Devanagari, at 33 pixels of clearance
 * top and bottom against a spread of 32. Devanagari has 37. So 128 stands, with one
 * pixel in hand on the line nobody expected to be the binding one — which is worth
 * remembering before a ninth line is added, because it will very likely be this
 * constant that moves.
 */
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
