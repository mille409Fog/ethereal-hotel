/**
 * Floor −3's five hours, four of which are the same hour, and the one field that
 * is not about the room.
 *
 * `light-rig.ts` is the original of this file and carries the reasoning all four
 * share: why the states are uniforms rather than five shaders, why they do not
 * blend, and why a light's direction is written down as the point it lands on
 * rather than as an angle. This file's shape is `library-rig.ts` almost exactly —
 * one spread constant, five entries, one moving number — and the recurrence is not
 * laziness. Two floors down, daylight has stopped being a thing that can arrive,
 * so both rooms have to answer the sun with something that is not light. There are
 * not many such answers and it is worth being honest that this is the second one.
 *
 * ## What the sun takes here is not in the room
 *
 * Floor −2's moving field is a property of the building: `inkStrength` is how much
 * gilt is left on the spines, and a visitor who could not see would still be in a
 * library with less writing in it.
 *
 * Floor −3's is a property of the visitor. **Nothing in this room ever changes.**
 * One tallow candle on a ledge, burning at exactly the strength it burns at every
 * hour, in a brick vault that has not been altered since it was dug. What changes
 * is how much of it a person standing still can eventually see — and that is real
 * physiology rather than a conceit. The eye takes about half an hour to adapt fully
 * to the dark and it does most of the interesting part in the first minute and a
 * half: sensitivity climbs by orders of magnitude, colour drains out because the
 * rods that are doing the work cannot tell colours apart, and the whole response
 * shifts towards the blue. Stand in a cellar long enough and it fills in around
 * you, having done nothing at all.
 *
 * `adaptation` is the ceiling on that, and it is the only field the hour moves. It
 * is the answer to a question the other three floors never have to ask: what has
 * the sun got to do with a room it cannot reach, and a visitor it cannot see?
 *
 * The answer this floor gives is that the sun has already reached them. A person
 * who arrives out of the daylight is not dark-adapted and will not become so while
 * the day is up — there is too much of it still in them. So the ceiling falls as
 * dawn comes on, and at `shuttered` it is **exactly zero**: the room a daytime
 * visitor walks into is the room they will still be standing in ninety seconds
 * later, and ninety minutes later, and it is one candle and about a metre of brick.
 * They are not being refused. They are simply not able, and the hotel does not
 * pretend otherwise.
 *
 * That exactness is checked. `check:docs` fails if it drifts off zero, for the same
 * reason it holds `inkStrength` to zero one floor up: a ceiling of 0.03 is a room
 * that resolves slightly, which is a room whose claim has quietly become a
 * gradient. Nothing, or it is not the argument.
 *
 * ## Which is why four of these five entries are identical
 *
 * They are meant to be, character for character, and `check:docs` fails if they
 * stop being. Every light in this room is the same at astronomical night and at
 * noon; the table is written out five times anyway, because the only way to say
 * "this floor's light does not answer the sun" in the shape the other three floors
 * use is to write it out and assert that it stayed written.
 *
 * Nothing here imports from `src/app/`, and the numbers are AUBADE's own.
 */

import type { AubadeState } from '../solar/state';
import type { Rgb } from './light-rig';

/**
 * Everything the cellar needs to know about the hour — which, on this floor, is
 * one number that is not about the cellar.
 *
 * Adding a field here means adding a uniform in `renderer.ts` and reading it in
 * `hotel.frag.ts`; `npm run verify:shader` fails if the three ever disagree,
 * because it asks the linked program which uniforms it actually declares.
 */
export interface ICellarRig {
  /** The state this rig dresses. */
  readonly state: AubadeState;

  /**
   * How far the dark will let this visitor get, at this hour: 0 is unadapted and
   * 1 is as far as ninety seconds of stillness goes.
   *
   * Multiplied by the stillness the visitor has actually earned — see
   * `cellar.ts`, which owns that half — so this is a ceiling and not a level. A
   * visitor at astronomical night who will not keep still sees exactly as little
   * as a visitor at noon who does.
   *
   * Monotonically non-increasing across the five states, darkest hour first, and
   * exactly zero at `shuttered`. The only field on this floor the sun moves.
   */
  readonly adaptation: number;

  /**
   * The candle. Tallow rather than wax: redder, dirtier, and about a third as
   * bright as the reading lamps two floors up, which is what makes the unadapted
   * room nearly black rather than merely dim.
   */
  readonly candleColour: Rgb;

  /**
   * How hard the candle is driven. Identical at all five hours, and low — this is
   * one flame in a barrel vault, and every part of the picture that is not within
   * about a metre of it is being carried by the visitor's own eye.
   */
  readonly candleStrength: number;

  /**
   * The stop into the tonemap, on this floor.
   *
   * Floor −2 has one of these for the reason its comment gives — `uExposure` is
   * applied to the whole frame whatever floor it is of, so the lobby's daytime stop
   * was reaching underground — and this floor needs one twice as badly, because the
   * gain that dark adaptation applies is multiplied on top of it. A leaked stop
   * that lifted the library by eight per cent would lift a fully adapted cellar by
   * rather more than that, and the one measurement this floor makes is a comparison
   * between its own two ends.
   *
   * Lower than every other floor's. The adaptation gain is what opens this room up;
   * the stop's job here is only to keep the candle from clipping before it starts.
   */
  readonly exposure: number;

  /** Bounce off the flags and the brick. Warmer than it looks, and almost nothing. */
  readonly ambientFloor: Rgb;

  /** Off the vault. The cool half — and this deep, there is no sky anywhere in it. */
  readonly ambientSky: Rgb;

  /**
   * Scattering in the air. Lower than the library's, which is the opposite of what
   * a cellar suggests and is deliberate: a haze is what makes a light source
   * *visible from a distance*, and this room's whole proposition is that the far
   * end of it is not visible until you have earned it. Air with a glow in it would
   * hand over the shape of the vault in the first second.
   */
  readonly dust: number;
}

/**
 * The light that does not change, written once and spread into all five rigs.
 *
 * Spread rather than referenced, so that each entry below is a complete rig a
 * reader can take in without assembling it — and so that the day somebody needs one
 * hour to differ, they change that hour rather than discovering that they cannot.
 */
const CONSTANT_LIGHT = {
  // Tallow. Redder than the gas upstairs and much redder than the reading lamps,
  // and the green channel is what carries that — at 0.52 this read as another
  // brass-and-tungsten fitting, which is the hotel's own palette and exactly what
  // the deepest room should not be furnished from.
  candleColour: [1.0, 0.42, 0.11] as Rgb,
  candleStrength: 1.5,
  // Below every other floor's, and it has to be: everything above this one is
  // graded for a room that is lit, and this one is graded for a room that is not,
  // with a gain of eleven waiting on top of it. See the field comment.
  //
  // Not lower still, and that is a floor rather than a preference. `verify:shader`
  // requires every committed frame to be an image — sixty distinct brightness
  // levels, which is its test for "a camera inside a wall" — and the unadapted
  // cellar is the darkest thing in the piece by a wide margin. At 0.82 it rendered
  // fifty and failed the gate: a room too dark to have tones in it is not an
  // atmosphere, it is a black rectangle with a candle drawn on it.
  exposure: 1.15,
  // Lower again than the library's, which were already described there as being
  // set well under what the room would really bounce. The argument compounds here:
  // ambient is what fills a room in evenly, and a room that fills in evenly cannot
  // resolve, because there is nothing left for the resolving to reveal.
  ambientFloor: [0.0075, 0.0058, 0.0042] as Rgb,
  ambientSky: [0.0052, 0.0055, 0.0068] as Rgb,
  dust: 0.85,
};

/** The five rigs, darkest hour first — the order `AUBADE_STATES` walks. */
export const CELLAR_RIGS: Readonly<Record<AubadeState, ICellarRig>> = {
  /**
   * Astronomical night, and the only hour at which this room can be seen at all.
   *
   * Ninety seconds of stillness and the whole vault is there: the ribs, the
   * niches, the casks along the north wall, the standing water at the low end, and
   * a far wall the visitor had no reason to think was there. None of it has moved
   * and none of it has been lit. This is the state the other four are measured
   * against, and it is the one anybody remembers.
   */
  open: {
    state: 'open',
    ...CONSTANT_LIGHT,
    adaptation: 1.0,
  },

  /**
   * The sky has started somewhere five floors up, and it is already in the way.
   *
   * Most of the room still arrives. What goes first is the far end — which is the
   * same sentence AUBADE writes about the corridor, "lights go out in the order you
   * are not looking", with nothing turned off and nobody looking away.
   */
  late: {
    state: 'late',
    ...CONSTANT_LIGHT,
    adaptation: 0.72,
  },

  /**
   * Nautical twilight, and the hour this floor becomes a bargain rather than a
   * gift. A minute and a half buys the vault directly overhead and the nearer
   * casks, and stops. A visitor can tell there is more and cannot get to it.
   */
  warning: {
    state: 'warning',
    ...CONSTANT_LIGHT,
    adaptation: 0.42,
  },

  /**
   * Civil twilight — the hour the hotel is named for. Almost nothing comes in. The
   * candle throws about a metre further than it did and the dark past that is the
   * same dark. What a visitor gets for ninety seconds here is the knowledge that
   * ninety seconds is not the variable.
   */
  aubade: {
    state: 'aubade',
    ...CONSTANT_LIGHT,
    adaptation: 0.16,
  },

  /**
   * Day, three floors underground, in a room the day has never entered.
   *
   * Exactly zero, and the exactness is the whole floor. A visitor who arrives out
   * of the afternoon can stand in this cellar perfectly still for as long as they
   * like and see precisely what they saw walking in: one candle, a ledge, a metre
   * of brick, and dark. Nothing is being withheld and no control is disabled —
   * the room is entirely willing and the visitor's own eyes are full of daylight.
   *
   * It is the piece's argument at its least sentimental. The other floors close
   * because the hotel closes. This one does not close at all; it is simply not
   * available to a person who has been outside.
   */
  shuttered: {
    state: 'shuttered',
    ...CONSTANT_LIGHT,
    adaptation: 0,
  },
};

/**
 * The cellar's rig for an hour, and for whether the visitor let themselves in.
 *
 * Mirrors `rigFor`, `corridorRigFor` and `libraryRigFor` exactly, and for the same
 * reason: AUBADE says the invitation "runs the full night piece", so a visitor who
 * opened the night rooms in daylight and then rode down three floors gets a cellar
 * that will resolve for them rather than one that refuses on a technicality.
 *
 * That is worth pausing on, because the fiction and the mechanism pull opposite
 * ways here and the mechanism has to win. The reason given above for a zero ceiling
 * at noon is that the visitor's own eyes are full of daylight — and a visitor who
 * clicked the invitation still has daylight in them. Taken literally, the
 * invitation could not open this floor at all.
 *
 * It opens anyway, because AUBADE's invitation is mandatory and reaches "the whole
 * work", and a floor that stayed dark through it would be the one room the piece
 * quietly withheld from every visitor who arrives during office hours — which is
 * most of them, and all of the ones it was built to be seen by. The mark the
 * invitation leaves is a line of daylight under the lobby's door, three floors up,
 * and it stays where it was left.
 *
 * @param state What the clock says the hotel is doing.
 * @param invited Whether the visitor opened the night rooms themselves. Ignored at
 *   every hour but the shuttered one; the caller is not required to know that.
 * @returns The rig to upload. Never null: every state has one, and an unknown value
 *   falls back to `open` rather than handing back a cellar nothing can open.
 */
export function cellarRigFor(state: AubadeState, invited = false): ICellarRig {
  const rig = CELLAR_RIGS[state] ?? CELLAR_RIGS.open;

  if (!invited || rig.state !== 'shuttered') {
    return rig;
  }

  return { ...CELLAR_RIGS.open, state };
}
