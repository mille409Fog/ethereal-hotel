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

import type { Floor } from './descent';
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

/**
 * The five hours on Floor −1.
 *
 * The corridor has no window, so its hours are told by what is left of its own
 * light rather than by what is coming through the wall — see
 * `rooms/corridor-rig.ts`, which is the same five states as numbers. The clerk's
 * voice is the same; what it has to report is the opposite. Upstairs the sky is
 * arriving. Down here the gas is going out.
 *
 * The same rule as everywhere else in this file: nothing states a clock time, and
 * nothing describes the missing reflection. That last one is not an oversight and
 * it is the most important sentence in the file. The phase's Definition of Done is
 * that a stranger reads the absence as deliberate *unprompted*, within ten
 * seconds; a plate that says "your light does not reflect" hands them the answer
 * and there is nothing left to notice. The prose describes the mirror, at length,
 * and never once says what is not in it.
 */
export const CORRIDOR_COPY: Readonly<Record<AubadeState, IDeskCopy>> = {
  open: {
    plate: 'Floor −1, at full gas. The doors are all shut and none of them are locked.',
    picture:
      'A hotel corridor below ground, drawn in real time. Seven gas sconces recede down the ' +
      'right-hand wall above a line of numbered doors; the whole left-hand wall is mirror in ' +
      'brass beading, and the corridor runs down it a second time.',
    opening:
      'The gas is up. Seven sconces down the right-hand wall, a door between each pair, and a ' +
      'red runner laid over the marble the length of the floor.',
  },

  late: {
    plate: 'The gas is being turned down. It starts at the far end, where you are not looking.',
    picture:
      'A hotel corridor below ground with its lamps dimmed, drawn in real time. The sconces at ' +
      'the far end have gone down first, and the end of the corridor is dark.',
    opening:
      'The gas has started going down, and it went at the far end first — which is the end you ' +
      'were not looking at.',
  },

  warning: {
    plate: 'Nautical twilight, five floors up. Down here the pools of light no longer meet.',
    picture:
      'A hotel corridor below ground, lit low. Each sconce now throws a separate pool with dark ' +
      'between them, and the mirrored wall repeats the line of them.',
    opening:
      'The pools under the sconces have stopped meeting. The corridor is a row of separate ' +
      'lights now, with dark between them, and twice as many of them in the glass.',
  },

  aubade: {
    plate: 'Civil twilight. The gas is nearly out, and something else is arriving.',
    picture:
      'A hotel corridor below ground, almost dark, drawn in real time. The last of the gas is ' +
      'orange and low, and a faint rose light lies across the runner at the far end where it ' +
      'has come down the lift shaft.',
    opening:
      'The gas is nearly out. At the far end, across the runner, there is a light on the floor ' +
      'the colour of the horizon, and it did not come from in here.',
  },

  shuttered: {
    plate: 'The gas is out. The lift shaft is letting the day in, and it is the only light left.',
    picture:
      'A hotel corridor below ground with its lamps out, drawn in real time. One hard blade of ' +
      'daylight comes through the gap above the lift doors at the far end and lies across the ' +
      'red runner. The mirrored wall carries it back down the corridor.',
    opening:
      'The gas is out. One blade of daylight through the gap above the lift doors, lying across ' +
      'the runner, and nothing else — the building went six floors down to be away from the sun ' +
      'and the sun came down the lift.',
  },
};

/**
 * The rooms in prose, one paragraph per element, per floor.
 *
 * Moved out of `aubade.html` when the second floor arrived, and not only because
 * two floors of hardcoded paragraphs behind an `@if` puts the template over the
 * complexity limit. The reason it belongs here is the one at the top of this file:
 * this is the file where the writing lives, and prose scattered through a template
 * is prose nobody reads end to end.
 *
 * The first paragraph of each is `opening` from the copy above, which is the only
 * part the sun moves; these are the rest, and they are true at every hour because
 * furniture is.
 */
export const FLOOR_PROSE: Readonly<Record<Floor, readonly string[]>> = {
  0: [
    'The door to the street is shut, and the transom above it is the only opening in the room. ' +
      'Everything that happens to the light in here happens through it.',
    'On the counter: a brass bell nobody rings, the register lying open at today, and a lamp ' +
      'with a green shade. Behind it, thirty-five pigeonholes and a key in none of them. The ' +
      'camera does not circle the room. It stands in it, and breathes.',
  ],

  '-1': [
    'The whole of the left-hand wall is mirror — not a mirror hung on a wall, a wall made of ' +
      'mirror, in sheets of plate the width of a door with brass beading between them and the ' +
      'silvering going at the edges. It runs the length of the floor. The corridor happens ' +
      'twice.',
    'On the right: seven doors with brass numbers, a sconce between each pair, a dado rail, and ' +
      'a runner worn paler down the middle by people who are not here. At the far end, the lift ' +
      'you came down in, with a gap above its doors.',
    'You are carrying a light. It is the only thing on this floor that is yours.',
  ],

  '-2': [
    'Both walls are shelved from the skirting to the cornice, in bays with a pilaster between ' +
      'each pair, and there is a run of lamps along the top of each case. That is why you can ' +
      'read the top shelf and the bottom shelf equally well — the light is a line rather than a ' +
      'point, which is how a library has always been lit.',
    'Four tables down the middle, far enough apart to be quiet, each with a brass lamp under a ' +
      'green shade. It is the same lamp that is on the desk two floors up. Somebody bought them ' +
      'at the same time.',
    'You set the light down somewhere on the way in. This room has its own, and it has never ' +
      'needed to borrow any.',
    'Cut into the frieze above the shelving, four times down each wall, is one sentence. It is ' +
      'said in eight languages and it will not hold still in any of them — every few seconds one ' +
      'line deforms into the next rather than being swapped for it. Two of the eight are written ' +
      'in the same alphabet, and that pair is the one worth waiting for.',
  ],

  '-4': [
    'The smallest room in the building, and the only one you have to walk round something to ' +
      'cross. A 35mm machine on a cast pedestal: lamphouse at the back, head in the middle, two ' +
      'magazines the size of dinner plates above and in front, and a lens pointed at a hole in ' +
      'the far wall. There is a second, smaller hole beside it at head height, for looking ' +
      'through.',
    'Nothing in here is lit in the ordinary sense. The lamp is shut inside its housing and what ' +
      'gets out comes down the vent slots in its flanks; the rest is what comes back through the ' +
      'port off a screen you cannot see. What you are actually looking at is three metres of ' +
      'dusty air with a projector shining through it.',
    'Down the left-hand wall, the bench: a top, a carcass, two rewind spindles and a reel on ' +
      'each. The six switches on it are real, they are yours, and every one of them changes ' +
      'something you can see. Throw them and watch what goes. What the sun operates is not on ' +
      'this bench and there is no switch for it.',
  ],

  '-5': [
    'Not a room you are in. A ledge two metres deep with a rail across the front of it, lined ' +
      'to the ceiling in red silk, two gilt chairs, and a shielded lamp on the rail for reading ' +
      'a libretto by. The lift is behind you. It is the only floor in this hotel where it is, ' +
      'because it is the only floor where the far end is the thing worth looking at.',
    'Over the rail: the house. At full dark it is thirty-four metres of it, with four tiers of ' +
      'boxes going away down both sides, a gilt arch round a stage at the end, and a chandelier ' +
      'hanging in the middle of the largest volume in this building. Most of it is too far off ' +
      'to resolve. That is not the graphics failing; it is what a theatre is.',
    'Something is being sung out there, and you cannot hear it. You can see it: the tiers move ' +
      'a little with the low notes, arriving late at the far end because sound takes a tenth of ' +
      'a second to cross a room this size, and the chandelier passes a shiver round its drops on ' +
      'the high ones. There is no sound on this floor and there is not going to be one today — ' +
      'the reason is written down, and it is about who wrote the music rather than about what a ' +
      'browser will play.',
    'What the sun does here is take the room away. Not the light — the room. Come back in ' +
      'daylight and the house is gone, the rail runs along the foot of a flat wall, and this is ' +
      'a red cupboard with two chairs in it and a lamp still lit.',
  ],

  '-3': [
    'A brick barrel vault, springing off the wall heads at about shoulder height and closing ' +
      'overhead in one unbroken curve the length of the room. It was laid a ring at a time from ' +
      'one end to the other, which is why the courses run round it rather than along it, and there ' +
      'is a century of saltpetre coming through the joints near the floor.',
    'Down the right-hand side, seven casks on stillages with iron hoops. Down the left, a corbel ' +
      'with a candle on it. At the far end, standing water and a boarded lift — the brass stops at ' +
      'the library; below that it is a service lift and nobody was ever going to see it.',
    'This is the only room in the hotel that asks you for something. It is not difficult and it is ' +
      'not short: stand still, and stay standing still. Every time you move you give some of it ' +
      'back.',
    'It is also the only room that is exactly the same for everybody who walks into it. What is ' +
      'different is what happens next, and that is not the same for everybody at all.',
  ],
};

/**
 * The five hours on Floor −2.
 *
 * The library is the one floor whose light does not answer the sun — see
 * `rooms/library-rig.ts`, where five of six fields are identical at all five hours
 * and the sixth is the whole idea. So this is the one set of five in this file
 * where the clerk cannot mention the light, because the light has not changed. It
 * has to describe a room getting quieter without getting darker, which is a harder
 * sentence and the reason this floor is worth having.
 *
 * The rule the rest of the file follows holds here too: nothing states a clock
 * time. And one more, particular to this floor — nothing says the word *dawn*. A
 * visitor who is told the writing goes at sunrise has been handed the connection;
 * one who takes the lift down at four in the morning, reads a shelf, and comes
 * back at noon to find the same shelf blank under the same lamps has made it
 * themselves, and will not forget it.
 */
export const LIBRARY_COPY: Readonly<Record<AubadeState, IDeskCopy>> = {
  open: {
    plate: 'Floor −2, and every shelf on both walls can be read from where you stand.',
    picture:
      'A below-ground reading room, drawn in real time. Bookcases run the length of both walls ' +
      'in bays, lit along their tops; four long tables recede down the middle, each with a lamp ' +
      'under a green shade. The gilt on the spines catches the light in two long lines.',
    opening:
      'Both walls are shelved to the cornice and every spine is lettered. Read any of them — ' +
      'this is the hour the room is for.',
  },

  late: {
    plate: 'The lettering is going at the far end. The lamps have not moved.',
    picture:
      'A below-ground reading room, drawn in real time. The bookcases and the reading lamps are ' +
      'exactly as bright as before, but the gilt on the more distant spines has begun to go.',
    opening:
      'Something is going from the far end of both walls, and it is not the light. The lamps are ' +
      'burning at exactly the strength they were. The titles down there are not.',
  },

  warning: {
    plate: 'Half the shelves have stopped saying what is on them.',
    picture:
      'A below-ground reading room, fully lit, drawn in real time. About half the spines still ' +
      'carry visible gilt; the rest are plain cloth in three colours, and the room is no darker ' +
      'for it.',
    opening:
      'About half of it is gone. You can still read the nearest bay, and you can see exactly how ' +
      'much you have lost by looking one bay further on.',
  },

  aubade: {
    plate: 'There is nothing left in here that can be read. Nothing has been turned off.',
    picture:
      'A below-ground reading room at full brightness, drawn in real time. The spines are bare ' +
      'cloth; a suggestion of gilt survives on a few of the nearest, and no title anywhere is ' +
      'legible.',
    opening:
      'What is left on the spines is the idea of lettering rather than lettering. Every lamp in ' +
      'the room is still lit. That is the part worth standing still for.',
  },

  shuttered: {
    plate: 'A fully lit library with nothing written in it.',
    picture:
      'A below-ground reading room, drawn in real time, lit exactly as it is at midnight. Every ' +
      'spine on both walls is blank cloth. There is no writing anywhere in the room.',
    opening:
      'Every lamp is burning. Both walls are full. Not one book on either of them says what it ' +
      'is, and none of them ever did at this hour.',
  },
};

/**
 * The five hours on Floor −3.
 *
 * The hardest set in the file, because the clerk cannot describe the light — it
 * has not changed — and cannot describe the room either, since the room has not
 * changed and is mostly not visible. What is different at each hour is how much of
 * it a person standing still is eventually going to get, and that is a fact about
 * the visitor rather than about the hotel. See `rooms/cellar-rig.ts`.
 *
 * So these five are written from the far side of the ninety seconds. They describe
 * what staying is worth tonight, and they get shorter and flatter as the sun comes
 * up, which is the only honest shape for the thing they are reporting.
 *
 * The rule the rest of the file keeps holds here: nothing states a clock time. And
 * one particular to this floor, inherited from the corridor's — **nothing explains
 * why it works.** The plate says what to do, because AUBADE's fourth failure mode
 * is a piece nobody can tell what to do with inside eight seconds and this floor
 * would fail it outright without an instruction. It does not say that the room is
 * unchanged and the change is in the reader's own eyes. A visitor who works that
 * out has been given something; a visitor who is told it has been given a caption.
 */
export const CELLAR_COPY: Readonly<Record<AubadeState, IDeskCopy>> = {
  open: {
    plate:
      'Floor −3. Nothing in this room is going to happen, and it takes about a minute and a half.',
    picture:
      'A brick barrel vault below ground, drawn in real time. One candle burns on a corbel on the ' +
      'left-hand wall; a row of casks on iron-hooped stillages recedes down the right, and the far ' +
      'end of the room is dark.',
    opening:
      'One candle, on a ledge, on the left. Everything else in here is a rumour. Stand still and ' +
      'the rest of it arrives — all of it, tonight — and moving costs you some of what you have.',
  },

  late: {
    plate: 'Most of it will still come, and the far end will not.',
    picture:
      'A brick barrel vault below ground, drawn in real time. The candle and the near casks are ' +
      'visible; the far end of the vault stays dark.',
    opening:
      'Stand still and most of this will come in. Not the far end — that has gone tonight, and it ' +
      'went the way everything in this hotel goes, which is quietly and from the end you are not ' +
      'looking at.',
  },

  warning: {
    plate:
      'The vault overhead and the nearest casks. That is what a minute and a half is worth now.',
    picture:
      'A brick barrel vault below ground, drawn in real time. Only the bay above the candle and ' +
      'the two nearest casks emerge from the dark.',
    opening:
      'You can have the vault directly above you and the two nearest casks. You can tell there is ' +
      'more. You are not going to get it, and standing here longer is not the variable.',
  },

  aubade: {
    plate: 'A metre further than the candle throws. It is not the waiting that is short.',
    picture:
      'A brick barrel vault below ground, almost entirely dark, drawn in real time. A little more ' +
      'brickwork around the candle is visible than on arrival, and nothing else is.',
    opening:
      'Ninety seconds here buys about a metre. What is left of the room past that is the same dark ' +
      'it was when you came in, and it is going to stay that way for as long as you can bear to ' +
      'stand in it.',
  },

  shuttered: {
    plate: 'The room is perfectly willing. You came in out of the daylight.',
    picture:
      'A brick barrel vault below ground, drawn in real time, lit by one candle exactly as it is ' +
      'at midnight. Almost none of the room is visible.',
    opening:
      'The candle is burning at exactly the strength it burns at three in the morning, and this is ' +
      'the whole of what you are going to see. Nothing has been turned off and nothing is being ' +
      'kept from you. You can stand here all afternoon.',
  },
};

/**
 * The five hours on Floor −4.
 *
 * The clerk cannot describe the light on this floor either — the arc is the same arc
 * at every hour, in the same room, throwing the same beam through the same port — and
 * cannot describe the room, which has not moved. What changes here is a *rate*, which
 * is the hardest thing in the piece to write about, because a rate cannot be seen in
 * a sentence any more than it can be seen in a photograph.
 *
 * So these five describe the machine rather than the picture, and they name the
 * numbers. Twenty-four, eighteen, twelve, eight, and then nothing. A visitor who
 * reads "twelve frames a second" and looks up at the beam has been given the one
 * piece of information that makes the room legible in the eight seconds AUBADE's
 * fourth failure mode allows.
 *
 * The rule the rest of this file keeps holds here: nothing states a clock time. And
 * one particular to this floor, inherited from the corridor's — **nothing says what
 * the stack is being applied to.** The switches on the bench answer that in one
 * click, faster and better than a sentence could, and a visitor who throws the grain
 * switch and watches the entire frame go clean has found something rather than been
 * told it.
 */
export const PROJECTION_COPY: Readonly<Record<AubadeState, IDeskCopy>> = {
  open: {
    plate: 'Floor −4, running at twenty-four. The machine is right and the print is holding.',
    picture:
      'A projection box below ground, drawn in real time. A 35mm projector stands on a cast ' +
      'pedestal with a magazine above it and another in front; its beam crosses three metres of ' +
      'dusty air and goes out through a port in the far wall. A bench with two rewind reels runs ' +
      'down the left-hand side.',
    opening:
      'Twenty-four frames a second, which is the rate and has been since sound. The beam is ' +
      'continuous, the picture in it changes twenty-four times while you read this line, and ' +
      'none of that is anything you can point at.',
  },

  late: {
    plate: 'Eighteen. That is silent speed, and it is the last rate that is still a rate.',
    picture:
      'A projection box below ground, drawn in real time. The projector is running slower than ' +
      'it should; the beam through the port steps visibly rather than flowing.',
    opening:
      'It has dropped to eighteen — silent speed, what everything ran at before sound fixed the ' +
      'number. You can see the step now. Nothing has been turned down and nothing is dimmer.',
  },

  warning: {
    plate: 'Twelve frames a second. Somewhere around here you stop watching and start counting.',
    picture:
      'A projection box below ground, drawn in real time. The beam through the port is a series ' +
      'of separate states rather than a moving picture, and the room steps with it.',
    opening:
      'Twelve. This is the rate at which the eye gives up assembling the frames into movement and ' +
      'begins counting them instead. The lamp has not moved. What is going is the continuity, and ' +
      'it goes out of the middle of the movement rather than off either end of it.',
  },

  aubade: {
    plate: 'Eight. Every frame is an event now, with a gap on both sides of it.',
    picture:
      'A projection box below ground, drawn in real time. The projector is barely running; each ' +
      'frame of the beam holds for an eighth of a second before the next one arrives.',
    opening:
      'Eight frames a second, and each one of them stands there long enough to be looked at. The ' +
      'beam is exactly as bright as it was at midnight and the room is exactly as dark. Nobody is ' +
      'touching the machine.',
  },

  shuttered: {
    plate: 'The film stopped some time ago. The lamp did not.',
    picture:
      'A projection box below ground, drawn in real time. One frame is standing still in the ' +
      'gate with the lamp behind it and has burned through: a hole with a scorched ring around ' +
      'it, and the whole undiffused arc coming out of the middle of it.',
    opening:
      'One frame has been standing in the gate with an arc behind it for longer than a frame can. ' +
      'It has gone through the middle, and what is coming out of the hole is the entire lamp with ' +
      'nothing left in front of it. Whoever was in this box went home when the sun came up.',
  },
};

/**
 * The five hours on Floor −5, in the Box's voice.
 *
 * The one floor whose plate has to describe something that is not in the room, and
 * at four of the five hours most of what it says is about a space on the other side
 * of a rail. At the fifth it is about a wall.
 */
export const BOX_COPY: Readonly<Record<AubadeState, IDeskCopy>> = {
  open: {
    plate: 'Floor −5. The house is full depth tonight, and there is nobody in any of it.',
    picture:
      'An opera box below ground, drawn in real time. A red silk-lined ledge with a gilt rail ' +
      'and two chairs; beyond the rail, an auditorium some thirty-four metres deep, four tiers ' +
      'of boxes going away into the dark on both sides, a gilt proscenium at the far end, and a ' +
      'gas chandelier hanging in the middle of it.',
    opening:
      'The house is at its full depth and you cannot see the back of it. There are four tiers ' +
      'of boxes down each side and nobody in one of them, and the chandelier is far enough away ' +
      'to be a small thing rather than a bright one.',
  },

  late: {
    plate: 'The back wall has become findable. It was not there an hour ago.',
    picture:
      'An opera box below ground, drawn in real time. The auditorium beyond the rail is ' +
      'noticeably shallower than a house of this height should be; its far wall is close enough ' +
      'to make out.',
    opening:
      'You can see the back of the house now. Nothing has been lit and nothing has been turned ' +
      'up — the wall is simply nearer than it was, which is not a thing walls do, and it is the ' +
      'first hour at which anybody who was here at midnight can tell.',
  },

  warning: {
    plate: 'Thirteen metres. Close enough to count the seats on the opposite tier.',
    picture:
      'An opera box below ground, drawn in real time. The opposite tier of boxes is close ' +
      'across a narrowed auditorium, and the chandelier hangs near enough to read as an object ' +
      'rather than as a light.',
    opening:
      'The tier opposite is near enough to count. The chandelier has stopped being a light and ' +
      'become a thing with parts, which is what happens to any light you get close enough to, ' +
      'and it is getting closer because the room is.',
  },

  aubade: {
    plate: 'Six metres. The back wall is close enough to touch, if the rail were not there.',
    picture:
      'An opera box below ground, drawn in real time. The auditorium has closed to a shallow ' +
      'recess a few metres deep; its back wall stands close behind the gilt rail, and the ' +
      'chandelier has gone up out of the frame.',
    opening:
      'What was a hall at midnight is a recess. The back wall is a few metres beyond the rail, ' +
      'the chandelier has risen out of sight overhead rather than moved, and the singing is ' +
      'still going on out there in a space with almost nowhere left to be.',
  },

  shuttered: {
    plate: 'The house has gone. The rail is still here, and so is the lamp.',
    picture:
      'An opera box below ground, drawn in real time. A flat wall stands directly behind the ' +
      'gilt rail where the auditorium was. The room is a shallow red velvet cupboard with two ' +
      'chairs in it, lit by one small shaded lamp on the rail.',
    opening:
      'There is a wall behind the rail. Not a dark auditorium and not a shallow one — nothing, ' +
      'bricked flush, with the balustrade running along the foot of it. What is left is about ' +
      'two metres of red velvet, two chairs, and a reading lamp that is still lit, and it takes ' +
      'a while in here to work out what the room was ever for.',
  },
};

/**
 * The projectionist's bench: six switches, and one number that is not a switch.
 *
 * AUBADE asks for the film stack to be "exposed as a projectionist's bench you can
 * operate", and this is the operable half of that — the other half is the actual
 * bench, in the room, in `hotel.frag.ts`. Every label here names the mechanism rather
 * than the effect, because that is the difference between a bench and a filter menu:
 * "gate weave" is a thing a gate does, and "camera shake" is a thing an editor
 * chooses.
 *
 * The rate is deliberately not among them, and the line under it says so. The bench
 * operates the apparatus; the sun operates the film. A visitor who could wind the
 * projector back up to twenty-four at noon would have been handed this floor's whole
 * answer to the clock in one click, which is the one thing none of the five rooms
 * lets anybody do.
 */
export const BENCH_COPY = {
  /** The heading over the controls. */
  heading: 'The bench',

  /**
   * Under the heading, once, before the switches.
   *
   * "Start on" rather than "are on", which is the difference between a description
   * and a claim that stops being true the moment somebody uses the thing it is
   * describing.
   */
  hint: 'Six things a projector does to a picture. All of them start on. None has to be.',

  /** The plate beside the switches, when the machine is running. */
  running: (rate: number): string => `Running at ${rate} frames a second`,

  /** The same plate when it is not. */
  stopped: 'Stopped, with the lamp on',

  /** Under the plate, at every hour. The line that makes the bench a bench. */
  fixed: 'Not on this bench. The hour sets the rate.',

  /**
   * The six, in the order `FILM_STACK` lists them. Each is a mechanism and a
   * sentence about what that mechanism is for — short, because a caption on a
   * control is read standing up.
   */
  effects: {
    weave: {
      label: 'Gate weave',
      note: 'The frame is held by pins and pulled by a claw, and neither is perfect.',
    },
    halation: {
      label: 'Halation',
      note: 'Light gets through the emulsion, bounces off the back of the base, and comes up again.',
    },
    grain: {
      label: 'Grain',
      note: 'Clumps of silver, redrawn once per frame of film rather than once per frame of screen.',
    },
    judder: {
      label: 'Judder',
      note: 'The picture does not move. It is replaced, at a rate, and the rate is the room.',
    },
    splices: {
      label: 'Splice flashes',
      note: 'Two thicknesses of base pass more light than one. This print is mostly joins.',
    },
    cues: {
      label: 'Cue dots',
      note: 'Top right, four frames, twice — eight seconds apart. A machine talking to a person.',
    },
  },
} as const;

/**
 * What the plate says about how far into the room the visitor has got.
 *
 * The one piece of copy in AUBADE that reports a mechanism, and it is here because
 * without it the floor is a black rectangle that a visitor leaves after four
 * seconds. AUBADE's fourth failure mode is a piece that is impressive and
 * unreadable — "ambiguity is a choice; confusion is a bug" — and a room whose whole
 * content is on the far side of ninety seconds of doing nothing has to say so.
 *
 * It says what to do and stops. It does not say what will happen, and it never says
 * that the room is unchanged; that is the thing the floor is for and it is left
 * where a visitor can find it.
 */
export const STILLNESS_COPY = {
  /** On arrival, and after any disturbance has cost enough to matter. */
  waiting: 'You have only just come in. Stand still.',

  /** While it is coming. */
  arriving: 'It is coming. Keep still.',

  /** All the way in — as far as tonight goes, which is not always all the way. */
  settled: 'That is the whole of what tonight had.',

  /**
   * Day. The ceiling is exactly zero, so there is nothing to report and saying
   * "keep still" would be a lie told to somebody being patient.
   */
  daylit: 'Standing still will not do anything here today.',
} as const;

/**
 * The lift, in the two directions it goes and the one state it will not be argued
 * with in.
 *
 * AUBADE calls the elevator a room rather than a transition and asks for the morph
 * to be "visible and unhurried". The control is disabled while the car is moving,
 * and the line that replaces it says so in the building's own voice rather than as
 * a status message, because a piece that lets you skip its one transition has
 * decided the transition was in the way.
 */
export const LIFT_COPY = {
  /** The offer, at the desk. */
  down: 'Take the lift down',

  /** The offer, in the corridor. */
  up: 'Take the lift up',

  /** While the car is moving, in place of the control. */
  moving: 'The lift is moving. It will not be hurried.',

  /**
   * Shown at the desk while the hotel is shut and the visitor has not let
   * themselves in. The lift is the one thing the invitation actually gates, and
   * that is the point of it: the refusal has to cost something or it is set
   * dressing.
   */
  shut: 'The lift does not run while the hotel is shut.',
} as const;

/**
 * What the plate says about the state of the render itself, or `null` when the
 * room is simply running and there is nothing to report.
 *
 * Here rather than in the template for the reason at the top of this file, and
 * because three of these are the only sentences in the piece that describe the
 * software rather than the building — which makes them the three most likely to be
 * written carelessly. They are the hotel's voice about its own machinery, and the
 * last one is load-bearing: AUBADE's fourth non-negotiable is that the piece tells
 * the visitor what it did rather than degrading quietly.
 */
export const RENDER_NOTES = {
  /** The renderer's chunk is in flight. */
  opening: 'Unlocking the lobby…',

  /** The room, breathing. Nothing to say. */
  running: null,

  /** `prefers-reduced-motion`. The camera has stopped, not slowed. */
  still: 'You asked for less motion, so the rooms are holding their breath.',

  /** No WebGL2, or a driver that would not take the shader. */
  closed:
    'This browser has no WebGL2, so the rooms will not open for it. They are written out below ' +
    'instead; they are the same rooms.',
} as const;

/** What each floor calls itself, on the plate over the room. */
export const FLOOR_NAMES: Readonly<Record<Floor, string>> = {
  0: 'Floor 0 — The Desk',
  '-1': 'Floor −1 — The Mirror Corridor',
  '-2': 'Floor −2 — The Library',
  '-3': 'Floor −3 — The Cellar',
  '-4': 'Floor −4 — The Projection Room',
  '-5': 'Floor −5 — The Box',
};

/**
 * The way out of the lobby and into the Reader's Edition.
 *
 * AUBADE's first non-negotiable requires this link on *every* screen, and the
 * lobby is deliberately two of them — the plate over the room, and the prose one
 * scroll down. So it appears twice, with one label, because two labels for one
 * destination is how a reader ends up wondering whether they are two places.
 *
 * The offer is for the second appearance only, where somebody has just finished
 * the four paragraphs about this room and is owed a reason to want the other
 * five floors. On the plate the label stands alone; the plate is spare on
 * purpose.
 */
export const READER_CUE = {
  /** The link text, in both places. */
  label: 'The Reader’s Edition',

  /** The line above it at the foot of the prose. */
  offer:
    'The rest of the hotel — the other five floors, the poem it is named after, and how the ' +
    'hour is decided — is written out in full, and needs no graphics card at all.',
} as const;

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
