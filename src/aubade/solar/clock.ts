/**
 * The clock. One call, one answer: given the browser, what is the sun doing?
 *
 * Everything else in AUBADE is decoration on top of this. It composes the three
 * pieces either side of it — zone → coordinates, coordinates → elevation,
 * elevation → state — and adds the one thing a visitor arriving in daylight is
 * owed: the exact minute it gets dark.
 *
 * No pixels here, and no browser APIs beyond `Intl`. The zone is a parameter with
 * a default rather than a lookup buried in the body, so every test runs the real
 * code path and no test has to stub a global.
 */

import { solarElevation, solarEvents } from './solar-position';
import { stateForElevation, type AubadeState } from './state';
import { locationForZone, type IZoneLocation } from './zones';

/** How far ahead `nextRise`/`nextSet` will look before giving up. */
const SEARCH_DAYS = 400;

const MILLISECONDS_PER_DAY = 86_400_000;

/** A complete reading of the sun for one visitor at one instant. */
export interface IAubadeClock {
  /** The IANA zone the reading was made for. */
  readonly zone: string;

  /** The instant read. */
  readonly at: Date;

  /** Where the sun was computed for, and whether that was a guess. */
  readonly location: IZoneLocation;

  /** Geometric solar elevation, degrees. */
  readonly elevationDegrees: number;

  /** What the hotel is doing. */
  readonly state: AubadeState;

  /**
   * The next sunrise after `at`, or `null` under a polar day or night that
   * outlasts the search window. The end of the piece: see AUBADE's last phase,
   * Dawn.
   */
  readonly nextRise: Date | null;

  /**
   * The next sunset after `at`, or `null` for the same reason. This is the number
   * printed on the card at the desk when a visitor arrives in daylight.
   */
  readonly nextSet: Date | null;
}

/**
 * The visitor's zone, from the browser. Falls back to UTC where `Intl` gives us
 * nothing — a headless runtime, or a browser hardened against fingerprinting.
 */
export function resolvedZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/** Which of a day's two crossings to look for. */
type Crossing = 'rise' | 'set';

/**
 * The first crossing strictly after `at`, walking forward a day at a time.
 *
 * A day at a time rather than solving directly, because the polar cases have no
 * closed form worth writing: above the Arctic Circle the answer can be months
 * away, and the loop that finds it is four lines. It starts a day early since a
 * local date's crossing can fall on the previous UTC day.
 */
function nextCrossing(
  crossing: Crossing,
  from: Date,
  latitude: number,
  longitude: number
): Date | null {
  const start = from.getTime();

  for (let offset = -1; offset < SEARCH_DAYS; offset += 1) {
    const day = new Date(start + offset * MILLISECONDS_PER_DAY);
    const event = solarEvents(day, latitude, longitude)[crossing];
    if (event !== null && event.getTime() > start) {
      return event;
    }
  }

  return null;
}

/**
 * Read the sun.
 *
 * @param at The instant to read. Defaults to now.
 * @param zone IANA zone. Defaults to the browser's. Passed explicitly by the
 *   dev-only `?t=` fake clock that arrives with the day/night states, and by
 *   every test here.
 */
export function readClock(at: Date = new Date(), zone: string = resolvedZone()): IAubadeClock {
  const location = locationForZone(zone, at);
  const { latitude, longitude } = location;
  const elevationDegrees = solarElevation(at, latitude, longitude);

  return {
    zone,
    at,
    location,
    elevationDegrees,
    state: stateForElevation(elevationDegrees),
    nextRise: nextCrossing('rise', at, latitude, longitude),
    nextSet: nextCrossing('set', at, latitude, longitude),
  };
}
