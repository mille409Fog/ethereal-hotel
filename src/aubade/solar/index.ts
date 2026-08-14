/**
 * AUBADE's clock — Phase 0, and deliberately the only thing in `src/aubade/` so
 * far. No renderer, no route, no pixels: the astronomy is the risk in this
 * project and it is pure functions, so it ships first and gets tested hardest.
 *
 * Nothing here imports from `src/app/` or from `src/styles.css`, and nothing
 * there imports from here. That isolation is a requirement of the spec, not a
 * tidiness preference — a shared token is how a separate work quietly becomes a
 * subsection of the portfolio site.
 */

export { readClock, resolvedZone, type IAubadeClock } from './clock';
export {
  equationOfTime,
  hourAngleForElevation,
  julianCentury,
  julianDay,
  solarDeclination,
  solarElevation,
  solarEvents,
  type ISolarEvents,
} from './solar-position';
export {
  ASTRONOMICAL_TWILIGHT_DEGREES,
  AUBADE_STATES,
  CIVIL_TWILIGHT_DEGREES,
  NAUTICAL_TWILIGHT_DEGREES,
  stateForElevation,
  SUNRISE_DEGREES,
  type AubadeState,
} from './state';
export {
  FALLBACK_LATITUDE,
  locationForZone,
  utcOffsetMinutes,
  ZONE_COORDINATES,
  type IZoneLocation,
} from './zones';
