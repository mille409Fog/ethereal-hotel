/**
 * Floor −5's aria: a score nobody can hear, and the spectrum it would make.
 *
 * This file is the whole of what moves the Box, and like `cellar.ts` and
 * `projection.ts` it knows nothing about WebGL and is a pure function of the room's
 * clock. What it is not, yet, is an `AnalyserNode` — and that absence is the shape
 * of the file rather than a gap in it, so it is worth being exact about.
 *
 * ## The half that is built, and the half that is not
 *
 * AUBADE's line for this floor is "opera, WebAudio FFT → geometry", and it puts the
 * floor last for a stated reason: "audio licensing and autoplay policy are the two
 * things most likely to eat a week." The sixth non-negotiable is the sharp end of
 * that — no licensed audio, public domain or self-recorded, sourced in a credits
 * file — and it is a question about *provenance*, which is a question about people
 * rather than about code. It is the same cut the Library took over its missing four
 * writing systems, for the same reason, and `docs/aubade-credits.md` states it in
 * both places.
 *
 * So what ships is the geometry and the thing that drives it, and what does not ship
 * is the sound. There is no `AudioContext` on this floor. Nothing here plays,
 * requests permission to play, or asks a visitor to click before a room will work —
 * which incidentally answers the second of the two week-eaters outright, because a
 * piece with no audio graph has no autoplay policy to lose to.
 *
 * **The room is not silent by accident, and it does not read as one.** AUBADE's own
 * requirement for this floor is that it "must be beautiful with the sound off,
 * because for most visitors it will be", and the version that exists is that
 * sentence taken to its end: an aria is being sung in a house five floors under the
 * street, the room is moving to it, and nobody in the building can hear a note of
 * it. A hotel that refuses is the concept. This is the floor where the refusal is
 * about the work itself.
 *
 * ## Why the seam is a band vector and not a pitch
 *
 * `voiceAt` could return the note that is sounding and let the shader do the rest,
 * and it would render the same picture today and be the wrong shape tomorrow.
 *
 * What an `AnalyserNode` hands you is `getByteFrequencyData` — a bin per frequency,
 * not a note — so a shader written against a pitch would have to be rewritten the
 * day the sound arrives, and the room would change when it was supposed to have
 * merely started being audible. So the seam is a **band vector**: eight logarithmic
 * bands from 80 Hz to 8 kHz, which is exactly what an FFT binned for this purpose
 * would produce, and `bandsFor` is a spectral model of a voice rather than a
 * lookup. When the aria is recorded or synthesised, `voiceAt` is replaced by a read
 * of the analyser, `bandsFor` and `ARIA` are deleted, and `IVoice`, the uniforms,
 * the shader and every frame in `docs/images/` stay exactly as they are.
 *
 * That is the entire reason this file models a spectrum instead of a melody, and it
 * is worth the extra arithmetic: the alternative is a floor that has to be rebuilt
 * to gain the feature it was designed around.
 *
 * ## What the sun does to this floor, and what it does not
 *
 * Nothing in this file reads the clock, and that is deliberate. The five floors
 * above answer the hour with light arriving, light leaving, writing leaving, the
 * visitor's own eye, and speed. Floor −5 answers with **space** — the auditorium
 * beyond the balustrade closes in as the night ends, and at noon it is gone, with a
 * solid wall where the opera was. That lives in `rooms/box-rig.ts`, in one field.
 *
 * The voice is unaffected by any of it. The singer goes on singing at noon; there
 * is simply no longer a house for it to be singing in, so nothing in frame moves.
 * That falls out of the geometry rather than being arranged: everything the voice
 * displaces is house, and at the shuttered hour there is no house. It is why this
 * floor needs no second exactly-zero knob of its own, and why `voiceAt` can be a
 * pure function of one number and tested as one.
 */

/**
 * How many bands the voice is reduced to.
 *
 * Eight, and the number is a compromise between two failures rather than a round
 * figure. Fewer and the bands are so wide that a soprano's second formant and her
 * fundamental land in the same one, so the vector stops describing a timbre and
 * becomes a loudness meter with extra steps. More and the geometry has more
 * parameters than it has features to attach them to, which is how a room ends up
 * with eight things wobbling independently and reading as noise.
 *
 * Also: eight is two `vec4`s, which is how it crosses into GLSL — see `uVoiceLow`
 * and `uVoiceHigh` in `rooms/hotel.frag.ts`. An array uniform would have worked and
 * would have put a `[0]` in the reflection check that `verify:shader` reads.
 */
export const VOICE_BANDS = 8;

/** The bottom of the lowest band, in hertz. Below a contralto's lowest note. */
export const BAND_FLOOR_HZ = 80;

/** The top of the highest band, in hertz. Above anything a voice puts energy into. */
export const BAND_CEILING_HZ = 8000;

/**
 * One note of the score.
 *
 * A rest is a note with no pitch rather than a gap between notes, because a gap
 * would have to be timed by whatever sits on either side of it and a rest has a
 * length of its own. It is also what makes the score walkable in one pass.
 */
export interface INote {
  /**
   * Semitones from middle C, or `null` for a rest. Negative is below it.
   *
   * Semitones rather than hertz because the score was written as music and the
   * conversion is one line; a table of frequencies is a table nobody can check
   * against a keyboard.
   */
  readonly semitones: number | null;

  /** How long it is held, in beats. */
  readonly beats: number;

  /**
   * How hard it is sung, in [0, 1].
   *
   * Carries two things at once, exactly as it does for a singer: how loud the note
   * is, and how bright. A voice pushed harder puts more energy into its upper
   * harmonics, so this tilts the rolloff in `bandsFor` as well as scaling the
   * result in `voiceAt`.
   */
  readonly dynamic: number;
}

/**
 * The aria, in beats per minute.
 *
 * Slow. It is a dawn song sung by somebody who does not want the night to end, and
 * at anything brisker the geometry it drives reads as a pulse — which is the one
 * thing this room must not look like, because a room that throbs to a beat is a
 * visualiser and a visualiser is AUBADE's first failure mode wearing a dinner
 * jacket.
 */
export const ARIA_BPM = 46;

/** Seconds per beat, which is the only form the tempo is ever used in. */
export const BEAT_SECONDS = 60 / ARIA_BPM;

/**
 * The aria. The author's own, written for this piece — see `docs/aubade-credits.md`,
 * which is where the sixth non-negotiable is answered for this floor as well as for
 * the Library's.
 *
 * One phrase, sung twice with the second going higher and dying rather than
 * resolving: it climbs to a held D above the stave at the moment the hour is worst
 * and comes down to where it started with no cadence under it. It is an aubade, and
 * an aubade does not end well.
 *
 * Written in D minor and notated here in semitones from middle C, so the reader can
 * count it on a keyboard: 2 is the D above, 5 the F, 9 the A, 14 the D above that.
 */
export const ARIA: readonly INote[] = [
  // The first phrase. Rising, quiet, and it does not get anywhere.
  { semitones: 2, beats: 3, dynamic: 0.34 },
  { semitones: 5, beats: 1, dynamic: 0.38 },
  { semitones: 9, beats: 4, dynamic: 0.46 },
  { semitones: 10, beats: 2, dynamic: 0.5 },
  { semitones: 9, beats: 2, dynamic: 0.44 },
  { semitones: 7, beats: 2, dynamic: 0.4 },
  { semitones: 5, beats: 2, dynamic: 0.36 },
  { semitones: 4, beats: 3, dynamic: 0.32 },
  { semitones: 2, beats: 5, dynamic: 0.28 },
  { semitones: null, beats: 3, dynamic: 0 },

  // The second, which is the first one refusing to settle for it.
  { semitones: 9, beats: 2, dynamic: 0.52 },
  { semitones: 12, beats: 2, dynamic: 0.62 },
  { semitones: 14, beats: 6, dynamic: 0.86 },
  { semitones: 12, beats: 2, dynamic: 0.7 },
  { semitones: 10, beats: 2, dynamic: 0.6 },
  { semitones: 9, beats: 4, dynamic: 0.48 },
  { semitones: 5, beats: 3, dynamic: 0.36 },
  { semitones: 2, beats: 7, dynamic: 0.24 },
  { semitones: null, beats: 4, dynamic: 0 },
];

/** The whole aria, in beats. */
export const ARIA_BEATS = ARIA.reduce((total, note) => total + note.beats, 0);

/**
 * The whole aria, in seconds — and therefore how often it comes round again.
 *
 * It repeats rather than stopping, and that is a decision about the room rather than
 * about the file. A visitor who arrives four floors down and rides one more has no
 * way of knowing where in a performance they came in, so a score that ended would
 * be a room that eventually stopped moving for reasons invisible from inside it.
 */
export const ARIA_SECONDS = ARIA_BEATS * BEAT_SECONDS;

/**
 * The voice at one instant: what it is singing, and how much of it there is.
 *
 * Two fields plus an index, and the split is the same one `IFilmFrame` makes for the
 * floor above. `bands` is the shape *already scaled* by how much voice there is, so
 * silence is eight zeros and nothing downstream has to remember to multiply; `power`
 * is that scale on its own, for the things that want a single number and would
 * otherwise have to re-derive it from the vector.
 */
export interface IVoice {
  /**
   * Eight bands, low to high, each in [0, 1] — the spectrum with the envelope
   * already applied. All zero in a rest, and all zero for a clock that has gone
   * wrong.
   */
  readonly bands: readonly number[];

  /**
   * How much voice there is, in [0, 1]: the note's dynamic times where in the note
   * it has got to. Exactly 0 in a rest.
   */
  readonly power: number;

  /**
   * Which note of `ARIA` is sounding, or **−1 in a rest** and for a clock that has
   * gone wrong. An index rather than the note itself, because the two callers that
   * want it want to know whether it *changed*, which is a comparison an index makes
   * cheap and an object makes wrong.
   */
  readonly note: number;
}

/** A voice that is not singing. The rest, the bad clock, and the answer to both. */
export const SILENT: IVoice = {
  bands: Object.freeze(new Array<number>(VOICE_BANDS).fill(0)),
  power: 0,
  note: -1,
};

/**
 * How much of a note is its attack, as a fraction of its length.
 *
 * A voice does not switch on. Without this the bands step at every note boundary and
 * the house jolts, which reads as a bug in the geometry rather than as an onset —
 * the same failure `easeInOutSine` exists to prevent in the lift, one floor's worth
 * of subject matter further in.
 */
export const ATTACK_FRACTION = 0.14;

/**
 * How much of a note is its release, as a fraction of its length.
 *
 * Longer than the attack, because that is the asymmetry every sung note has and it
 * is the one that is audible — and here, visible — when it is missing.
 */
export const RELEASE_FRACTION = 0.22;

/**
 * How far into a note the voice has got, as a weight in [0, 1].
 *
 * Attack, sustain, release, with a flat top in the middle. Written as a function of
 * a fraction rather than of seconds so it does not need the tempo, the score, or
 * anything else this file knows — which is what lets `voiceAt` be tested against it
 * rather than around it.
 *
 * @param through Where in the note the clock is, in [0, 1]. Outside that range the
 *   note is not sounding and the answer is 0, which is the right answer and not a
 *   guard: a caller asking about a note it has left should be told there is nothing
 *   there.
 * @returns The envelope weight. 0 at both ends, exactly 1 across the sustain, and
 *   monotone on each ramp.
 */
export function envelopeAt(through: number): number {
  if (!Number.isFinite(through) || through <= 0 || through >= 1) {
    return 0;
  }
  if (through < ATTACK_FRACTION) {
    return through / ATTACK_FRACTION;
  }
  if (through > 1 - RELEASE_FRACTION) {
    return (1 - through) / RELEASE_FRACTION;
  }
  return 1;
}

/** Middle C, in hertz. Everything in the score is an interval from here. */
const MIDDLE_C_HZ = 261.6255653005986;

/**
 * How many harmonics of the fundamental are worth summing.
 *
 * Thirty-two puts the top of a low D's series past the ceiling of the highest band,
 * so nothing a voice actually radiates falls off the end of the model. Above that
 * the terms are contributing less than the eventual quantisation of the uniform.
 */
const HARMONICS = 32;

/**
 * The three resonances that make a vowel sound like a vowel, as centre frequency,
 * bandwidth and gain.
 *
 * A voice is not a harmonic series — it is a harmonic series poured through a tube
 * with lumps in it, and these are the lumps. The first two are roughly an open
 * vowel's first and second formants for a high voice; the third is the singer's
 * formant, the cluster around three kilohertz that is the entire reason an unamplified
 * soprano can be heard over an orchestra and the reason a sung note and a played one
 * with the same pitch do not look alike in a spectrum.
 *
 * Without the third the bands are a tidy falling ramp at every pitch, the top two
 * never move, and the geometry driven by them never does either.
 */
const FORMANTS: ReadonlyArray<readonly [number, number, number]> = [
  [720, 130, 1],
  [1240, 190, 0.72],
  [2900, 260, 0.46],
];

/**
 * Which band a frequency lands in.
 *
 * Logarithmic, because pitch is: linear bins put six of the eight bands above the
 * top of the stave, where a voice has almost nothing, and squash everything a
 * listener would call the note into the first one. This is also what an FFT would be
 * binned by for this purpose, which is the point — see the file comment on the seam.
 *
 * @param hz The frequency.
 * @returns The band index, or −1 for anything outside [`BAND_FLOOR_HZ`,
 *   `BAND_CEILING_HZ`], which the caller drops rather than clamping into an edge
 *   band it does not belong to.
 */
function bandOf(hz: number): number {
  if (!(hz >= BAND_FLOOR_HZ) || hz >= BAND_CEILING_HZ) {
    return -1;
  }
  const decades = Math.log(hz / BAND_FLOOR_HZ) / Math.log(BAND_CEILING_HZ / BAND_FLOOR_HZ);
  return Math.min(VOICE_BANDS - 1, Math.floor(decades * VOICE_BANDS));
}

/**
 * The shape of the voice's spectrum on one note, normalised so its loudest band is
 * exactly 1.
 *
 * Shape only — how *much* of it there is belongs to `voiceAt`, which multiplies this
 * by the envelope and the dynamic. Splitting it that way is what makes a held note's
 * timbre constant while its level moves, which is what a held note does.
 *
 * @param semitones Semitones from middle C.
 * @param dynamic How hard it is being sung, in [0, 1]. Tilts the harmonic rolloff:
 *   a note sung harder is brighter as well as louder, which is a real property of a
 *   voice and is most of why a climax looks different here and not merely bigger.
 * @returns `VOICE_BANDS` weights, low band first, the largest of them exactly 1. A
 *   pitch whose whole series falls outside the modelled range — which no note of
 *   `ARIA` does — comes back as all zeros rather than as a division by zero.
 */
export function bandsFor(semitones: number, dynamic: number): readonly number[] {
  const bands = new Array<number>(VOICE_BANDS).fill(0);

  if (!Number.isFinite(semitones) || !Number.isFinite(dynamic)) {
    return bands;
  }

  const fundamental = MIDDLE_C_HZ * Math.pow(2, semitones / 12);

  // Harder singing rolls off more slowly, so the upper harmonics survive further.
  // 1.45 down to 0.95 across the dynamic range, which is about the spread a real
  // voice covers between a marked piano and a full one.
  const rolloff = 1.45 - 0.5 * Math.min(Math.max(dynamic, 0), 1);

  for (let harmonic = 1; harmonic <= HARMONICS; harmonic += 1) {
    const hz = fundamental * harmonic;
    const band = bandOf(hz);
    if (band < 0) {
      continue;
    }

    let gain = 0;
    for (const [centre, width, weight] of FORMANTS) {
      const offset = (hz - centre) / width;
      gain += weight / (1 + offset * offset);
    }

    // Power, not amplitude — the bands are summed, and summing amplitudes would let
    // two harmonics in one band cancel arithmetic they do not cancel acoustically.
    const amplitude = (gain + 0.06) / Math.pow(harmonic, rolloff);
    bands[band] += amplitude * amplitude;
  }

  const loudest = Math.max(...bands);
  if (loudest <= 0) {
    return bands;
  }

  // Back to amplitude, and normalised. The square root is not undoing the line
  // above: the sum happened in power, which is where sums belong, and what comes out
  // is the band's amplitude, which is what a geometry displacement wants to be
  // proportional to.
  return bands.map((band) => Math.sqrt(band / loudest));
}

/**
 * What the voice is doing at a given second of the room's clock.
 *
 * The floor's rule, and the seam the `AnalyserNode` will eventually be plugged into
 * — see the file comment. Everything the Box moves is driven by this and nothing
 * else, so a room that has stopped moving has stopped here.
 *
 * @param seconds The room's clock — `IFrame.simulatedSeconds`, not
 *   `performance.now()`. The aria repeats every `ARIA_SECONDS`, so any second is a
 *   second of it, including a negative one. Non-finite input reads as silence, for
 *   the reason every guard in this piece exists: a `NaN` here becomes a `NaN`
 *   uniform and a `NaN` uniform is a black screen with nothing in the console.
 * @returns The voice at that instant. `bands` is `bandsFor` for the sounding note
 *   scaled by `power`; `power` is the note's `dynamic` times `envelopeAt` for how
 *   far through the note the clock is; `note` is that note's index in `ARIA`.
 *
 *   In a rest, and for a non-finite clock, the answer is `SILENT` exactly — eight
 *   zeros, zero power, and a note index of −1.
 */
export function voiceAt(seconds: number): IVoice {
  // The guard every pure function in this piece carries. A NaN here becomes a NaN
  // uniform and a NaN uniform is a black screen with nothing in the console — and
  // an aria of no length would make the wrap below a division by zero rather than
  // a silence, so both are refused in one test.
  if (!Number.isFinite(seconds) || ARIA_SECONDS <= 0) {
    return SILENT;
  }

  // Into the performance. Written with the double modulus rather than a bare `%`,
  // because JavaScript's remainder keeps the sign of its left operand: a clock of
  // −3 seconds comes back as −3 rather than as three seconds from the end, and the
  // walk below would then fall off the front of the score and report a rest. A
  // second before zero is not an error and is not silence — the aria has no
  // beginning anybody can be present for.
  const at = ((seconds % ARIA_SECONDS) + ARIA_SECONDS) % ARIA_SECONDS;

  // Walked rather than indexed, because the notes are unequal: this score is in
  // beats and the beats run 3, 1, 4, 2 and so on, so there is no division that
  // lands on the right one. One pass, accumulating where each note starts.
  let start = 0;
  for (let index = 0; index < ARIA.length; index += 1) {
    const note = ARIA[index];
    const length = note.beats * BEAT_SECONDS;

    if (at < start + length) {
      // A rest is a note with no pitch rather than a gap between notes — see INote
      // — so it is found by the same walk and answered with the same silence a bad
      // clock gets. `SILENT` itself, not a copy of it: the spec compares against
      // that object, and two different eight-zero vectors would pass the assertion
      // while quietly allocating one per frame.
      if (note.semitones === null) {
        return SILENT;
      }

      // How much voice there is: how hard the note is sung, times how far into it
      // the clock has got. The envelope is what stops the bands stepping at every
      // boundary, which reads as a bug in the geometry rather than as an onset.
      const power = note.dynamic * envelopeAt((at - start) / length);

      return {
        // Shape times level. Scaled here rather than at the seven places downstream
        // that read it, so silence is eight zeros and nothing has to remember to
        // multiply — and so a held note's timbre stays put while its level moves,
        // which is what a held note does. `dynamic` goes to bandsFor as well,
        // because a note sung harder is brighter and not merely louder.
        bands: bandsFor(note.semitones, note.dynamic).map((band) => band * power),
        power,
        note: index,
      };
    }

    start += length;
  }

  // Past the end, which the wrap above should have made unreachable and which a
  // hundred additions of `length` can reach anyway: the accumulated total is not
  // bit-identical to ARIA_SECONDS, so a clock landing in the last few nanoseconds
  // of the aria falls through. Silence is the right answer there on both counts —
  // it is the honest one for a position the walk could not place, and `ARIA` ends
  // on a rest, so it is also the correct one.
  return SILENT;
}
