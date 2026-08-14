import { AUBADE_STATES } from './solar/state';
import { DESK_COPY, INVITATION, describeCountdown, formatClockTime } from './desk';

/**
 * What the hotel says.
 *
 * Copy is not usually worth a test, and most of this file is not testing prose —
 * it is testing that there is prose for every hour, which is the failure that
 * actually happens: a sixth state, or a renamed one, leaves a template rendering
 * `undefined` at the one moment somebody is looking at it.
 *
 * `describeCountdown` is the exception. It is a small pile of boundaries — a
 * missing sunset, an elapsed one, singular and plural, the hour mark, the day
 * mark — and every one of them is a sentence a visitor reads.
 */

describe('the desk', () => {
  describe('its copy', () => {
    it('has a line for every hour of the sun', () => {
      // The template indexes this by state. A missing entry is `undefined`
      // rendered on the plate.
      for (const state of AUBADE_STATES) {
        expect(DESK_COPY[state]?.plate).toBeTruthy();
        expect(DESK_COPY[state]?.picture).toBeTruthy();
        expect(DESK_COPY[state]?.opening).toBeTruthy();
      }
    });

    it('never states a clock time, because the sun does not keep one', () => {
      // "Three in the morning" is a lie to a visitor in a Norwegian summer, and
      // the piece's whole claim is that it tells the truth about the sun where
      // you are.
      for (const state of AUBADE_STATES) {
        const copy = DESK_COPY[state];
        for (const line of [copy.plate, copy.picture, copy.opening]) {
          expect(line).not.toMatch(/\b\d{1,2}[:.]\d{2}\b/);
          expect(line).not.toMatch(/\b(?:o'clock|a\.m\.|p\.m\.)\b/i);
        }
      }
    });

    it('describes a picture rather than a canvas, for every hour', () => {
      // To assistive technology the render is one picture. The day and the night
      // are different pictures, and an alt text describing moonlight to somebody
      // looking at a shuttered room is worse than none.
      expect(DESK_COPY.open.picture).toContain('Moonlight');
      expect(DESK_COPY.shuttered.picture).toContain('shutter');
      expect(DESK_COPY.shuttered.picture).not.toContain('Moonlight');
    });

    it('offers the invitation in AUBADE’s own words', () => {
      // Specified in AUBADE.md, quoted rather than rewritten.
      expect(INVITATION.offer).toBe(
        'The night rooms can be opened for you. They will not be the same.'
      );
    });

    it('says where the mark is, once the invitation is taken', () => {
      // A faint permanent marker nobody knows to look for is decoration.
      expect(INVITATION.taken).toMatch(/under the door/);
    });
  });

  describe('formatClockTime', () => {
    const at = new Date('2026-08-14T18:14:00Z');

    it('shows the time in the zone the sun was computed for', () => {
      // 18:14 UTC is 19:14 in Lisbon in August (WEST, UTC+1), and the visitor is
      // meant to be able to check this against the clock on their own wall.
      // Either notation, because the locale decides and this must not be forced
      // to 24-hour for the benefit of a test.
      expect(formatClockTime(at, 'Europe/Lisbon')).toMatch(/(^|\D)(19:14|7:14)(\D|$)/);
    });

    it('falls back rather than throwing on a zone Intl will not take', () => {
      // The zone can arrive from `?tz=`, and the zone table deliberately accepts
      // what it does not recognise.
      expect(() => formatClockTime(at, 'Mars/Olympus')).not.toThrow();
      expect(formatClockTime(at, 'Mars/Olympus')).toMatch(/\d/);
    });
  });

  describe('describeCountdown', () => {
    const now = new Date('2026-08-14T12:00:00Z');
    const inFuture = (minutes: number): Date => new Date(now.getTime() + minutes * 60_000);

    it('finishes the sentence the card starts', () => {
      // The card supplies the first half and a full stop — `The sun goes down
      // ${…}.` — so no branch may return something that cannot be read into it,
      // and none may bring its own punctuation.
      const phrases = [
        describeCountdown(now, null),
        describeCountdown(now, inFuture(-5)),
        describeCountdown(now, inFuture(0.2)),
        describeCountdown(now, inFuture(43)),
        describeCountdown(now, inFuture(252)),
        describeCountdown(now, inFuture(60 * 24 * 6)),
      ];

      for (const phrase of phrases) {
        expect(phrase).not.toMatch(/^\s|\s$/);
        expect(phrase).not.toMatch(/[.!]$/);
        expect(phrase.length).toBeGreaterThan(0);
      }
    });

    it('answers the polar case in its own sentence', () => {
      // Not a defect: above the Arctic Circle the sun does not set for months,
      // and `readClock` gives up after 400 days rather than pretending. It reads
      // into "The sun will not set …" rather than "The sun goes down …", because
      // it is answering a different question — and the version that shared the
      // first frame produced "the sun goes down not before the turn of the
      // season", which is not a sentence anybody has said out loud.
      expect(describeCountdown(now, null)).toBe('until the turn of the season');
      expect(`The sun will not set ${describeCountdown(now, null)}.`).toBe(
        'The sun will not set until the turn of the season.'
      );
    });

    it('treats a crossing that has already happened as imminent', () => {
      // The card is redrawn twice a minute, so the instant it counts to can slip
      // into the past between one draw and the next.
      expect(describeCountdown(now, inFuture(-5))).toBe('any moment now');
      expect(describeCountdown(now, now)).toBe('any moment now');
    });

    it('does not count seconds', () => {
      // A ticking number turns a piece of set dressing into a stopwatch.
      expect(describeCountdown(now, inFuture(0.5))).toBe('in under a minute');
    });

    it('counts minutes, and knows when there is one', () => {
      expect(describeCountdown(now, inFuture(1))).toBe('in 1 minute');
      expect(describeCountdown(now, inFuture(43))).toBe('in 43 minutes');
      expect(describeCountdown(now, inFuture(59))).toBe('in 59 minutes');
    });

    it('counts hours once there is one, and drops a zero remainder', () => {
      expect(describeCountdown(now, inFuture(60))).toBe('in 1 hour');
      expect(describeCountdown(now, inFuture(120))).toBe('in 2 hours');
      expect(describeCountdown(now, inFuture(252))).toBe('in 4 hours and 12 minutes');
      expect(describeCountdown(now, inFuture(61))).toBe('in 1 hour and 1 minute');
    });

    it('counts days once there is one, and stops counting hours', () => {
      // Only reachable at high latitude, where the next sunset is genuinely days
      // out. "in 143 hours" is a number nobody can picture.
      expect(describeCountdown(now, inFuture(60 * 24))).toBe('in 1 day');
      expect(describeCountdown(now, inFuture(60 * 24 * 6 + 30))).toBe('in 6 days');
    });

    it('rounds down rather than to nearest, at every scale', () => {
      // A card that says "in 4 hours" when there are 3 hours 59 minutes left is
      // reporting a time that has not arrived. Down is the safe direction: it
      // never promises the sun sooner than it comes.
      expect(describeCountdown(now, inFuture(119))).toBe('in 1 hour and 59 minutes');
      expect(describeCountdown(now, inFuture(60 * 48 - 1))).toBe('in 1 day');
    });
  });
});
