/**
 * Floor −4's five hours, four of which are the same light at four different speeds.
 *
 * `light-rig.ts` is the original of this file and carries the reasoning all five
 * share: why the states are uniforms rather than five shaders, why they do not
 * blend, and why a light's direction is written down as the point it lands on rather
 * than as an angle. What is worth saying here is the one thing that is different,
 * and on this floor it is not in the room at all.
 *
 * ## The fifth answer had to be a different kind of answer
 *
 * Four floors have already replied to the same question. Floor 0 has a window and
 * gets brighter as the night ends. Floor −1 has none and its gas is turned down, so
 * it does the reverse. Floor −2 does neither: its lamps are identical at every hour
 * and what the sun takes is the writing. Floor −3 does not change at all and what
 * the sun moves is the visitor's own eye.
 *
 * A fifth dimmer switch would have been AUBADE's first failure mode arriving one
 * floor at a time — six rooms of unrelated effects with a hotel painted on. So this
 * floor answers with the one dimension a projection box has that none of the others
 * do, which is **time**.
 *
 * **The projector slows down, and then it stops.** Twenty-four frames a second at
 * astronomical night, eighteen, twelve, eight, and at the shuttered hour the machine
 * is stopped dead with the lamp still on. Nothing about the light changes: the same
 * arc, at the same strength, in the same room, throwing the same beam through the
 * same port at every hour of the day. What changes is how often the picture is
 * pulled — and at noon it is not pulled at all.
 *
 * That is the whole of `rate`, and it is why this table has a field in it that no
 * other floor's rig has: a number that is not about light.
 *
 * ## What a stopped frame does
 *
 * It burns. A strip of nitrate or acetate held motionless in front of an arc cooks
 * within seconds; a hole opens outward from the lamp's hot spot, and what comes
 * through the hole is the whole undiffused lamp with no picture left to modulate it.
 *
 * `burn` is that, and it is **exactly zero at every hour but the shuttered one**,
 * where it is exactly one — the same shape the corridor's `shaftStrength` has, and
 * for a related reason. It is not a fifth point on a ramp. It is the daytime piece:
 * AUBADE asks for a day state that stands alone, "blown-out highlights, bleached
 * palette, everything over-exposed to the edge of white", and a burning frame is
 * that specification arrived at from the mechanism rather than from the palette. A
 * visitor who takes the lift down here at noon finds a room whose one job has already
 * failed, quietly, some time before they arrived.
 *
 * Both exactnesses are checked, for the same reason `inkStrength` and `adaptation`
 * are: a rate of 0.4 is a projector that crawls, which looks entirely plausible and
 * has quietly turned this floor's argument into a gradient, and a burn of 0.05 at
 * astronomical night is a print that is always slightly on fire.
 *
 * ## Which is why six of these seven entries are identical
 *
 * They are meant to be, character for character, and `check:docs` fails if they stop
 * being. Every light in this room is the same at astronomical night and at noon; the
 * table is written out five times anyway, because the only way to say "this floor's
 * light does not answer the sun" in the shape the other four floors use is to write
 * it out and assert that it stayed written.
 *
 * Nothing here imports from `src/app/`, and the numbers are AUBADE's own.
 */

import type { AubadeState } from '../solar/state';
import type { Rgb } from './light-rig';

/**
 * Everything the projection box needs to know about the hour — which, on this
 * floor, is how fast the film is moving and what happens when it is not.
 *
 * Adding a field here means adding a uniform in `renderer.ts` and reading it in
 * `hotel.frag.ts`; `npm run verify:shader` fails if the three ever disagree,
 * because it asks the linked program which uniforms it actually declares.
 */
export interface IProjectionRig {
  /** The state this rig dresses. */
  readonly state: AubadeState;

  /**
   * How fast the projector is running, in frames per second.
   *
   * The floor's answer to the sun, and the only field in this table that is not
   * about light. `projection.ts` turns it into which frame is in the gate;
   * `renderer.ts` quantises the camera by the same number, so the eye and the
   * picture step together rather than one gliding over the other.
   *
   * Monotonically non-increasing across the five states, darkest hour first, and
   * **exactly zero at `shuttered`** — not nearly zero. A machine running at half a
   * frame a second is a machine that is running, and a projector that crawls
   * through noon is a floor whose claim has become a gradient.
   */
  readonly rate: number;

  /**
   * How far the frame stopped in the gate has burned through.
   *
   * Exactly 0 at every hour but the shuttered one, where it is exactly 1. See the
   * file comment: this is the daytime picture rather than a fifth point on a ramp,
   * and a print that is faintly alight at three in the morning is a different and
   * much sillier idea.
   */
  readonly burn: number;

  /**
   * The lamp. An arc, which is why it is the one cold light in this hotel —
   * everything else in the building is gas, tungsten, tallow or the sun, and an arc
   * runs near six thousand kelvin. Identical at all five hours.
   */
  readonly arcColour: Rgb;

  /**
   * How hard it is driven. Identical at all five hours, and high: a projection lamp
   * is the brightest artificial light in this building by two orders of magnitude,
   * and the room only reads dark because almost none of it comes back off anything.
   */
  readonly arcStrength: number;

  /**
   * The stop into the tonemap, on this floor.
   *
   * Floors −2 and −3 have one each for the reasons their comments give — `uExposure`
   * is applied to the whole frame whatever floor it is of, so the lobby's daytime
   * stop reaches underground — and this floor needs one for a third reason on top
   * of those. Its daytime picture is a burn, and a burn is a hole deliberately
   * driven past clipping. A leaked stop underneath it does not make the hole
   * brighter, it moves where the hole's *edge* falls, which is the one place in this
   * shader where a stray exposure would change a shape rather than a level.
   */
  readonly exposure: number;

  /** Bounce off the boards and the plaster. The warm half of the hemisphere. */
  readonly ambientFloor: Rgb;

  /** Off the ceiling. The cool half, and this deep there is no sky in it. */
  readonly ambientSky: Rgb;

  /**
   * Scattering in the air. The highest in the building, and it has to be: this room
   * has no lighting at all in the ordinary sense — every surface in it is lit either
   * by what leaks round the lamphouse or by what comes back through the port — and
   * the thing a visitor is actually looking at is three metres of air with a
   * projector shining through it. A projection box is hot, has a motor in it, and
   * has had a window opened in it approximately never.
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
  // A carbon arc: near white, and the blue channel is what says so. Every other
  // light in this hotel has its blue held well below its red, and this one is the
  // single exception in the building — which is most of why the room reads as
  // machinery rather than as another warm interior four floors down.
  arcColour: [0.86, 0.92, 1.0] as Rgb,
  arcStrength: 5.2,
  // The night-side stop the whole building is graded at, and no hour reaches this
  // floor either. Deliberately not the lobby's daytime 1.35 — see the field comment
  // for what a leaked stop would do to the burn's edge.
  exposure: 1.15,
  // Low, for the reason every floor above says: ambient is the enemy of a room lit by
  // one source. Not as low as the cellar's, and the difference is the point of the
  // two rooms rather than an inconsistency — Floor −3 is a room a visitor has to
  // earn and Floor −4 is a room they have to *work in*. A projection box with no
  // modelling anywhere off the beam is a beam floating in a void, and the bench, the
  // machine's near flank and the boards under it all have to be findable at a glance
  // or the plate is describing furniture nobody can see.
  ambientFloor: [0.016, 0.0148, 0.0132] as Rgb,
  ambientSky: [0.0122, 0.0132, 0.0155] as Rgb,
  dust: 2.6,
};

/** The five rigs, darkest hour first — the order `AUBADE_STATES` walks. */
export const PROJECTION_RIGS: Readonly<Record<AubadeState, IProjectionRig>> = {
  /**
   * Astronomical night, and the machine running properly.
   *
   * Twenty-four frames a second: the rate sound arrived at and never left, fast
   * enough that the picture is continuous and slow enough that the flicker is a real
   * thing a real eye can be caught by. This is the state the other four are measured
   * against and the only one in which the beam looks like light rather than like a
   * sequence of separate events.
   */
  open: {
    state: 'open',
    ...CONSTANT_LIGHT,
    rate: 24,
    burn: 0,
  },

  /**
   * The sky has started five floors up, and down here the machine has begun to drag.
   *
   * Eighteen is not an arbitrary step down: it is silent speed, what everything was
   * shot and shown at before sound fixed the rate, and it is the slowest rate at
   * which a picture is still a picture rather than a series of them. The step is
   * visible and is not yet a fault.
   */
  late: {
    state: 'late',
    ...CONSTANT_LIGHT,
    rate: 18,
    burn: 0,
  },

  /**
   * Nautical twilight. Twelve frames a second, which is where the eye stops
   * assembling the frames into motion and starts counting them.
   *
   * The same sentence AUBADE writes about the corridor — "lights go out in the order
   * you are not looking" — with nothing turned off and nothing gone out. What is
   * being taken away here is continuity, and it goes from the middle of the movement
   * rather than from either end of it.
   */
  warning: {
    state: 'warning',
    ...CONSTANT_LIGHT,
    rate: 12,
    burn: 0,
  },

  /**
   * Civil twilight — the hour the hotel is named for. Eight frames a second, and
   * every one of them is now an event with a gap on both sides of it.
   *
   * The lamp has not moved. The beam is exactly as bright, the room exactly as dark,
   * and the picture in the air changes three times less often than it did. A visitor
   * who came down at midnight and stayed can watch this happen to a machine that is
   * not being touched by anybody.
   */
  aubade: {
    state: 'aubade',
    ...CONSTANT_LIGHT,
    rate: 8,
    burn: 0,
  },

  /**
   * Day, four floors underground, in a room where the film stopped some time ago.
   *
   * Exactly zero, and the exactness is the whole floor. The machine is not running
   * slowly; it is not running. One frame is standing in the gate with a lamp behind
   * it, and it has been standing there long enough to have burned through — a hole
   * with a scorched ring around it and the whole undiffused arc coming out of the
   * middle of it, in a room that is otherwise unchanged.
   *
   * It is the piece's argument in its most mechanical form. The other floors close
   * because the hotel closes. This one closed because a machine was left running with
   * nobody in the box, which is what happens to a projection room when everybody has
   * gone home, and the sun is what sent them home.
   */
  shuttered: {
    state: 'shuttered',
    ...CONSTANT_LIGHT,
    rate: 0,
    burn: 1,
  },
};

/**
 * The projection box's rig for an hour, and for whether the visitor let themselves
 * in.
 *
 * Mirrors `rigFor`, `corridorRigFor`, `libraryRigFor` and `cellarRigFor` exactly,
 * and for the same reason: AUBADE says the invitation "runs the full night piece", so
 * a visitor who opened the night rooms in daylight and then rode down four floors
 * gets a projector that is running rather than a burned frame and a stopped machine.
 *
 * That matters more here than on any floor above it, and it is worth saying why. On
 * the other four, a daytime visitor who does not take the invitation still gets a
 * picture — a shuttered lobby, a corridor with a blade of day in it, a lit library, a
 * dark cellar. Down here the shuttered state is a room in which nothing is happening
 * and nothing is going to, which is a legitimate thing to have built and a poor thing
 * to be handed as your only view of a floor. The invitation is what makes it the
 * second of two pictures rather than the only one.
 *
 * @param state What the clock says the hotel is doing.
 * @param invited Whether the visitor opened the night rooms themselves. Ignored at
 *   every hour but the shuttered one; the caller is not required to know that.
 * @returns The rig to upload. Never null: every state has one, and an unknown value
 *   falls back to `open` rather than handing back a machine that will not start.
 */
export function projectionRigFor(state: AubadeState, invited = false): IProjectionRig {
  const rig = PROJECTION_RIGS[state] ?? PROJECTION_RIGS.open;

  if (!invited || rig.state !== 'shuttered') {
    return rig;
  }

  return { ...PROJECTION_RIGS.open, state };
}
