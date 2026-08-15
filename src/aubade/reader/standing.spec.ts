import { readClock, type IAubadeClock } from '../solar';
import { describeNextChange, describePlace, describeStanding, describeSun } from './standing';

/**
 * The standing: the only part of the Reader’s Edition the sun moves.
 *
 * Every clock here is built by `readClock` at a pinned instant and zone rather
 * than assembled by hand, for the reason `solar/` was shipped before any pixels:
 * the astronomy is the risk in this project, and a test that fabricates an
 * `IAubadeClock` proves the sentence formats and nothing about whether the
 * numbers in it could occur. These are real readings of the real sun at real
 * places, and the assertions are on what the page says about them.
 *
 * The instants are chosen for what they are, not for convenience:
 *
 * - Reykjavík on the solstice, at two in the morning: the sun is forty-nine
 *   degrees under, and will not come up for another nine hours.
 * - Sydney in January is the daylight case, in the other hemisphere, so a
 *   latitude rendered "north" would show up here and nowhere else.
 * - Longyearbyen in June is polar day: the sun does not set, and the next
 *   sunset is two months out rather than absent.
 */

/** A reading of the real sun, at a pinned instant, in a pinned zone. */
const at = (iso: string, zone: string): IAubadeClock => readClock(new Date(iso), zone);

/** Deep in the solstice night at 64°N, nine hours before the sun comes up. */
const REYKJAVIK_NIGHT = at('2025-12-21T02:00:00Z', 'Atlantic/Reykjavik');

/** High summer in the southern hemisphere, early afternoon. */
const SYDNEY_DAY = at('2026-01-15T03:00:00Z', 'Australia/Sydney');

/** Polar day at 78°N: the sun is up and stays up for weeks. */
const LONGYEARBYEN_MIDSUMMER = at('2026-06-21T12:00:00Z', 'Arctic/Longyearbyen');

describe('the hotel’s standing', () => {
  describe('where the sun was computed for', () => {
    it('names the zone and the point it resolved to', () => {
      const place = describePlace(SYDNEY_DAY);

      expect(place).toContain('Australia/Sydney');
      expect(place).toContain('degrees south');
      expect(place).toContain('degrees east');
    });

    it('gets the hemisphere from the sign, not from the hemisphere it was written in', () => {
      expect(describePlace(REYKJAVIK_NIGHT)).toContain('degrees north');
      expect(describePlace(REYKJAVIK_NIGHT)).toContain('degrees west');
    });

    it('says when the location is a guess rather than a lookup', () => {
      // An unlisted zone: longitude from the UTC offset, latitude assumed. The
      // piece's claim is that it tells the truth about the sun where you are,
      // and a claim like that is worth what its worst-case disclosure is worth.
      const unlisted = at('2026-03-01T12:00:00Z', 'Etc/GMT-3');

      expect(unlisted.location.precise).toBe(false);
      expect(describePlace(unlisted)).toContain('not in this hotel’s table');
      expect(describePlace(unlisted)).toContain('guess');
    });

    it('spells out "degrees", because a screen reader is the audience here', () => {
      // `°` is read inconsistently across engines, and this route exists partly
      // for the people who will hear it rather than see it.
      expect(describePlace(SYDNEY_DAY)).not.toContain('°');
      expect(describeSun(SYDNEY_DAY)).not.toContain('°');
    });
  });

  describe('where the sun is', () => {
    it('puts a sun below the horizon below it, and says what that makes the hotel', () => {
      const sun = describeSun(REYKJAVIK_NIGHT);

      expect(REYKJAVIK_NIGHT.state).toBe('open');
      expect(sun).toContain('degrees below that horizon');
      expect(sun).toContain('astronomical night');
      expect(sun).toContain('the hotel is open');
    });

    it('puts a sun above the horizon above it', () => {
      const sun = describeSun(SYDNEY_DAY);

      expect(SYDNEY_DAY.state).toBe('shuttered');
      expect(sun).toContain('degrees above that horizon');
      expect(sun).toContain('the hotel is shut');
    });

    it('gives the elevation to a tenth of a degree and no further', () => {
      // Two decimals of latitude is about a kilometre and is already generous
      // against a location derived from a time zone; a tenth of a degree of
      // elevation is the matching claim. More digits would be a lie about both.
      const match = /(\d+\.\d+) degrees/.exec(describeSun(SYDNEY_DAY));

      expect(match).not.toBeNull();
      expect(match?.[1].split('.')[1]).toHaveLength(1);
    });
  });

  describe('what changes next', () => {
    it('counts a shut hotel down to sunset, and says the doors open later still', () => {
      // The daytime visitor's whole question. The countdown is to the sun
      // going down, because that is the number they can check against a
      // weather app; the doors open at astronomical twilight, an hour or more
      // after, and saying so is both accurate and the most vampiric fact about
      // the place.
      const next = describeNextChange(SYDNEY_DAY);

      expect(next).toContain('The sun goes down in ');
      expect(next).toContain('the hotel opens a while after that');
      expect(next).not.toContain('comes up');
    });

    it('counts an open hotel down to sunrise instead', () => {
      const next = describeNextChange(REYKJAVIK_NIGHT);

      expect(next).toContain('The sun comes up in ');
      expect(next).toContain('the hotel shuts');
      expect(next).not.toContain('goes down');
    });

    it('faces the sunrise at every hour that is not daylight', () => {
      // Four of the five states are the hotel waiting on the sun to arrive, and
      // the branch is on `shuttered` alone rather than on a list — a rule
      // written as a list acquires a hole the first time a state is added.
      const hours = [
        at('2026-03-20T02:00:00Z', 'Europe/London'),
        at('2026-03-20T04:30:00Z', 'Europe/London'),
        at('2026-03-20T05:15:00Z', 'Europe/London'),
        at('2026-03-20T05:45:00Z', 'Europe/London'),
      ];

      for (const clock of hours) {
        expect(clock.state).not.toBe('shuttered');
        expect(describeNextChange(clock)).toContain('The sun comes up');
      }
    });

    it('counts in days where the next sunset is two months out', () => {
      // Polar day at 78°N. `readClock` searches forward 400 days and finds a
      // sunset in August, so this is a real number rather than an absence, and
      // "the sun goes down in 62 days" is the single most vampiric sentence
      // this hotel is capable of printing.
      expect(LONGYEARBYEN_MIDSUMMER.state).toBe('shuttered');
      expect(LONGYEARBYEN_MIDSUMMER.nextSet).not.toBeNull();

      const next = describeNextChange(LONGYEARBYEN_MIDSUMMER);

      expect(next).toMatch(/The sun goes down in \d+ days/);
      expect(next).toContain('the hotel opens a while after that');
    });

    it('says something in the same voice when there is nothing to count to', () => {
      // Defensive rather than reachable: there is nowhere on Earth the sun
      // fails to cross the horizon inside the 400-day search. A sentence is
      // cheaper than a blank line, and it must not read as an error.
      const nothingComing = { ...SYDNEY_DAY, nextSet: null, nextRise: null };

      expect(describeNextChange(nothingComing)).toContain('past the end of this hotel’s');
      expect(describeNextChange({ ...REYKJAVIK_NIGHT, nextRise: null })).toContain(
        'past the end of this hotel’s'
      );
    });

    it('finishes a sentence, every time', () => {
      // It is printed as a paragraph, not as a field, so it has to end.
      for (const clock of [REYKJAVIK_NIGHT, SYDNEY_DAY, LONGYEARBYEN_MIDSUMMER]) {
        expect(describeNextChange(clock)).toMatch(/\.$/);
      }
    });
  });

  describe('all three together', () => {
    it('is the place, the sun, and what happens next', () => {
      const standing = describeStanding(SYDNEY_DAY);

      expect(standing.place).toBe(describePlace(SYDNEY_DAY));
      expect(standing.sun).toBe(describeSun(SYDNEY_DAY));
      expect(standing.next).toBe(describeNextChange(SYDNEY_DAY));
    });

    it('states no wall-clock time anywhere', () => {
      // The rule `desk.ts` keeps and this file inherits: "three in the morning"
      // is a lie to a visitor in a Norwegian summer, and the piece's claim is
      // that it tells the truth about the sun where you are.
      for (const clock of [REYKJAVIK_NIGHT, SYDNEY_DAY, LONGYEARBYEN_MIDSUMMER]) {
        const standing = describeStanding(clock);
        const everything = `${standing.place} ${standing.sun} ${standing.next}`;

        expect(everything).not.toMatch(/\d{1,2}:\d{2}/);
      }
    });
  });
});
