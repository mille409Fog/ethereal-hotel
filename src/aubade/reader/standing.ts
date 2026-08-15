/**
 * The hotel’s standing: the one part of the Reader’s Edition the sun moves.
 *
 * AUBADE's first non-negotiable asks for the current solar state *stated in
 * words*, and this is where that happens. Everything in `edition.ts` is written
 * and fixed; everything here is computed and true only for the minute it was
 * computed in. Keeping the two in separate files is the point — a work whose
 * prose and whose telemetry are interleaved ends up with prose that reads like
 * telemetry.
 *
 * Three rules, and the third is the one that would be easy to get wrong.
 *
 * **It says how it knows.** The location behind these numbers is a time zone
 * name turned into a representative point, and for an unlisted zone it is a UTC
 * offset and an outright guess at latitude. A reader is told which of those they
 * got. The piece's claim is that it tells the truth about the sun where you are,
 * and a claim like that is worth exactly as much as its worst-case disclosure.
 *
 * **It spells out "degrees".** A screen reader is a first-class audience on this
 * route rather than a fallback, and `°` is read inconsistently across engines —
 * sometimes as "degrees", sometimes as "degree sign", sometimes not at all.
 *
 * **It ignores `?t=<state>`.** The dev-only back door can force a state without
 * moving the sun, which is exactly what you want when inspecting five light rigs
 * and exactly what you must not have here: it would print a real elevation next
 * to a fabricated state and call it the truth. `readTheSun` still honours
 * `?t=<instant>` and `?tz=`, which move the sun for real and leave every
 * sentence below consistent — that is the honest form of the back door, and it
 * is the only form this page has any use for.
 */

import { describeCountdown } from '../desk';
import type { IAubadeClock } from '../solar';
import type { AubadeState } from '../solar/state';

/** The hotel’s position at one instant, in three sentences. */
export interface IStanding {
  /** Where the sun was computed for, and how much of that was a guess. */
  readonly place: string;

  /** How far the sun is from that horizon, and what the hotel is doing. */
  readonly sun: string;

  /** What changes next, and roughly when. */
  readonly next: string;
}

/**
 * What the hotel is, at each of the five hours, as the back half of a sentence
 * beginning "The sun is N degrees below that horizon:".
 *
 * Shorter than the desk's lines on purpose. The clerk is speaking to somebody
 * standing in the room; this is a note to somebody reading about it.
 */
const STANDING_BY_STATE: Readonly<Record<AubadeState, string>> = {
  open: 'astronomical night, and the hotel is open.',
  late: 'the far end of the night, and rooms are already being closed.',
  warning: 'nautical twilight, and the desk has begun mentioning the time.',
  aubade: 'civil twilight — the aubade itself, and the last of the dark.',
  shuttered: 'daylight, and the hotel is shut.',
};

/** How the standing paragraph ends, in the three situations it can end in. */
export const NEXT_CHANGE = {
  /**
   * The hotel is shut and waiting on the sun to go. Says the two things a
   * daytime visitor needs: when it gets dark, and that the doors open later
   * still.
   */
  shut: (countdown: string): string =>
    `The sun goes down ${countdown}, and the hotel opens a while after that — not at sunset, ` +
    `but once the sky has finished going dark.`,

  /** The hotel is open, or closing, and the sun is on its way. */
  open: (countdown: string): string => `The sun comes up ${countdown}, and the hotel shuts.`,

  /**
   * No crossing was found. `readClock` walks forward 400 days looking for one
   * and there is nowhere on Earth the sun fails to cross the horizon inside a
   * year, so this is defensive rather than reachable — but a sentence is
   * cheaper than a blank line, and it is written in the same voice as the two
   * above rather than as an error.
   */
  unknown:
    'When that changes is past the end of this hotel’s arithmetic, which means you are ' +
    'somewhere very far north or very far south indeed.',
} as const;

/**
 * A signed coordinate as a compass bearing, spelled out.
 *
 * @param degrees Signed degrees. Positive is `positive`, negative is `negative`.
 * @param positive The word for the positive direction — `north` or `east`.
 * @param negative The word for the negative direction — `south` or `west`.
 * @returns Something like `51.51 degrees north`. Two decimals, matching the zone
 *   table, which rounds there because two decimals is about a kilometre and the
 *   error already baked into "somewhere in Asia/Shanghai" is four orders of
 *   magnitude larger. More digits would be a lie about both.
 */
function bearing(degrees: number, positive: string, negative: string): string {
  const direction = degrees < 0 ? negative : positive;
  return `${Math.abs(degrees).toFixed(2)} degrees ${direction}`;
}

/**
 * Where the sun was computed for, and whether that was a lookup or a guess.
 *
 * @param clock A reading of the sun.
 * @returns One sentence naming the zone, and either the point it resolved to or
 *   the fact that it did not resolve to one.
 */
export function describePlace(clock: IAubadeClock): string {
  const { latitude, longitude, precise } = clock.location;

  if (!precise) {
    return (
      `Your browser reports the time zone ${clock.zone}, which is not in this hotel’s table of ` +
      `places. Longitude below comes from that zone’s offset from UTC and latitude is assumed ` +
      `to be forty degrees north, so the arithmetic is honest about a location that is a guess.`
    );
  }

  return (
    `Your browser reports the time zone ${clock.zone}. The hotel reads that as ` +
    `${bearing(latitude, 'north', 'south')}, ${bearing(longitude, 'east', 'west')} — the zone’s ` +
    `namesake city, which is near enough for twilight and nowhere near your street.`
  );
}

/**
 * Where the sun is against that horizon, and what the hotel makes of it.
 *
 * @param clock A reading of the sun.
 * @returns One sentence: the elevation to a tenth of a degree, then the state.
 */
export function describeSun(clock: IAubadeClock): string {
  const elevation = clock.elevationDegrees;
  const side = elevation < 0 ? 'below' : 'above';
  const magnitude = Math.abs(elevation).toFixed(1);

  return `The sun is ${magnitude} degrees ${side} that horizon: ${STANDING_BY_STATE[clock.state]}`;
}

/**
 * What the hotel does next, and roughly when.
 *
 * The third sentence of the standing paragraph, and the only one that has to
 * pick a direction: a shut hotel is waiting on sunset and an open one is waiting
 * on sunrise, and the reader is owed whichever of the two is actually coming.
 *
 * @param clock A reading of the sun. `state` decides which way the hotel is
 *   facing; `nextSet` and `nextRise` are the instants to count to, and either
 *   can be `null` — see `NEXT_CHANGE.unknown`.
 * @returns One finished sentence, ending in a full stop. Never empty.
 *
 *   - Shuttered, with a sunset to count to → `NEXT_CHANGE.shut`, given the
 *     countdown to `nextSet`.
 *   - Any other state, with a sunrise to count to → `NEXT_CHANGE.open`, given
 *     the countdown to `nextRise`.
 *   - Whichever of the two was needed is `null` → `NEXT_CHANGE.unknown`.
 *
 *   The countdown phrases come from `describeCountdown` in `../desk`, which
 *   returns the back half of a sentence — `in 43 minutes`, `in 4 hours and 12
 *   minutes`, `in 6 days` — with no leading space and no full stop.
 */
export function describeNextChange(clock: IAubadeClock): string {
  // Which way the hotel is facing picks the instant, and only then is that
  // instant checked. Both crossings are non-null almost everywhere, including
  // at 78°N in June where the next sunset is two months out and the next
  // sunrise is tomorrow — so a null check written before the direction would
  // read the wrong one and answer a question nobody asked.
  const shut = clock.state === 'shuttered';
  const crossing = shut ? clock.nextSet : clock.nextRise;

  if (crossing === null) {
    return NEXT_CHANGE.unknown;
  }

  const countdown = describeCountdown(clock.at, crossing);
  return shut ? NEXT_CHANGE.shut(countdown) : NEXT_CHANGE.open(countdown);
}

/**
 * The hotel’s standing, in the three sentences the page prints.
 *
 * @param clock A reading of the sun, from `readTheSun`.
 * @returns Where, what, and what next.
 */
export function describeStanding(clock: IAubadeClock): IStanding {
  return {
    place: describePlace(clock),
    sun: describeSun(clock),
    next: describeNextChange(clock),
  };
}
