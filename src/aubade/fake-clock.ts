/**
 * The fake clock: `?t=`, and it is for developers only.
 *
 * AUBADE's whole argument is that the piece is indexed to the real world — it
 * cannot be faked in a screenshot, it is different every hour, and nobody
 * experiences all of it in one sitting. That is also, for anyone building it, an
 * enormous nuisance: four of the five states last a combined ninety minutes a
 * day and two of them happen while you are asleep.
 *
 * So there is a back door, and the two things worth saying about it are why it
 * is shaped like this and why it is not in production.
 *
 * ## Why it takes a state name as well as an instant
 *
 * `?t=2026-08-14T03:00Z` is the honest form: it feeds a real instant to the real
 * clock and everything downstream is the code that ships. It is also useless for
 * the thing you actually want to do, which is see all five states in a row —
 * finding an instant that puts *your* latitude in nautical twilight means
 * solving for the sun by hand, and getting it wrong looks exactly like a bug in
 * the rig you were trying to inspect.
 *
 * So `?t=warning` names the state directly. It does not fake the sun: the clock
 * still runs on the real instant, the sunrise and sunset it reports are the real
 * ones for the real place, and only the state is forced. That is deliberate,
 * because it means the countdown card and the invitation are never being
 * exercised against numbers that could not occur.
 *
 * ## Why it is not in production
 *
 * A visitor who can type `?t=open` has been handed the whole work, and the
 * refusal — the thing the piece is *about*, per AUBADE's second property — turns
 * into a URL parameter. The invitation exists so that a daytime visitor can reach
 * everything in one click; it is a door with a handle on it, in the fiction,
 * rather than a way around the fiction. This is the way around, and the caller
 * gates it on Angular's `isDevMode()`.
 *
 * Nothing here reads `location`, `Intl` or the DOM — a string in, a plain object
 * out — so every test runs the real code path and none of them stubs a global.
 */

import { AUBADE_STATES, type AubadeState } from './solar/state';

/** What a query string asked the clock to pretend. Every field is optional. */
export interface IFakeClock {
  /** The instant to read instead of now, or `null` to use the real one. */
  readonly at: Date | null;

  /** An IANA zone to read instead of the browser's, or `null` for the browser's. */
  readonly zone: string | null;

  /**
   * A state to display regardless of what the sun is doing, or `null` to let the
   * elevation decide. The rest of the clock — the location, the next sunrise and
   * sunset — is left real.
   */
  readonly state: AubadeState | null;
}

/** Asked for nothing. Returned rather than `null` so callers need no branch. */
const NOTHING_ASKED: IFakeClock = { at: null, zone: null, state: null };

/**
 * Read `?t=` and `?tz=` out of a query string.
 *
 * @param search A query string, with or without its leading `?` — pass
 *   `location.search` straight in. Anything unparseable is ignored rather than
 *   thrown on: this is a debugging affordance, and a typo in a URL should show
 *   the real hour rather than an error page.
 * @returns What was asked for. All three fields are `null` when nothing was, or
 *   when what was asked for made no sense.
 *
 * @example
 *   parseFakeClock('?t=shuttered')            // force the daytime state
 *   parseFakeClock('?t=2026-08-14T03:00Z')    // read the sun at that instant
 *   parseFakeClock('?t=03:00&tz=Asia/Tokyo')  // …as if the visitor were in Tokyo
 */
export function parseFakeClock(search: string): IFakeClock {
  const parameters = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);

  const zone = parameters.get('tz');
  const asked = parameters.get('t');

  if (asked === null) {
    return { ...NOTHING_ASKED, zone };
  }

  // A state name first: 'late' is also not a date, but leaning on that would be
  // a coincidence rather than a rule.
  if ((AUBADE_STATES as readonly string[]).includes(asked)) {
    return { at: null, zone, state: asked as AubadeState };
  }

  const at = new Date(asked);
  return {
    at: Number.isNaN(at.valueOf()) ? null : at,
    zone,
    state: null,
  };
}
