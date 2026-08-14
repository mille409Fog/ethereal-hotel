import {
  equationOfTime,
  hourAngleForElevation,
  julianCentury,
  julianDay,
  solarDeclination,
  solarElevation,
  solarEvents,
} from './solar-position';

/**
 * The astronomy, checked against an almanac rather than against itself.
 *
 * AUBADE's clock phase asked for eight cities across latitudes and hemispheres, within
 * two minutes of published times, and names Reykjavík in June and Singapore as
 * the two that break naive implementations. Both are here, and both break things
 * for reasons worth stating:
 *
 *   - **Reykjavík, 21 June.** The sun sets at 00:04 — on the 22nd. An
 *     implementation that returns a time-of-day instead of an instant, or that
 *     clamps the result into the requested calendar day, gets this wrong by a day
 *     while looking plausible. It is also four minutes from never setting at all:
 *     at 64.15°N the solstice sun bottoms out around −2.4°, so the whole event
 *     survives on the difference between the −0.833° sunrise definition and 0°.
 *   - **Singapore, equinox.** Sunrise is at 07:09 local, not 06:00. On the equator
 *     at equinox the day is twelve hours, so anything that computes a *day length*
 *     correctly still lands an hour off unless the equation of time and the city's
 *     offset from its zone meridian are both in. Singapore keeps UTC+8 at 103.8°E,
 *     an hour east of where its clock says it is, and that is the whole error.
 *
 * Reference data: the US Naval Observatory's rise/set/transit service,
 * `https://aa.usno.navy.mil/api/rstt/oneday`, queried per row below. Times are as
 * published — local, to the minute — and converted to instants here rather than
 * in the table, so the table stays copy-comparable against the source.
 *
 * The two-minute tolerance is the NOAA approximations' own accuracy, not slack:
 * ~1 minute between ±72° latitude and worse beyond, because near the poles the
 * sun crosses the horizon at a shallow angle and a small elevation error becomes
 * a large time error. Ushuaia at 54.8°S and Anchorage at 61.2°N are in the table
 * to keep that end of the range honest.
 */

interface IAlmanacRow {
  readonly city: string;
  readonly latitude: number;
  readonly longitude: number;

  /** Local calendar date: year, month index (0-based), day. */
  readonly date: readonly [number, number, number];

  /** Minutes the published local times run ahead of UTC. */
  readonly offsetMinutes: number;

  /** Published local sunrise, `HH:MM`. */
  readonly rise: string;

  /** Published local sunset, `HH:MM`. */
  readonly set: string;

  /** Published local upper transit, `HH:MM`. Omitted where the source gave none. */
  readonly noon?: string;

  /** Days to add to `date` for the sunset, when it falls after local midnight. */
  readonly setsNextDay?: true;
}

const ALMANAC: readonly IAlmanacRow[] = [
  // Arctic-adjacent, midsummer. The set lands on the 22nd; see the note above.
  {
    city: 'Reykjavík',
    latitude: 64.15,
    longitude: -21.94,
    date: [2025, 5, 21],
    offsetMinutes: 0,
    rise: '02:55',
    set: '00:04',
    noon: '13:30',
    setsNextDay: true,
  },
  // Equator, equinox. Twelve hours of day, an hour east of its own clock.
  {
    city: 'Singapore',
    latitude: 1.35,
    longitude: 103.82,
    date: [2025, 2, 20],
    offsetMinutes: 480,
    rise: '07:09',
    set: '19:15',
  },
  // Southern midsummer, and a rise that falls on the previous UTC day.
  {
    city: 'Sydney',
    latitude: -33.87,
    longitude: 151.21,
    date: [2025, 11, 21],
    offsetMinutes: 660,
    rise: '05:41',
    set: '20:06',
    noon: '12:53',
  },
  // Sub-Antarctic midwinter: seven hours of daylight at 54.8°S.
  {
    city: 'Ushuaia',
    latitude: -54.8,
    longitude: -68.3,
    date: [2025, 5, 21],
    offsetMinutes: -180,
    rise: '09:59',
    set: '17:11',
    noon: '13:35',
  },
  // Northern midwinter at a latitude most of the audience lives near.
  {
    city: 'London',
    latitude: 51.51,
    longitude: -0.13,
    date: [2025, 11, 21],
    offsetMinutes: 0,
    rise: '08:04',
    set: '15:54',
    noon: '11:59',
  },
  // On the equator at the September equinox — the null hypothesis of the set.
  {
    city: 'Quito',
    latitude: -0.18,
    longitude: -78.47,
    date: [2025, 8, 22],
    offsetMinutes: -300,
    rise: '06:03',
    set: '18:10',
    noon: '12:06',
  },
  // High northern latitude away from a solstice, where the day length is moving fastest.
  {
    city: 'Anchorage',
    latitude: 61.22,
    longitude: -149.9,
    date: [2025, 8, 22],
    offsetMinutes: -480,
    rise: '07:45',
    set: '19:58',
    noon: '13:52',
  },
  // Southern hemisphere, March equinox, and a longitude well east of Greenwich.
  {
    city: 'Cape Town',
    latitude: -33.92,
    longitude: 18.42,
    date: [2025, 2, 20],
    offsetMinutes: 120,
    rise: '06:50',
    set: '18:57',
    noon: '12:54',
  },
];

const TOLERANCE_MINUTES = 2;

/** A published local `HH:MM` on a row's date, as an absolute instant. */
function published(row: IAlmanacRow, time: string, dayOffset = 0): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const [year, month, day] = row.date;
  return new Date(
    Date.UTC(year, month, day + dayOffset, hours, minutes) - row.offsetMinutes * 60_000
  );
}

/** Minutes between two instants, signed, for a failure message worth reading. */
function minutesApart(actual: Date, expected: Date): number {
  return (actual.getTime() - expected.getTime()) / 60_000;
}

function expectWithinTolerance(actual: Date | null, expected: Date, label: string): void {
  expect(actual, `${label}: got no event at all`).not.toBeNull();
  const drift = minutesApart(actual as Date, expected);
  expect(
    Math.abs(drift),
    `${label}: ${(actual as Date).toISOString()} vs published ${expected.toISOString()} ` +
      `(${drift.toFixed(1)} min)`
  ).toBeLessThanOrEqual(TOLERANCE_MINUTES);
}

describe('solar position', () => {
  describe('against the USNO almanac', () => {
    for (const row of ALMANAC) {
      const [year, month, day] = row.date;
      const localDate = new Date(Date.UTC(year, month, day));

      it(`matches published sunrise and sunset for ${row.city}`, () => {
        const events = solarEvents(localDate, row.latitude, row.longitude);

        expectWithinTolerance(events.rise, published(row, row.rise), `${row.city} sunrise`);
        expectWithinTolerance(
          events.set,
          published(row, row.set, row.setsNextDay === true ? 1 : 0),
          `${row.city} sunset`
        );
      });

      if (row.noon !== undefined) {
        it(`matches published solar noon for ${row.city}`, () => {
          const events = solarEvents(localDate, row.latitude, row.longitude);
          expectWithinTolerance(
            events.noon,
            published(row, row.noon as string),
            `${row.city} noon`
          );
        });
      }
    }

    it('covers both hemispheres and the full range of latitudes', () => {
      // The DoD asks for eight cities across latitudes and hemispheres. Asserting
      // it here stops the set being quietly narrowed to eight comfortable ones.
      expect(ALMANAC).toHaveLength(8);
      expect(ALMANAC.some((row) => row.latitude > 60)).toBe(true);
      expect(ALMANAC.some((row) => row.latitude < -50)).toBe(true);
      expect(ALMANAC.some((row) => Math.abs(row.latitude) < 2)).toBe(true);
      expect(ALMANAC.some((row) => row.longitude > 100)).toBe(true);
      expect(ALMANAC.some((row) => row.longitude < -100)).toBe(true);
    });
  });

  describe('polar day and polar night', () => {
    // Longyearbyen, Svalbard. USNO reports "Object continuously above the
    // Horizon" on 21 June and "continuously below" on 21 December.
    const latitude = 78.22;
    const longitude = 15.63;

    it('reports no sunrise or sunset under the midnight sun', () => {
      const events = solarEvents(new Date(Date.UTC(2025, 5, 21)), latitude, longitude);
      expect(events.rise).toBeNull();
      expect(events.set).toBeNull();
    });

    it('reports no sunrise or sunset through polar night', () => {
      const events = solarEvents(new Date(Date.UTC(2025, 11, 21)), latitude, longitude);
      expect(events.rise).toBeNull();
      expect(events.set).toBeNull();
    });

    it('still gives a solar noon on a day with no sunrise', () => {
      // The sun has a highest point every day, even when that point is below the
      // horizon. Losing this would leave the polar states with no clock at all.
      const events = solarEvents(new Date(Date.UTC(2025, 11, 21)), latitude, longitude);
      expect(events.noon).toBeInstanceOf(Date);
      expect(Number.isNaN(events.noon.getTime())).toBe(false);
      expect(solarElevation(events.noon, latitude, longitude)).toBeLessThan(0);
    });

    it('never returns NaN in place of a missing event', () => {
      // The specific failure this guards: acos() of a value outside [-1, 1] is
      // NaN, which propagates into a Date and renders as "Invalid Date" to a
      // visitor above the Arctic Circle rather than as a state the piece handles.
      const angle = hourAngleForElevation(-0.833, 78.22, 23.44);
      expect(angle).toBeNull();
    });
  });

  describe('hour angle', () => {
    it('is 90° for the equator at equinox', () => {
      // Declination zero, latitude zero: the sun is up for exactly half the day.
      const angle = hourAngleForElevation(0, 0, 0);
      expect(angle).toBeCloseTo(90, 6);
    });

    it('grows in summer and shrinks in winter at the same latitude', () => {
      const summer = hourAngleForElevation(-0.833, 51.51, 23.44);
      const winter = hourAngleForElevation(-0.833, 51.51, -23.44);
      expect(summer).not.toBeNull();
      expect(winter).not.toBeNull();
      expect(summer as number).toBeGreaterThan(winter as number);
    });

    it('mirrors between hemispheres', () => {
      // Same date, opposite latitude and opposite declination: the same day length.
      const north = hourAngleForElevation(-0.833, 33.87, -23.44);
      const south = hourAngleForElevation(-0.833, -33.87, 23.44);
      expect(north as number).toBeCloseTo(south as number, 9);
    });

    it('returns null when the sun stays below the elevation all day', () => {
      expect(hourAngleForElevation(-0.833, -78.22, 23.44)).toBeNull();
    });
  });

  describe('the equation of time', () => {
    /**
     * The analemma. It is the term that separates clock noon from sundial noon,
     * it is what Singapore's sunrise depends on, and it is the part of this file
     * a reader is most likely to assume is a rounding error and delete.
     */
    it('stays within ±17 minutes across a year', () => {
      for (let day = 0; day < 365; day += 1) {
        const t = julianCentury(julianDay(new Date(Date.UTC(2025, 0, 1 + day))));
        expect(Math.abs(equationOfTime(t)), `day ${day}`).toBeLessThan(17);
      }
    });

    it('reaches roughly −14 minutes in February and +16 in early November', () => {
      const february = equationOfTime(julianCentury(julianDay(new Date(Date.UTC(2025, 1, 11)))));
      const november = equationOfTime(julianCentury(julianDay(new Date(Date.UTC(2025, 10, 3)))));
      expect(february).toBeLessThan(-13);
      expect(february).toBeGreaterThan(-15);
      expect(november).toBeGreaterThan(16);
      expect(november).toBeLessThan(17);
    });
  });

  describe('declination', () => {
    it('reaches the obliquity of the ecliptic at the solstices', () => {
      const june = solarDeclination(julianCentury(julianDay(new Date(Date.UTC(2025, 5, 21, 12)))));
      const december = solarDeclination(
        julianCentury(julianDay(new Date(Date.UTC(2025, 11, 21, 12))))
      );
      expect(june).toBeCloseTo(23.44, 1);
      expect(december).toBeCloseTo(-23.44, 1);
    });

    it('passes through zero at the equinoxes', () => {
      const march = solarDeclination(julianCentury(julianDay(new Date(Date.UTC(2025, 2, 20, 9)))));
      expect(Math.abs(march)).toBeLessThan(0.1);
    });
  });

  describe('elevation', () => {
    it('is the sunrise threshold at the computed sunrise', () => {
      // Closes the loop between the two halves of the file: whatever elevation
      // `solarEvents` solved for, `solarElevation` must agree it is there.
      for (const row of ALMANAC) {
        const [year, month, day] = row.date;
        const events = solarEvents(
          new Date(Date.UTC(year, month, day)),
          row.latitude,
          row.longitude
        );
        for (const event of [events.rise, events.set]) {
          expect(event, `${row.city} is missing an event`).not.toBeNull();
          const elevation = solarElevation(event as Date, row.latitude, row.longitude);
          expect(elevation, `${row.city}`).toBeCloseTo(-0.833, 1);
        }
      }
    });

    it('peaks at solar noon', () => {
      const latitude = 51.51;
      const longitude = -0.13;
      const events = solarEvents(new Date(Date.UTC(2025, 5, 21)), latitude, longitude);
      const peak = solarElevation(events.noon, latitude, longitude);

      for (const offsetMinutes of [-90, -30, -5, 5, 30, 90]) {
        const nearby = new Date(events.noon.getTime() + offsetMinutes * 60_000);
        expect(solarElevation(nearby, latitude, longitude)).toBeLessThan(peak);
      }
    });

    it('reaches 90 minus the latitude-declination gap at noon', () => {
      // London at the June solstice: 90 − (51.51 − 23.44) ≈ 61.9°.
      const events = solarEvents(new Date(Date.UTC(2025, 5, 21)), 51.51, -0.13);
      expect(solarElevation(events.noon, 51.51, -0.13)).toBeCloseTo(61.9, 0);
    });

    it('is symmetric about noon', () => {
      const latitude = -33.87;
      const longitude = 151.21;
      const events = solarEvents(new Date(Date.UTC(2025, 11, 21)), latitude, longitude);
      const before = solarElevation(
        new Date(events.noon.getTime() - 3_600_000),
        latitude,
        longitude
      );
      const after = solarElevation(
        new Date(events.noon.getTime() + 3_600_000),
        latitude,
        longitude
      );
      expect(before).toBeCloseTo(after, 1);
    });
  });

  describe('twilight thresholds', () => {
    it('orders the four boundaries correctly through a morning', () => {
      // Astronomical dawn comes first and sunrise last. If these ever invert, the
      // state machine walks the hotel backwards through its own night.
      const latitude = 51.51;
      const longitude = -0.13;
      const date = new Date(Date.UTC(2025, 2, 20));

      const rises = [-18, -12, -6, -0.833].map(
        (elevation) => solarEvents(date, latitude, longitude, elevation).rise
      );

      for (const rise of rises) {
        expect(rise).not.toBeNull();
      }
      for (let index = 1; index < rises.length; index += 1) {
        expect((rises[index] as Date).getTime()).toBeGreaterThan(
          (rises[index - 1] as Date).getTime()
        );
      }
    });

    it('can lose astronomical night while keeping a sunset', () => {
      // Reykjavík in June: the sun sets, but never gets 18° down. `open` is
      // therefore unreachable for a whole season, which is the concept holding
      // rather than failing — a latitude with no astronomical night is a
      // latitude with no vampires, and the hotel is not there.
      const date = new Date(Date.UTC(2025, 5, 21));
      expect(solarEvents(date, 64.15, -21.94, -0.833).set).not.toBeNull();
      expect(solarEvents(date, 64.15, -21.94, -18).set).toBeNull();
    });
  });

  describe('julian day', () => {
    it('is 2451545.0 at J2000.0', () => {
      // The epoch every series in the file is expanded around. Off by one here
      // and everything else is off by a day, consistently enough to look fine.
      expect(julianDay(new Date(Date.UTC(2000, 0, 1, 12)))).toBeCloseTo(2_451_545, 6);
      expect(julianCentury(2_451_545)).toBe(0);
    });

    it('advances by exactly one per day', () => {
      const first = julianDay(new Date(Date.UTC(2025, 5, 21)));
      const second = julianDay(new Date(Date.UTC(2025, 5, 22)));
      expect(second - first).toBeCloseTo(1, 9);
    });
  });
});
