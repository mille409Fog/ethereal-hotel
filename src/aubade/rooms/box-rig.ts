/**
 * Floor −5's five hours, and the one field in them that is a length.
 *
 * `light-rig.ts` is the original of this file and carries the reasoning all six
 * share: why the states are uniforms rather than six shaders, why they do not blend,
 * and why a light's direction is written down as the point it lands on rather than
 * as an angle. What is worth saying here is the one thing that is different, and on
 * this floor it is not a light and it is not a rate. It is the size of the room.
 *
 * ## The sixth answer had to be a sixth kind of answer
 *
 * Five floors have replied to the same question and none of them may be repeated.
 * Floor 0 has a window and brightens as the night ends. Floor −1 has none and its
 * gas is turned down, so it does the reverse. Floor −2 keeps its lamps and loses its
 * writing. Floor −3 does not change at all and what moves is the visitor's own eye.
 * Floor −4 holds every light exactly where it was and slows the film until it stops.
 *
 * A sixth dimmer would have been AUBADE's first failure mode arriving one floor at a
 * time, and so, by now, would a sixth weight in [0, 1] that goes to zero at noon —
 * three of the five above already have one of those, and a fourth would be the same
 * answer in a different hat. So this floor answers with the one thing every floor
 * above it holds constant, which is **space**.
 *
 * **The house closes in.** At astronomical night the balustrade of this box gives
 * onto an auditorium thirty-four metres deep — by a long way the largest volume in
 * the building, most of it too dark to resolve, with a chandelier hanging in the
 * middle of it and tiers of boxes going away on both sides. As the night ends the
 * far wall comes towards the box. By civil twilight the opposite tier is close
 * enough to count the seats on. And at the shuttered hour `house` is **exactly
 * zero**: there is no auditorium at all, the front wall is solid and flush with the
 * balustrade, and the Box is a sealed velvet cupboard with a wall where the opera
 * was.
 *
 * That is why this field is in metres and not in [0, 1], and the difference is not
 * cosmetic. `uInk`, `uAdaptation` and `uBurn` are weights on things that are there
 * either way; this is a dimension of the room, and at zero the geometry it describes
 * does not get dimmer or thinner — it stops existing, and `mapBox` stops evaluating
 * it. The daytime picture on this floor is cheaper to draw than the night one, which
 * is true of no other room in the hotel.
 *
 * ## What that buys the daytime picture
 *
 * A second picture rather than a dark one, which is AUBADE's standing requirement
 * for every shuttered state and the thing a sixth dimmer could not have delivered
 * here. The box keeps its own light at every hour — a shielded libretto lamp on the
 * balustrade, the sort of thing a box has so somebody can follow the words without
 * lighting the house — so at noon the room is small, close, red, and perfectly well
 * lit by a lamp eight centimetres across. Everything that was worth looking at was
 * on the other side of a wall that is now solid.
 *
 * The chandelier is not in that picture, and it is not switched off either. It hangs
 * in the auditorium, and at noon there is no auditorium, so `mapBox` never reaches
 * it. Nothing in this table turns it out.
 *
 * ## Which is why seven of these eight entries are identical
 *
 * They are meant to be, character for character, and `check:docs` fails if they stop
 * being. Every light in this room is the same at astronomical night and at noon; the
 * table is written out five times anyway, because the only way to say "this floor's
 * light does not answer the sun" in the shape the five floors above use is to write
 * it out and assert that it stayed written.
 *
 * Nothing here imports from `src/app/`, and the numbers are AUBADE's own.
 */

import type { AubadeState } from '../solar/state';
import type { Rgb } from './light-rig';

/**
 * Everything the Box needs to know about the hour — which, on this floor, is how
 * much room there is beyond the balustrade.
 *
 * Adding a field here means adding a uniform in `renderer.ts` and reading it in
 * `hotel.frag.ts`; `npm run verify:shader` fails if the three ever disagree, because
 * it asks the linked program which uniforms it actually declares.
 */
export interface IBoxRig {
  /** The state this rig dresses. */
  readonly state: AubadeState;

  /**
   * How deep the auditorium is beyond the balustrade, in metres.
   *
   * The floor's answer to the sun, and the only field in this table that is a
   * dimension rather than a light. `hotel.frag.ts` builds the house out from the
   * balustrade by this much and skips the whole of it when it is zero.
   *
   * Monotonically non-increasing across the five states, darkest hour first, and
   * **exactly zero at `shuttered`** — not nearly zero. A house two centimetres deep
   * is a house: it is a slot in the wall with a chandelier jammed in it, and it is
   * this floor's argument turned into a gradient at the one hour the argument is
   * about.
   */
  readonly house: number;

  /**
   * The chandelier, out in the house. Gas, like everything else in this building
   * that is not the projector's arc, and hung far enough away that what it mostly
   * does in frame is silhouette the tiers rather than light them.
   *
   * Identical at all five hours. At `shuttered` there is nothing for it to hang in
   * and `mapBox` never asks.
   */
  readonly chandelierColour: Rgb;

  /** How hard it is driven. Identical at all five hours. */
  readonly chandelierStrength: number;

  /**
   * The libretto lamp on the balustrade: shielded, turned inward, and the only light
   * in the building whose job is to be read by rather than looked at.
   *
   * Identical at all five hours, and it is what makes the shuttered state a picture
   * instead of a dark rectangle. See the file comment.
   */
  readonly librettoColour: Rgb;

  /** How hard that one is driven. Low — it lights a page, not a room. */
  readonly librettoStrength: number;

  /**
   * The stop into the tonemap, on this floor.
   *
   * Floors −2, −3 and −4 have one each for the reasons their comments give —
   * `uExposure` is applied to the whole frame whatever floor it is of, so the lobby's
   * daytime stop reaches underground — and this floor needs one for a fourth reason
   * on top of those. Its two pictures differ by four orders of magnitude of volume:
   * a thirty-four metre hall lit by one chandelier and a two-metre cupboard lit by a
   * reading lamp. A single stop that suits either is a stop that ruins the other,
   * and this is the one that suits both, which is most of what the number was chosen
   * for.
   */
  readonly exposure: number;

  /** Bounce off the carpet and the velvet. Warm, and there is a lot of red in it. */
  readonly ambientFloor: Rgb;

  /** Off the ceiling of the box. The cool half, and this deep there is no sky in it. */
  readonly ambientSky: Rgb;

  /**
   * Scattering in the air.
   *
   * High, and for a reason particular to this room rather than to this hotel: an
   * auditorium is the one interior whose far end is routinely *invisible through its
   * own air*, and that is not a defect of the building but the reason a theatre feels
   * large. With the dust low, thirty-four metres of house reads as a wall thirty-four
   * metres away; with it up, it reads as a distance.
   */
  readonly dust: number;
}

/**
 * The light that does not change, written once and spread into all five rigs.
 *
 * Spread rather than referenced, so that each entry below is a complete rig a reader
 * can take in without assembling it — and so that the day somebody needs one hour to
 * differ, they change that hour rather than discovering that they cannot.
 */
const CONSTANT_LIGHT = {
  // Gas, burning in a hundred-odd jets a long way off. Warmer than the corridor's
  // sconces and much warmer than the projector's arc, and the red is what carries in
  // a room where almost every surface it lands on is already red.
  chandelierColour: [1.0, 0.62, 0.28] as Rgb,
  // Low, and it took a rendered frame to find out how low. A chandelier is the only
  // light in a volume this size, so the temptation is to drive it hard enough to
  // reach the back — and a light that reaches the back of a thirty-four metre hall
  // has lit every surface in it evenly, which renders as a beige daylit room with a
  // ring of bulbs in it. That is the failure AUBADE's own additions note calls out
  // by name, and this floor is more prone to it than any other because it has the
  // most volume to fill and the least excuse not to.
  //
  // What makes the house read as deep is not the light reaching the back. It is the
  // light *failing* to.
  chandelierStrength: 1.35,
  // Cooler and much smaller. A shielded lamp with a paper shade, close enough to the
  // balustrade that its own housing is the brightest thing in the near half of the
  // frame — which is the composition, not an accident.
  librettoColour: [1.0, 0.78, 0.52] as Rgb,
  // It has two jobs and the second one is what set the number. At night it models
  // the near half of the frame — the rail, the chair backs, the velvet the visitor
  // is sitting against — without which the bottom third of every night frame is a
  // dead black bar and this floor's whole composition, the near dark against the far
  // light, has only one of its two halves in it.
  //
  // At noon it is the only light on the floor, and the entire daytime picture. See
  // the file comment: a sealed velvet cupboard lit by nothing is not the second
  // picture AUBADE asks every shuttered state for, it is an unlit room.
  librettoStrength: 2.6,
  // The night-side stop the whole building is graded at, pulled down a little because
  // this floor's night picture is a large dark volume with one bright thing in it and
  // the lobby's 1.15 clips the chandelier into a disc. See the field comment for the
  // other half of what this number has to survive.
  exposure: 1.04,
  // Unusually red, and lower than it first looks like it should be — which is the
  // opposite of the reasoning this table was written with, and the frame settled it.
  //
  // The argument for a high ambient was that velvet and carpet within two metres of
  // the camera bounce far more than the cellar's brick does, and that is true of the
  // box. It is not true of the house, and ambient in this shader is a property of the
  // *floor* rather than of the surface — so a value chosen for a two-metre upholstered
  // room was being applied to a thirty-four metre hall, where it acted as a light
  // floor under everything and made the far wall as legible as the near tier. A room
  // in which nothing can be too far away to see is a room with no depth in it,
  // whatever its dimensions say.
  //
  // So this is set for the house, and the box gets its red from the velvet's sheen
  // term instead — which is a property of the material, exactly where it belongs.
  ambientFloor: [0.0132, 0.0074, 0.007] as Rgb,
  ambientSky: [0.0082, 0.0076, 0.0094] as Rgb,
  dust: 2.2,
};

/** The five rigs, darkest hour first — the order `AUBADE_STATES` walks. */
export const BOX_RIGS: Readonly<Record<AubadeState, IBoxRig>> = {
  /**
   * Astronomical night, and the house at its full depth.
   *
   * Thirty-four metres, which is about the depth of a real house of this shape and
   * is far enough that its own air takes the back of it. The chandelier is a long
   * way out and a long way up, the tiers go away on both sides into something the
   * march cannot resolve, and the largest volume in this building is the one nobody
   * can see the end of.
   */
  open: {
    state: 'open',
    ...CONSTANT_LIGHT,
    house: 34,
  },

  /**
   * The sky has started five floors up, and the back wall of the house has become
   * findable.
   *
   * Twenty-two metres. Nothing has moved in the box and nothing has dimmed anywhere;
   * the room beyond it is smaller than it was, which is not a thing rooms do, and is
   * the first hour at which a visitor who was here at midnight can tell.
   */
  late: {
    state: 'late',
    ...CONSTANT_LIGHT,
    house: 22,
  },

  /**
   * Nautical twilight. Thirteen metres, and the chandelier is now close enough to be
   * an object rather than a light.
   *
   * This is the hour the effect stops being ambiguous. At thirty-four metres a
   * visitor is looking at a dark hall; at thirteen they are looking at the opposite
   * tier, and the thing they noticed was that it arrived.
   */
  warning: {
    state: 'warning',
    ...CONSTANT_LIGHT,
    house: 13,
  },

  /**
   * Civil twilight — the hour the hotel is named for, and the hour this floor was
   * built for.
   *
   * Six metres. The opposite tier is across a gap a person could nearly step over,
   * the chandelier is at eye level and too close to look at, and the house that was
   * a hall at midnight is now a light well. An aubade is a song about being parted at
   * daybreak, and this is the room where the thing being taken away is measurable in
   * metres per hour.
   */
  aubade: {
    state: 'aubade',
    ...CONSTANT_LIGHT,
    house: 6,
  },

  /**
   * Day, five floors underground, in a box with a wall across the front of it.
   *
   * Exactly zero, and the exactness is the whole floor. Not a dark auditorium, not a
   * shallow one — none. The balustrade runs along the foot of a flat wall, the two
   * chairs face it, the libretto lamp is still lit, and the room is a red cupboard
   * about two metres deep that a person could stand in for a long time without
   * working out what it is for.
   *
   * It is the piece's argument in its most literal form. The other five floors close
   * because the hotel closes. This one closes by having the opera taken out of it and
   * the hole bricked up, which is what a building does to a room it has stopped
   * using, and the sun is what stopped it.
   */
  shuttered: {
    state: 'shuttered',
    ...CONSTANT_LIGHT,
    house: 0,
  },
};

/**
 * The Box's rig for an hour, and for whether the visitor let themselves in.
 *
 * Mirrors `rigFor`, `corridorRigFor`, `libraryRigFor`, `cellarRigFor` and
 * `projectionRigFor` exactly, and for the same reason: AUBADE says the invitation
 * "runs the full night piece", so a visitor who opened the night rooms in daylight
 * and then rode down five floors gets a house to look into rather than a wall.
 *
 * That matters more here than on any floor above it, and it is worth saying why.
 * Everywhere else the shuttered state is a room with something in it — a shuttered
 * lobby, a corridor with a blade of day in it, a lit library, a dark cellar, a
 * stopped projector. Down here it is a room with the subject removed, and a visitor
 * handed it as their only view of Floor −5 has been shown a cupboard and told it was
 * an opera house. The invitation is what makes it the second of two pictures rather
 * than the only one.
 *
 * @param state What the clock says the hotel is doing.
 * @param invited Whether the visitor opened the night rooms themselves. Ignored at
 *   every hour but the shuttered one; the caller is not required to know that.
 * @returns The rig to upload. Never null: every state has one, and an unknown value
 *   falls back to `open` rather than handing back a room with no dimensions.
 */
export function boxRigFor(state: AubadeState, invited = false): IBoxRig {
  const rig = BOX_RIGS[state] ?? BOX_RIGS.open;

  if (!invited || rig.state !== 'shuttered') {
    return rig;
  }

  return { ...BOX_RIGS.open, state };
}
