import {
  ARIA,
  ARIA_BEATS,
  ARIA_SECONDS,
  ATTACK_FRACTION,
  BAND_CEILING_HZ,
  BAND_FLOOR_HZ,
  BEAT_SECONDS,
  bandsFor,
  envelopeAt,
  RELEASE_FRACTION,
  SILENT,
  VOICE_BANDS,
  voiceAt,
} from './box';

/**
 * Floor −5's arithmetic: a score, a spectrum, and the rule that turns a second into
 * both.
 *
 * None of this can be checked by looking at the render, which is why it is worth a
 * spec of its own. A voice a semitone out looks exactly like a voice; a voice whose
 * envelope is missing looks like geometry with a bug in it rather than like an
 * onset; and an aria that does not come round again is a room that stops moving four
 * minutes after a visitor arrives, for reasons invisible from inside it.
 *
 * The `voiceAt` block below is the contract for this commit's hand-written unit. It
 * was written before the function was, which is the point of it.
 */

/** Where each note of `ARIA` starts, in seconds. */
const onsets = (): readonly number[] => {
  const starts: number[] = [];
  let beats = 0;
  for (const note of ARIA) {
    starts.push(beats * BEAT_SECONDS);
    beats += note.beats;
  }
  return starts;
};

/** The middle of note `index`, in seconds — comfortably inside its sustain. */
const middleOf = (index: number): number => {
  const start = onsets()[index];
  return start + ARIA[index].beats * BEAT_SECONDS * 0.5;
};

describe('the score', () => {
  it('is written in beats that add up to what the constants say', () => {
    const summed = ARIA.reduce((total, note) => total + note.beats, 0);
    expect(ARIA_BEATS).toBe(summed);
    expect(ARIA_SECONDS).toBeCloseTo(summed * BEAT_SECONDS, 10);
  });

  it('holds only notes that a voice could actually sing', () => {
    for (const note of ARIA) {
      expect(note.beats).toBeGreaterThan(0);
      expect(note.dynamic).toBeGreaterThanOrEqual(0);
      expect(note.dynamic).toBeLessThanOrEqual(1);

      if (note.semitones !== null) {
        // Roughly two octaves up from middle C down to an octave below it, which
        // covers every voice type and excludes a typo that put a note in the bass
        // clef of a soprano's aria.
        expect(note.semitones).toBeGreaterThanOrEqual(-12);
        expect(note.semitones).toBeLessThanOrEqual(24);
      }
    }
  });

  it('ends on a rest, so the repeat is a breath rather than a join', () => {
    // The aria loops. Without a rest at the end, the last note's release runs
    // straight into the first note's attack and the house lurches once every
    // `ARIA_SECONDS` — a periodic glitch, which is the hardest kind to attribute.
    expect(ARIA[ARIA.length - 1].semitones).toBeNull();
  });
});

describe('the envelope', () => {
  it('is silent at both ends of a note and outside it', () => {
    expect(envelopeAt(0)).toBe(0);
    expect(envelopeAt(1)).toBe(0);
    expect(envelopeAt(-0.2)).toBe(0);
    expect(envelopeAt(1.4)).toBe(0);
    expect(envelopeAt(NaN)).toBe(0);
  });

  it('is exactly 1 across the sustain', () => {
    expect(envelopeAt(ATTACK_FRACTION)).toBe(1);
    expect(envelopeAt(0.5)).toBe(1);
    expect(envelopeAt(1 - RELEASE_FRACTION)).toBe(1);
  });

  it('rises then falls, and takes longer to fall', () => {
    expect(envelopeAt(ATTACK_FRACTION / 2)).toBeCloseTo(0.5, 10);
    expect(envelopeAt(1 - RELEASE_FRACTION / 2)).toBeCloseTo(0.5, 10);
    // The asymmetry a sung note actually has.
    expect(RELEASE_FRACTION).toBeGreaterThan(ATTACK_FRACTION);
  });
});

describe('the spectrum', () => {
  it('returns one weight per band, peaking at exactly 1', () => {
    const bands = bandsFor(9, 0.5);
    expect(bands).toHaveLength(VOICE_BANDS);
    expect(Math.max(...bands)).toBe(1);
    for (const band of bands) {
      expect(band).toBeGreaterThanOrEqual(0);
      expect(band).toBeLessThanOrEqual(1);
    }
  });

  it('moves its energy up as the pitch rises', () => {
    // The centre of mass of the spectrum, in band indices. A higher note puts its
    // fundamental and its whole series further up, so this has to rise — and if it
    // does not, the bands are describing something that is not the pitch.
    const centroid = (semitones: number): number => {
      const bands = bandsFor(semitones, 0.5);
      const total = bands.reduce((sum, band) => sum + band, 0);
      return bands.reduce((sum, band, index) => sum + band * index, 0) / total;
    };

    expect(centroid(2)).toBeLessThan(centroid(14));
    expect(centroid(-5)).toBeLessThan(centroid(2));
  });

  it('is brighter when the note is sung harder', () => {
    // A voice pushed harder rolls off more slowly, so the upper half of the
    // spectrum carries more of the total. This is the whole reason `dynamic` is an
    // argument rather than a multiplier applied afterwards.
    const upperShare = (dynamic: number): number => {
      const bands = bandsFor(9, dynamic);
      const total = bands.reduce((sum, band) => sum + band, 0);
      const upper = bands.slice(VOICE_BANDS / 2).reduce((sum, band) => sum + band, 0);
      return upper / total;
    };

    expect(upperShare(0.9)).toBeGreaterThan(upperShare(0.25));
  });

  it('keeps the singer’s formant visible at every pitch in the score', () => {
    // The band containing 2.9 kHz is never empty, whatever is being sung. Without
    // the third formant the top bands are dead at low pitches and the geometry they
    // drive stops moving through the bottom half of the aria — which reads as the
    // room responding only to high notes, a thing no room does.
    const singersBand = Math.floor(
      (Math.log(2900 / BAND_FLOOR_HZ) / Math.log(BAND_CEILING_HZ / BAND_FLOOR_HZ)) * VOICE_BANDS
    );

    for (const note of ARIA) {
      if (note.semitones === null) continue;
      expect(bandsFor(note.semitones, note.dynamic)[singersBand]).toBeGreaterThan(0);
    }
  });

  it('answers a broken pitch with silence rather than a NaN', () => {
    expect(bandsFor(NaN, 0.5).every((band) => band === 0)).toBe(true);
    expect(bandsFor(9, NaN).every((band) => band === 0)).toBe(true);
  });
});

/**
 * The floor's rule. This is the block that judges the hand-written unit.
 *
 * Everything the Box moves is driven by `voiceAt` and nothing else, so each of these
 * is a way the room fails that no rendered frame would report.
 */
describe('the voice', () => {
  it('sings the note the score says, at the second the score says', () => {
    const starts = onsets();

    ARIA.forEach((note, index) => {
      const voice = voiceAt(middleOf(index));

      if (note.semitones === null) {
        expect(voice.note).toBe(-1);
        expect(voice.power).toBe(0);
        return;
      }

      expect(voice.note).toBe(index);
      // Mid-note is inside the sustain for every note in this score, so the envelope
      // is exactly 1 and the power is the dynamic untouched.
      expect(voice.power).toBeCloseTo(note.dynamic, 10);
      expect(starts[index]).toBeLessThanOrEqual(middleOf(index));
    });
  });

  it('gives back the spectrum of that note, scaled by how much of it there is', () => {
    const index = ARIA.findIndex((note) => note.semitones !== null);
    const note = ARIA[index];
    const at = middleOf(index);
    const voice = voiceAt(at);
    const shape = bandsFor(note.semitones as number, note.dynamic);

    expect(voice.bands).toHaveLength(VOICE_BANDS);
    // Asserted before the comparison below, which would otherwise be satisfied by a
    // voice that returns zeros: `0` is `shape[slot] * 0` for every slot.
    expect(voice.power).toBeGreaterThan(0);
    expect(Math.max(...voice.bands)).toBeCloseTo(voice.power, 10);
    voice.bands.forEach((band, slot) => {
      expect(band).toBeCloseTo(shape[slot] * voice.power, 10);
    });
  });

  it('is exactly silent through a rest', () => {
    const index = ARIA.findIndex((note) => note.semitones === null);
    const voice = voiceAt(middleOf(index));

    expect(voice).toEqual(SILENT);
    expect(voice.note).toBe(-1);
    expect(voice.bands.every((band) => band === 0)).toBe(true);
  });

  it('fades in and out of every note rather than switching', () => {
    // The envelope, seen from outside. A note's power at its very start and very end
    // must be below its power in the middle — otherwise the bands step at each
    // boundary and the house jolts once a note.
    const index = ARIA.findIndex((note) => note.semitones !== null && note.beats >= 3);
    const start = onsets()[index];
    const length = ARIA[index].beats * BEAT_SECONDS;

    const onset = voiceAt(start + length * 0.01).power;
    const sustain = voiceAt(start + length * 0.5).power;
    const tail = voiceAt(start + length * 0.99).power;

    expect(onset).toBeGreaterThan(0);
    expect(onset).toBeLessThan(sustain);
    expect(tail).toBeGreaterThan(0);
    expect(tail).toBeLessThan(sustain);
  });

  it('comes round again, exactly', () => {
    // The aria repeats, so a second and that second one aria later are the same
    // instant of the performance. A score that ran out would be a room that stopped
    // moving, and a modulus that drifted would be one that slowly went out of time
    // with itself.
    // At least one of these has to land on a note, or the whole block is four
    // comparisons between rests.
    expect([0.4, 7.3, 19.02, 31.75].some((at) => voiceAt(at).power > 0)).toBe(true);

    for (const at of [0.4, 7.3, 19.02, 31.75]) {
      const once = voiceAt(at);
      const twice = voiceAt(at + ARIA_SECONDS);
      const thrice = voiceAt(at + ARIA_SECONDS * 4);

      expect(twice.note).toBe(once.note);
      expect(twice.power).toBeCloseTo(once.power, 10);
      expect(thrice.note).toBe(once.note);
      expect(thrice.power).toBeCloseTo(once.power, 10);
    }
  });

  it('reads a clock from before the performance as part of it', () => {
    // Negative seconds are not an error and are not silence. The room's clock starts
    // where it starts and the aria has no beginning a visitor can be present for, so
    // a second before zero is simply a second of the loop.
    // One aria before the middle of note 2, which is negative and is that note.
    const at = middleOf(2) - ARIA_SECONDS;
    expect(at).toBeLessThan(0);

    const before = voiceAt(at);
    expect(before.note).toBe(2);
    expect(before.power).toBeGreaterThan(0);
    expect(before.power).toBeCloseTo(voiceAt(middleOf(2)).power, 10);
  });

  it('never hands the shader a number it cannot use', () => {
    for (let step = 0; step <= 600; step += 1) {
      const voice = voiceAt(step * 0.11);

      expect(Number.isFinite(voice.power)).toBe(true);
      expect(voice.power).toBeGreaterThanOrEqual(0);
      expect(voice.power).toBeLessThanOrEqual(1);
      expect(voice.bands).toHaveLength(VOICE_BANDS);

      for (const band of voice.bands) {
        expect(Number.isFinite(band)).toBe(true);
        expect(band).toBeGreaterThanOrEqual(0);
        expect(band).toBeLessThanOrEqual(1);
      }

      expect(voice.note).toBeGreaterThanOrEqual(-1);
      expect(voice.note).toBeLessThan(ARIA.length);
    }
  });

  it('answers a broken clock with silence', () => {
    // The guard every pure function in this piece carries. A NaN here becomes a NaN
    // uniform, and a NaN uniform is a black screen with nothing in the console.
    expect(voiceAt(NaN)).toEqual(SILENT);
    expect(voiceAt(Infinity)).toEqual(SILENT);
    expect(voiceAt(-Infinity)).toEqual(SILENT);
  });
});
