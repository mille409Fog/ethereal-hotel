import { FALLBACK_LATITUDE, locationForZone, utcOffsetMinutes, ZONE_COORDINATES } from './zones';

/**
 * The zone table, checked for the two things a hand-maintained table of 150 rows
 * actually gets wrong: a typo'd coordinate, and a zone name the runtime has never
 * heard of.
 *
 * The interesting test is `agrees with each zone's own UTC offset`. A latitude
 * typo is invisible to everything — the piece will happily compute a Reykjavík
 * dawn for someone in Lagos — but a *longitude* typo contradicts a fact the
 * runtime already knows, because a zone's UTC offset is a claim about where its
 * meridian is. Cross-checking the two catches transposed digits and flipped signs
 * without a second table to disagree with.
 *
 * The 45° tolerance sounds enormous and is not: a zone is 15° wide by
 * construction, DST moves the offset by another 15°, and there are countries
 * three zones wide keeping one clock. Spain is the worst row here at ~34° in
 * summer — Madrid sits west of Greenwich and runs on Berlin time — so the check
 * is set just wide enough to admit the genuine outliers and nothing else.
 */

const ZONES = Object.entries(ZONE_COORDINATES);

/** Mid-January and mid-July, so every row is checked on both sides of DST. */
const WINTER = new Date(Date.UTC(2025, 0, 15, 12));
const SUMMER = new Date(Date.UTC(2025, 6, 15, 12));

describe('the zone table', () => {
  it('covers the zones that cover almost everyone', () => {
    // AUBADE asks for ~150. Well under that and the fallback is carrying traffic
    // it should not be; the number is a floor, not a target.
    expect(ZONES.length).toBeGreaterThanOrEqual(140);
  });

  it('holds coordinates that exist on Earth', () => {
    for (const [zone, [latitude, longitude]] of ZONES) {
      expect(Math.abs(latitude), `${zone} latitude`).toBeLessThanOrEqual(90);
      expect(Math.abs(longitude), `${zone} longitude`).toBeLessThanOrEqual(180);
    }
  });

  it('names only zones this runtime recognises', () => {
    for (const [zone] of ZONES) {
      expect(() => new Intl.DateTimeFormat('en-US', { timeZone: zone }), zone).not.toThrow();
    }
  });

  it("agrees with each zone's own UTC offset", () => {
    for (const [zone, [, longitude]] of ZONES) {
      for (const at of [WINTER, SUMMER]) {
        const meridian = utcOffsetMinutes(zone, at) / 4;
        const drift = Math.abs(((meridian - longitude + 540) % 360) - 180);
        expect(
          drift,
          `${zone}: table says ${longitude}°, its clock says ${meridian}°`
        ).toBeLessThan(45);
      }
    }
  });

  it('lists no zone twice', () => {
    const names = ZONES.map(([zone]) => zone);
    expect(new Set(names).size).toBe(names.length);
  });

  it('spans both hemispheres', () => {
    expect(ZONES.some(([, [latitude]]) => latitude < -30)).toBe(true);
    expect(ZONES.some(([, [latitude]]) => latitude > 60)).toBe(true);
  });
});

describe('utcOffsetMinutes', () => {
  it('reads a half-hour offset', () => {
    expect(utcOffsetMinutes('Asia/Kolkata', WINTER)).toBe(330);
  });

  it('reads a three-quarter-hour offset', () => {
    // Kathmandu is UTC+5:45. Anything that parses offsets as whole hours, or as
    // a float of hours, gets this one wrong.
    expect(utcOffsetMinutes('Asia/Kathmandu', WINTER)).toBe(345);
  });

  it('follows daylight saving rather than assuming a fixed offset', () => {
    expect(utcOffsetMinutes('America/New_York', WINTER)).toBe(-300);
    expect(utcOffsetMinutes('America/New_York', SUMMER)).toBe(-240);
  });

  it('follows southern-hemisphere daylight saving the other way round', () => {
    expect(utcOffsetMinutes('Australia/Sydney', WINTER)).toBe(660);
    expect(utcOffsetMinutes('Australia/Sydney', SUMMER)).toBe(600);
  });

  it('reads zero for UTC itself', () => {
    // Formatted as bare "GMT" with no offset, which is the one shape the regex
    // deliberately does not match.
    expect(utcOffsetMinutes('UTC', WINTER)).toBe(0);
  });

  it('returns zero rather than throwing on a zone the runtime does not know', () => {
    expect(utcOffsetMinutes('Mars/Olympus_Mons', WINTER)).toBe(0);
  });
});

describe('locationForZone', () => {
  it('returns table coordinates, marked precise', () => {
    expect(locationForZone('Europe/Lisbon', WINTER)).toEqual({
      latitude: 38.72,
      longitude: -9.14,
      precise: true,
    });
  });

  it('falls back to the zone meridian and 40°N, marked imprecise', () => {
    // Thimphu is UTC+6 and deliberately not in the table: 360 minutes / 4 = 90°E,
    // which is 89.6°E in reality. The latitude is a guess and says so.
    const location = locationForZone('Asia/Thimphu', WINTER);
    expect(location.precise).toBe(false);
    expect(location.latitude).toBe(FALLBACK_LATITUDE);
    expect(location.longitude).toBe(90);
  });

  it('lands an unknown zone on the prime meridian rather than nowhere', () => {
    const location = locationForZone('Mars/Olympus_Mons', WINTER);
    expect(location).toEqual({ latitude: FALLBACK_LATITUDE, longitude: 0, precise: false });
  });

  it('wraps a past-the-date-line offset into a real longitude', () => {
    // Kiritimati keeps UTC+14, which is 210° east of Greenwich — not a longitude.
    const location = locationForZone('Pacific/Kiritimati', WINTER);
    expect(location.precise).toBe(false);
    expect(location.longitude).toBe(-150);
  });

  it('moves the fallback longitude with daylight saving', () => {
    // The honest consequence of deriving a place from a clock: the fallback
    // location drifts 15° twice a year. It is why `precise` exists.
    const winter = locationForZone('Europe/Tirane', WINTER);
    const summer = locationForZone('Europe/Tirane', SUMMER);
    expect(summer.longitude - winter.longitude).toBe(15);
  });
});
