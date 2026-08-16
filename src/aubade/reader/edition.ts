/**
 * The Reader’s Edition — the hotel as a prose work.
 *
 * AUBADE's first non-negotiable, in full: a text version reachable from a
 * visible link on every screen, not a `<noscript>` tag and not an ARIA
 * description; the hotel written out at about twelve hundred words, genuinely
 * worth reading, with the current solar state stated in words. It serves screen
 * readers, `prefers-reduced-motion`, absent WebGL, dying batteries, and people
 * who would simply rather read. The instruction attached to it is to write it as
 * literature, because half the point of the project is that you can.
 *
 * Three things about the shape of this file.
 *
 * **The writing is data and the component is a renderer.** Same reason
 * `desk.ts` gathers the clerk's lines: prose scattered through a template is
 * prose nobody reads end to end, and this has to survive being read end to end.
 * It also makes the work measurable — `edition.spec.ts` counts the words and
 * fails if the piece quietly rots into a caption.
 *
 * **Nothing here states a clock time or a season.** The same rule `desk.ts`
 * keeps, for the same reason: "three in the morning" is a lie to a visitor in a
 * Norwegian summer, and the piece's entire claim is that it tells the truth
 * about the sun where *you* are. Everything time-dependent is in `standing.ts`,
 * which is computed rather than written, and is the only part of this page that
 * changes.
 *
 * **The unbuilt floors are described in the present tense and then named as
 * unbuilt.** That is not a hedge bolted onto the fiction — it is the fiction and
 * the truth landing on the same sentence, which is the most this repository ever
 * asks of a paragraph. Both statements are in the work, and neither is in a
 * footnote. The count in the coda moves every time a floor lands, and moving it is
 * part of landing one: a room that ships without taking itself out of that list has
 * quietly made this page lie.
 */

/** One floor of the hotel, as the Reader’s Edition lists it. */
export interface IFloor {
  /** `Floor 0`, `Floor −1`, and downwards. U+2212, not a hyphen. */
  readonly floor: string;

  /** The room's name. */
  readonly name: string;

  /** What is in it. One paragraph, present tense, whether or not it exists. */
  readonly body: string;
}

/** One section of the work. */
export interface IEditionSection {
  /** Anchor id, and the target of the contents list at the top of the page. */
  readonly id: string;

  /** The section heading, as a reader sees it. */
  readonly heading: string;

  /** The body, before the floor list if there is one. */
  readonly paragraphs: readonly string[];

  /** The floors, for the one section that has them. Empty everywhere else. */
  readonly floors: readonly IFloor[];

  /** The body after the floor list. Empty everywhere else. */
  readonly coda: readonly string[];
}

/** The name of the work, and of the page. */
export const EDITION_TITLE = 'Hôtel Aubade';

/** What this edition is, said once, before anything else. */
export const EDITION_STANDFIRST =
  'The hotel, its hours, its six floors, and what the sun has to do with any of it. This is not ' +
  'a description of the other page. It is the same work set in type, it needs no graphics card, ' +
  'and if it is the only version you ever read you will not have missed the thing it is about.';

/** The way back into the lobby, for a reader who wants it lit. */
export const EDITION_RETURN = {
  /** The line before the link, so it is an offer rather than a navigation item. */
  offer:
    'The lobby is one floor up and one link away. It will tell you honestly whether this ' +
    'browser can draw it.',

  /** The link. */
  action: 'Go up to the desk',
} as const;

/** The heading over the computed part — the only part of this page the sun moves. */
export const STANDING_HEADING = 'Where the sun is, for you, now';

/** The work. */
export const EDITION: readonly IEditionSection[] = [
  {
    id: 'the-hotel',
    heading: 'The hotel',
    paragraphs: [
      'Hôtel Aubade keeps the guest’s hours. That is the polite version. The blunt one is that ' +
        'it keeps its own and assumes you have the same ones.',
      'It opens at astronomical twilight — not at sunset, which is only the sun leaving, but an ' +
        'hour or more after that, when the last of the light has finished draining out of the ' +
        'sky and the sky is as dark as it is going to get tonight. It is fully itself around ' +
        'local midnight. It shuts at dawn.',
      'Dawn where you are. The hotel does not run on a server’s clock, or on the hours of the ' +
        'person who built it, or on a timeline laid out in advance by anybody. It runs on the ' +
        'position of the real sun at your longitude, worked out again each time you arrive. Two ' +
        'people opening it from Lisbon and from Tokyo are not looking at the same hotel, and ' +
        'neither of them is looking at the lesser one.',
      'Most visitors arrive in daylight. They find the place shut, and are told the exact minute ' +
        'the sun will go down on them.',
    ],
    floors: [],
    coda: [],
  },

  {
    id: 'the-name',
    heading: 'The name',
    paragraphs: [
      'An aubade is a dawn song: a poem about two people who have spent the night together and ' +
        'are being separated by the light. The troubadours wrote them. Donne wrote one furious ' +
        'at the sun for coming through the curtains — busy old fool, unruly sun — and Larkin ' +
        'wrote one awake at four in the morning and afraid of dying. Wagner staged one and made ' +
        'it last twenty minutes.',
      'They are all the same poem. The night was finite, nobody agreed to that, and here comes ' +
        'the light anyway.',
      'It is also, with no adjustment at all, the precise situation of a certain sort of guest — ' +
        'the one for whom sunrise is not a figure of speech. The hotel is named after the poem ' +
        'rather than after the guest, on the grounds that the poem is better company and does ' +
        'not have to be introduced.',
    ],
    floors: [],
    coda: [],
  },

  {
    id: 'the-floors',
    heading: 'Six floors, descending',
    paragraphs: [
      'They go down, because the good rooms are underground. A building that keeps these hours ' +
        'has no use whatever for a view.',
    ],
    floors: [
      {
        floor: 'Floor 0',
        name: 'The Desk',
        body:
          'Marble, a reception counter, thirty-five pigeonholes and a key in none of them. A ' +
          'brass bell nobody rings. One transom window above the door, which is the only ' +
          'opening in the room and therefore the only thing that ever happens to the light. ' +
          'There is no clerk. There has never been a clerk. The register lies open at today.',
      },
      {
        floor: 'Floor −1',
        name: 'The Mirror Corridor',
        body:
          'A wall of mirror — not a mirror on a wall, sheets of plate the width of a door with ' +
          'brass beading between them, running the length of the floor from the skirting to the ' +
          'picture rail. In it: the runner, the sconces, the seven numbered doors, the dust. ' +
          'Everything. Everything except the one thing you came down here carrying. Most people ' +
          'notice about four seconds later than they expect to.',
      },
      {
        floor: 'Floor −2',
        name: 'The Library',
        body:
          'A reading room, shelved to the cornice down both walls, four long tables, a lamp on ' +
          'each. No daylight has ever reached this floor and none of its light answers to any: ' +
          'every lamp burns at the same strength at three in the morning as at noon. What the ' +
          'sun takes here is the writing. The gilt goes off the spines as the night ends, and by ' +
          'sunrise there is not one legible mark in a room as bright as it ever was. One ' +
          'sentence is still to come, held in eight writing systems at once and dissolving ' +
          'between them. Until it is written, the shelves say this floor’s piece for it.',
      },
      {
        floor: 'Floor −3',
        name: 'The Cellar',
        body:
          'A brick barrel vault, seven casks on iron hoops, standing water at the low end, one ' +
          'tallow candle. Nothing in it ever changes, at any hour, for anybody. Stand still for ' +
          'ninety seconds and the whole room arrives anyway — the coursing overhead, the ' +
          'saltpetre in the joints, a far wall you had no reason to think was there. Move and ' +
          'you give some of it back. How much you get at all depends on the sun, which has never ' +
          'been down here and does not need to have been.',
      },
      {
        floor: 'Floor −4',
        name: 'The Projection Room',
        body:
          'A projectionist’s bench, and everything a projector does to a picture on its way to ' +
          'the wall: the weave in the gate, the halation around a highlight, grain, the judder ' +
          'of twenty-four frames a second, the cue dots that warn of a reel change. You can ' +
          'operate it. The apparatus is the exhibit.',
      },
      {
        floor: 'Floor −5',
        name: 'The Box',
        body:
          'An opera box, one aria, and the geometry of the room moving to it. It has to be ' +
          'worth looking at in silence, because for most visitors it will be silent.',
      },
    ],
    coda: [
      'The lift between them is not a corridor with a wait in it. It is a room in its own ' +
        'right, and it is where one shape becomes another in front of you. It takes seven and a ' +
        'half seconds and it cannot be hurried. The ceiling comes down, the walls draw in, the ' +
        'desk lengthens into a runner and the far wall opens into a corridor, and none of it is ' +
        'a cross-fade between two pictures — it is one piece of arithmetic becoming another ' +
        'piece of arithmetic, in full view, which is the only honest way to move between two ' +
        'rooms that are made of nothing but arithmetic.',
      'At the time of writing, Floor 0, Floor −1, Floor −2 and Floor −3 exist and the lift runs ' +
        'between them, one floor at a time. The two floors below are written and not built, which ' +
        'is exactly why you can read them here and not walk into them. The distinction is kept on ' +
        'purpose: this is a place that tells you what it can and cannot do, and a hotel ' +
        'advertising rooms it does not have is worse than a hotel with four very good ones.',
      'The lift does not run while the hotel is shut. If you are here in daylight there is a ' +
        'control at the desk that opens the place anyway, and it opens the lift with it.',
    ],
  },

  {
    id: 'the-sun',
    heading: 'How the hour is decided',
    paragraphs: [
      'There is no location prompt, and there is not going to be one. A permission dialog in ' +
        'the first two seconds would kill the piece, and it is unnecessary: the browser will ' +
        'say which time zone it believes it is in, for free, without anyone being asked. That ' +
        'answer is a name — Europe/Lisbon, America/Argentina/Ushuaia — and a name is enough. It ' +
        'gives longitude almost exactly and latitude closely enough for twilight.',
      'A table here maps the zones that cover almost everybody onto a representative point. ' +
        'Where it has no entry, the zone’s offset from UTC stands in for longitude, the hotel ' +
        'assumes forty degrees north, and it says so, rather than claiming a precision it has ' +
        'not got.',
      'From a point and an instant, the rest is arithmetic that was finished in the eighteenth ' +
        'century: Julian day, the sun’s mean longitude, the equation of time, declination, hour ' +
        'angle, and out of the far end the angle of the sun above or below your horizon. No ' +
        'library was installed to do any of it. The equation of time alone — the fact that a ' +
        'sundial and a clock disagree by as much as a quarter of an hour depending on the ' +
        'month, because the Earth’s orbit is an ellipse and its axis is tilted — is a better ' +
        'thing to know than most of what a graphics card is doing here.',
      'The doors hang on that one angle. More than eighteen degrees below the horizon and the ' +
        'hotel is open. Between eighteen and twelve it is closing rooms behind you. Between ' +
        'twelve and six the desk begins mentioning the time. From six degrees up to the horizon ' +
        'is the aubade itself, and the countdown. And the hotel puts sunrise not at zero but at ' +
        'fifty minutes of arc below it — the sun’s own radius, plus the bend the atmosphere ' +
        'puts in its light — because the day begins when the upper edge clears the horizon, not ' +
        'the middle.',
    ],
    floors: [],
    coda: [],
  },

  {
    id: 'the-door',
    heading: 'The door, if you are early',
    paragraphs: [
      'If you are reading this in daylight the hotel is shut, and there is a control at the ' +
        'desk that opens it anyway. It is meant to be taken. The refusal is the idea; locking ' +
        'people out is only rudeness.',
      'What you get is the whole night piece with one mark on it. A line of daylight under the ' +
        'door, which stays, because you came in out of the sun and the building has not ' +
        'forgotten.',
    ],
    floors: [],
    coda: [],
  },

  {
    id: 'dawn',
    heading: 'Dawn',
    paragraphs: [
      'The ending happens once a day, to one person at a time, and cannot be asked for.',
      'A visitor still here when civil twilight runs out sees the place close: the count down ' +
        'to the exact minute, the light arriving almost level through the transom and crossing ' +
        'the whole floor, the rooms shutting in the order they are not being looked at, and ' +
        'then the shutter. It is not a failure state and it is not an animation on a timer. It ' +
        'is your sunrise, at your longitude, and it will not do it again until tomorrow.',
      'Whether you are there for it is not up to the hotel.',
    ],
    floors: [],
    coda: [],
  },
];
