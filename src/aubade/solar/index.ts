/**
 * AUBADE's clock. The astronomy is the risk in this project and it is pure
 * functions, so it shipped first and got tested hardest — before a single pixel
 * existed.
 *
 * The room reads it. `aubade.ts` calls `readClock` on arrival and again once a
 * minute; `rooms/light-rig.ts` turns the state it returns into a palette and a
 * light rig, and `desk.ts` turns the same state into what the hotel says. That
 * order was the point of shipping this first: the clock is the load-bearing idea
 * and the rooms are decoration on top of it, so the clock is the thing that had
 * to be right before anything could be built on it. `readClock` is the entry
 * point.
 *
 * Nothing here imports from `src/app/` or from `src/styles.css`, and nothing
 * there imports from anywhere in `src/aubade/`. That isolation is a requirement
 * of the spec, not a tidiness preference — a shared token is how a separate work
 * quietly becomes a subsection of the portfolio site.
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
