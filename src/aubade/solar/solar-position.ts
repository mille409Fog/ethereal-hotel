/**
 * Where the sun is, from first principles.
 *
 * These are the NOAA solar-position equations — the same ones behind the NOAA
 * Solar Calculator — transcribed rather than installed. AUBADE says not to add a
 * library for this and it is right twice over: the whole file is about 120 lines
 * of arithmetic with no state and no I/O, and the piece's one claim on a stranger's
 * attention is that the sun in it is the real one. A dependency here would be
 * 40KB bought to make the load-bearing idea somebody else's.
 *
 * Accuracy of the NOAA approximations is ~1 minute for sunrise/sunset between
 * ±72° latitude, degrading past that as the sun's path flattens against the
 * horizon and a small elevation error becomes a large time error. That is the
 * budget the almanac tests assert against, and the reason they are stated as
 * two minutes rather than seconds.
 *
 * Conventions throughout:
 *   - Longitude is **east-positive**. NOAA's own worksheets are west-positive;
 *     the sign flip happens here, once, in `eventUTCMinutes`.
 *   - Angles are degrees at the boundary, radians only inside a formula.
 *   - `Date` is an instant. Nothing in this file knows about timezones — that
 *     is `zones.ts`, and keeping the two apart is what makes this half testable
 *     against an almanac.
 */

const DEGREES_PER_RADIAN = 180 / Math.PI;
const MINUTES_PER_DAY = 1440;
const MILLISECONDS_PER_MINUTE = 60_000;

/** Julian day number for the Unix epoch, 1970-01-01T00:00:00Z. */
const JULIAN_DAY_AT_EPOCH = 2_440_587.5;

/** Julian day number for J2000.0, the epoch these series are expanded around. */
const JULIAN_DAY_AT_J2000 = 2_451_545;

const DAYS_PER_JULIAN_CENTURY = 36_525;

function toRadians(degrees: number): number {
  return degrees / DEGREES_PER_RADIAN;
}

function toDegrees(radians: number): number {
  return radians * DEGREES_PER_RADIAN;
}

/** Julian day, including the fraction, for an instant. */
export function julianDay(at: Date): number {
  return at.getTime() / (MINUTES_PER_DAY * MILLISECONDS_PER_MINUTE) + JULIAN_DAY_AT_EPOCH;
}

/** Julian centuries since J2000.0 — the variable every series below is in. */
export function julianCentury(jd: number): number {
  return (jd - JULIAN_DAY_AT_J2000) / DAYS_PER_JULIAN_CENTURY;
}

/** Geometric mean longitude of the sun, degrees, normalised to [0, 360). */
function geometricMeanLongitude(t: number): number {
  const degrees = 280.46646 + t * (36000.76983 + t * 0.0003032);
  return ((degrees % 360) + 360) % 360;
}

/** Geometric mean anomaly of the sun, degrees. */
function geometricMeanAnomaly(t: number): number {
  return 357.52911 + t * (35999.05029 - 0.0001537 * t);
}

/** Eccentricity of Earth's orbit — dimensionless, and slowly shrinking. */
function orbitEccentricity(t: number): number {
  return 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
}

/**
 * Equation of the centre, degrees: the correction from the fictitious mean sun
 * to the real one, which runs fast at perihelion and slow at aphelion.
 */
function equationOfCentre(t: number): number {
  const m = toRadians(geometricMeanAnomaly(t));
  return (
    Math.sin(m) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * m) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * m) * 0.000289
  );
}

/** Apparent longitude of the sun, degrees — true longitude, nutated and aberrated. */
function apparentLongitude(t: number): number {
  const trueLongitude = geometricMeanLongitude(t) + equationOfCentre(t);
  return trueLongitude - 0.00569 - 0.00478 * Math.sin(toRadians(125.04 - 1934.136 * t));
}

/** Obliquity of the ecliptic, degrees, with the nutation correction applied. */
function obliquityCorrection(t: number): number {
  const meanObliquity =
    23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  return meanObliquity + 0.00256 * Math.cos(toRadians(125.04 - 1934.136 * t));
}

/**
 * Declination of the sun, degrees: how far north or south of the celestial
 * equator it is. Swings ±23.44° over a year and is the reason seasons exist.
 */
export function solarDeclination(t: number): number {
  const sine =
    Math.sin(toRadians(obliquityCorrection(t))) * Math.sin(toRadians(apparentLongitude(t)));
  return toDegrees(Math.asin(sine));
}

/**
 * Equation of time, minutes: apparent solar time minus mean solar time. This is
 * the analemma — the figure-of-eight a sundial traces against a clock, worth up
 * to ±16 minutes, and the single largest term separating "noon" from noon.
 */
export function equationOfTime(t: number): number {
  const epsilon = toRadians(obliquityCorrection(t));
  const y = Math.tan(epsilon / 2) ** 2;
  const l0 = toRadians(geometricMeanLongitude(t));
  const m = toRadians(geometricMeanAnomaly(t));
  const e = orbitEccentricity(t);

  const radians =
    y * Math.sin(2 * l0) -
    2 * e * Math.sin(m) +
    4 * e * y * Math.sin(m) * Math.cos(2 * l0) -
    0.5 * y * y * Math.sin(4 * l0) -
    1.25 * e * e * Math.sin(2 * m);

  return 4 * toDegrees(radians);
}

/**
 * The hour angle at which the sun sits at a given elevation, in degrees — half
 * the arc between the morning crossing and the evening one.
 *
 * **Returns `null` when the sun never reaches that elevation on that day**, which
 * is not an error and not a degenerate case: it is polar day and polar night, and
 * it is where every naive implementation quietly returns `NaN` and prints
 * "Invalid Date" to a visitor above the Arctic Circle. The caller has to decide
 * what a hotel with no dawn does; this function's job is to say so out loud.
 */
export function hourAngleForElevation(
  elevationDegrees: number,
  latitudeDegrees: number,
  declinationDegrees: number
): number | null {
  const latitude = toRadians(latitudeDegrees);
  const declination = toRadians(declinationDegrees);

  const cosineHourAngle =
    (Math.sin(toRadians(elevationDegrees)) - Math.sin(latitude) * Math.sin(declination)) /
    (Math.cos(latitude) * Math.cos(declination));

  // |cos| > 1 has no solution: the sun's whole daily circle is above this
  // elevation, or the whole of it is below.
  if (!Number.isFinite(cosineHourAngle) || cosineHourAngle < -1 || cosineHourAngle > 1) {
    return null;
  }

  return toDegrees(Math.acos(cosineHourAngle));
}

/**
 * Solar elevation above the horizon, degrees, at an instant and a place.
 *
 * Geometric — no refraction correction. That is deliberate and it pairs with the
 * −0.833° threshold in `state.ts`: the standard definition of sunrise already
 * folds refraction and the solar radius into the *threshold*, so correcting the
 * elevation as well would count both twice.
 */
export function solarElevation(
  at: Date,
  latitudeDegrees: number,
  longitudeDegrees: number
): number {
  const t = julianCentury(julianDay(at));
  const declination = toRadians(solarDeclination(t));
  const latitude = toRadians(latitudeDegrees);

  const utcMinutes =
    at.getUTCHours() * 60 +
    at.getUTCMinutes() +
    at.getUTCSeconds() / 60 +
    at.getUTCMilliseconds() / MILLISECONDS_PER_MINUTE;

  // True solar time: clock time, dragged onto the sundial by the equation of
  // time and shifted by how far east of the zone's reckoning you actually are.
  const trueSolarMinutes =
    (((utcMinutes + equationOfTime(t) + 4 * longitudeDegrees) % MINUTES_PER_DAY) +
      MINUTES_PER_DAY) %
    MINUTES_PER_DAY;

  // Noon is hour angle zero; the sun moves 15°/hour, i.e. 1° per 4 minutes.
  const hourAngle = toRadians(trueSolarMinutes / 4 - 180);

  const sine =
    Math.sin(latitude) * Math.sin(declination) +
    Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle);

  return toDegrees(Math.asin(sine));
}

/** Which side of solar noon an event falls on. */
type EventDirection = 'rising' | 'setting';

/**
 * Minutes after 00:00 UTC at which the sun crosses `elevationDegrees`.
 *
 * May be negative or exceed 1440, and that is the point: Auckland's sunrise for a
 * given local date happens on the previous UTC day, Reykjavík's midsummer sunset
 * on the following one. Clamping here would have thrown away the answer.
 *
 * Two passes, as NOAA's own worksheet does — the first estimates the time using
 * the sun's position at 00:00 UTC, the second re-evaluates declination and the
 * equation of time at that estimate. The sun's declination moves at most ~0.4°
 * per day, so a second pass converges to well inside the tolerance and a third
 * buys nothing measurable.
 */
function eventUTCMinutes(
  jdAtMidnight: number,
  latitudeDegrees: number,
  longitudeDegrees: number,
  elevationDegrees: number,
  direction: EventDirection
): number | null {
  const sign = direction === 'rising' ? 1 : -1;
  let t = julianCentury(jdAtMidnight);
  let minutes: number | null = null;

  for (let pass = 0; pass < 2; pass += 1) {
    const hourAngle = hourAngleForElevation(elevationDegrees, latitudeDegrees, solarDeclination(t));
    if (hourAngle === null) {
      return null;
    }

    // 720 is solar noon on the prime meridian, in minutes. Every term after it
    // is a correction: four minutes per degree east, and the analemma.
    minutes = 720 - 4 * (longitudeDegrees + sign * hourAngle) - equationOfTime(t);
    t = julianCentury(jdAtMidnight + minutes / MINUTES_PER_DAY);
  }

  return minutes;
}

/** The sun's two crossings of a threshold, and the noon between them. */
export interface ISolarEvents {
  /** The morning crossing, or `null` during polar day or polar night. */
  readonly rise: Date | null;

  /** The evening crossing, or `null` during polar day or polar night. */
  readonly set: Date | null;

  /** Local apparent noon. Always defined — the sun has a highest point every day. */
  readonly noon: Date;
}

/**
 * Sunrise, sunset and solar noon for the calendar day `dayStartUTC` begins.
 *
 * Pass the **local** date as a UTC midnight — `Date.UTC(2025, 5, 21)` for the
 * 21st of June wherever the visitor is. The returned instants are absolute and
 * may land on the adjacent UTC day; see `eventUTCMinutes`.
 *
 * `elevationDegrees` defaults to the standard sunrise definition. Pass −6, −12
 * or −18 to get the civil, nautical and astronomical twilight boundaries out of
 * the same function.
 */
export function solarEvents(
  dayStartUTC: Date,
  latitudeDegrees: number,
  longitudeDegrees: number,
  elevationDegrees = -0.833
): ISolarEvents {
  const midnight = Date.UTC(
    dayStartUTC.getUTCFullYear(),
    dayStartUTC.getUTCMonth(),
    dayStartUTC.getUTCDate()
  );
  const jd = julianDay(new Date(midnight));

  const at = (minutes: number | null): Date | null =>
    minutes === null ? null : new Date(midnight + minutes * MILLISECONDS_PER_MINUTE);

  const rise = at(
    eventUTCMinutes(jd, latitudeDegrees, longitudeDegrees, elevationDegrees, 'rising')
  );
  const set = at(
    eventUTCMinutes(jd, latitudeDegrees, longitudeDegrees, elevationDegrees, 'setting')
  );

  // Solar noon needs no hour angle, so it survives the polar cases that kill the
  // other two — even where the sun does not rise, it still has a highest point.
  let noonMinutes = 720 - 4 * longitudeDegrees - equationOfTime(julianCentury(jd));
  noonMinutes =
    720 - 4 * longitudeDegrees - equationOfTime(julianCentury(jd + noonMinutes / MINUTES_PER_DAY));

  return { rise, set, noon: new Date(midnight + noonMinutes * MILLISECONDS_PER_MINUTE) };
}
