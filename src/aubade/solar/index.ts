/**
 * AUBADE's clock. The astronomy is the risk in this project and it is pure
 * functions, so it shipped first and got tested hardest — before a single pixel
 * existed.
 *
 * **Nothing reads this yet.** The room on `/aubade` is lit by a fixed moon at a
 * fixed angle; wiring the five solar states to five palettes and five light rigs
 * is the next phase, and until it lands this module is a tested library with no
 * caller. That is the intended order: the clock is the load-bearing idea and the
 * rooms are decoration on top of it, so the clock is the thing that had to be
 * right first. `readClock` is the entry point when that wiring happens.
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
