/**
 * The desk: everything the hotel says in words.
 *
 * AUBADE records "the writing is bad" as one of five ways the project fails, and
 * is explicit that every string in it — the clerk's lines, the register, the
 * invitation — is written rather than drafted. So they are gathered here rather
 * than scattered through a template, for the same reason the light rigs are
 * gathered in one file: five palettes read as a palette when they are next to
 * each other, and five voices read as a voice.
 *
 * Three rules the copy below is trying to keep.
 *
 * **Nothing here states a clock time.** "Three in the morning" is a lie to a
 * visitor in a Norwegian summer, where astronomical night does not happen at all,
 * and the piece's whole claim is that it is telling the truth about the sun where
 * *you* are. The states are described by what the light is doing, which is true
 * everywhere.
 *
 * **The hotel opens later than sunset.** The card counts down to the sun going
 * down, because that is the number a daytime visitor wants and the one they can
 * check against a weather app; but the doors open at astronomical twilight, an
 * hour or more after, and saying so is both accurate and the most vampiric fact
 * about the place.
 *
 * **The invitation names its own mark.** AUBADE's fourth failure mode is a piece
 * that is impressive and unreadable, and a faint permanent marker nobody knows to
 * look for is decoration. So the line after the invitation says where to look.
 */

import type { AubadeState } from './solar/state';

/** What the desk says at one hour of the sun. */
export interface IDeskCopy {
  /** The clerk's line on the plate. One sentence, in the register's voice. */
  readonly plate: string;

  /**
   * The canvas's accessible name. To assistive technology the render is one
   * picture, not a drawing surface, and the picture is different at every hour —
   * an alt text describing moonlight to somebody looking at a shuttered room is
   * worse than none.
   */
  readonly picture: string;

  /**
   * The first line of the prose, which is the only part of it the hour changes.
   * The rest of the room — the bell, the register, the pigeonholes — is true
   * whatever the sun is doing.
   */
  readonly opening: string;
}

/** The five hours, in the desk's voice. Darkest first. */
export const DESK_COPY: Readonly<Record<AubadeState, IDeskCopy>> = {
  open: {
    plate: 'Astronomical night where you are. The hotel is open, and there is nobody at the desk.',
    picture:
      'A hotel lobby at night, drawn in real time. Moonlight through a transom window crosses ' +
      'the room in one hard diagonal and lands on the marble floor in front of the reception desk.',
    opening:
      'Full dark. One hard diagonal of moonlight crosses the room and lands on the marble in ' +
      'front of the desk; dust turns over inside it.',
  },

  late: {
    plate:
      'The sky has started. Rooms are being closed behind you, in the order you are not looking.',
    picture:
      'A hotel lobby at the end of the night, drawn in real time. The moonlight through the ' +
      'transom window has drawn back towards the door, and the glass is no longer black.',
    opening:
      'The sky behind the glass is no longer black, and the moonlight has drawn back towards ' +
      'the door.',
  },

  warning: {
    plate: 'Nautical twilight. The desk would like you to know the time.',
    picture:
      'A hotel lobby in the blue hour, drawn in real time. The transom window is the coldest ' +
      'thing in the room, and the reception lamp is no longer the brightest.',
    opening:
      'The blue hour. The window has stopped being the brightest thing in the room and become ' +
      'the coldest.',
  },

  aubade: {
    plate: 'Civil twilight, and the last of it. This is the hour the hotel is named for.',
    picture:
      'A hotel lobby minutes before sunrise, drawn in real time. Light the colour of the horizon ' +
      'comes through the transom window almost level, crosses the whole floor, and stops against ' +
      'the front of the reception desk.',
    opening:
      'The last of the dark. The light comes in almost level now, crosses the whole floor, and ' +
      'stops against the front of the desk.',
  },

  shuttered: {
    plate:
      'The hotel is shut. The sun is up where you are, and it is the only thing that closes this place.',
    picture:
      'A hotel lobby with the shutter down over its one window, drawn in real time. Six flat ' +
      'bars of daylight lie across the marble floor. The reception lamp is out.',
    opening:
      'The shutter is down. Six flat bars of daylight lie across the marble and go no further, ' +
      'and the lamp is out.',
  },
};

/** The invitation, and what taking it leaves behind. */
export const INVITATION = {
  /** The offer. AUBADE specifies this line; it is quoted rather than rewritten. */
  offer: 'The night rooms can be opened for you. They will not be the same.',

  /** The control. Plain, diegetic, and impossible to mistake for decoration. */
  action: 'Open the night rooms',

  /**
   * Afterwards, permanently. It names the mark so a visitor knows to look for
   * it, which is the difference between a detail and a thing nobody sees.
   */
  taken: 'You came in out of the daylight. There is a line of it under the door, and it stays.',
} as const;

/**
 * The card on the desk, in the two situations it has to describe.
 *
 * Composed here rather than in the template, for the reason at the top of this
 * file — the writing lives in one place — and for one mechanical one: two
 * sentences behind two `@if`s put `aubade.html` over the template complexity
 * limit, and a lint rule pushing prose out of a template and into the file
 * named for prose is a lint rule earning its keep.
 */
export const SUNSET_CARD = {
  /** The ordinary case: the sun goes down today and the card counts to it. */
  today: (countdown: string): string =>
    `The sun goes down ${countdown}. The hotel opens later than that, when the sky is properly dark.`,

  /**
   * 78°N in June. The sun does not go down at all today and the next sunset is
   * two months out — the same phrase from `describeCountdown`, given a sentence
   * that makes it read as the fact it is rather than as a broken timer.
   */
  season: (countdown: string): string =>
    `The sun does not go down here today. It sets ${countdown}, at the turn of the season, ` +
    `and the hotel opens after that.`,

  /** Above the time, or instead of it when there is no time to give. */
  heading: (at: string | null): string => (at === null ? 'No sunset today' : `Sunset · ${at}`),
} as const;

/**
 * A wall-clock time as the visitor's own locale would write it, in the zone the
 * sun was computed for.
 *
 * @param at The instant to show.
 * @param zone IANA zone. An unknown one throws inside `Intl`, which is a
 *   plausible thing to hand this function — the zone can come from `?tz=`, and
 *   the zone table deliberately accepts what it does not recognise — so it falls
 *   back to the runtime's own zone rather than taking the page down.
 * @returns Something like `20:14` or `8:14 PM`, depending on the locale. Never
 *   forced to 24-hour: this is a number a visitor is meant to check against the
 *   clock on their own wall.
 */
export function formatClockTime(at: Date, zone: string): string {
  const options: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };

  try {
    return new Intl.DateTimeFormat(undefined, { ...options, timeZone: zone }).format(at);
  } catch {
    return new Intl.DateTimeFormat(undefined, options).format(at);
  }
}

/**
 * How long until something, in words, as the second half of a sentence.
 *
 * The card at the desk reads `The sun goes down ${describeCountdown(now, set)}.`,
 * so every branch has to finish that sentence — including the ones measured in
 * days, which are not an edge case. Above the Arctic Circle in June the next
 * sunset is genuinely two months out, the card genuinely says so, and "the sun
 * goes down in 62 days" is the single most vampiric sentence this hotel is
 * capable of printing. The template gives that case some extra room around the
 * phrase rather than a different phrase; see `sunsetCard` in `aubade.ts`.
 *
 * @param from The instant to count from — now, at the moment the card was drawn.
 * @param to The instant to count to.
 *
 *   `null` is defensive rather than reachable, and that is worth stating plainly
 *   because the obvious assumption is the opposite one. `readClock` walks
 *   forward a day at a time for 400 days looking for a crossing, and there is
 *   nowhere on Earth where the sun fails to set at some point in a year — so
 *   even at 78°N in midsummer it returns a date in August rather than nothing.
 *   The `null` branch exists so this function is total for the type it accepts;
 *   the card never renders its answer.
 * @returns A phrase, no leading or trailing space, no full stop.
 *
 *   - `to` is `null` → `until the turn of the season`
 *   - `to` is now or already past → `any moment now`
 *   - under a minute → `in under a minute`
 *   - under an hour → `in 1 minute`, `in 43 minutes`
 *   - under a day → `in 1 hour`, `in 4 hours`, `in 4 hours and 12 minutes`
 *   - a day or more → `in 1 day`, `in 6 days`
 *
 *   Whole units only, and no seconds: the card is redrawn twice a minute, and a
 *   ticking number would turn a piece of set dressing into a stopwatch.
 */
export function describeCountdown(from: Date, to: Date | null): string {
  // We handle the case which depends only the setting of the sun.
  if (to === null) {
    return 'until the turn of the season';
  }
  if (from >= to) {
    return 'any moment now';
  }
  const minuteDivisor: number = 60000;
  const minuteDifference: number = Math.floor((to.getTime() - from.getTime()) / minuteDivisor);
  const hourDifference: number = Math.floor(minuteDifference / 60);
  const trailingMinutes: number = minuteDifference - hourDifference * 60;
  const count = (n: number, unit: string): string => `${n} ${unit}${n === 1 ? '' : 's'}`;
  if (minuteDifference === 0) {
    return 'in under a minute';
  }
  if (minuteDifference < 60) {
    return `in ${count(minuteDifference, 'minute')}`;
  }
  if (hourDifference < 24 && trailingMinutes === 0) {
    return `in ${count(hourDifference, 'hour')}`;
  }
  if (hourDifference < 24) {
    return `in ${count(hourDifference, 'hour')} and ${count(trailingMinutes, 'minute')}`;
  }
  const dayDifference: number = ~~(hourDifference / 24);
  return `in ${count(dayDifference, 'day')}`;
}
