/**
 * The camera. It does not orbit; it breathes.
 *
 * The distinction is the whole brief for this file, and it is a real one. An
 * orbit holds the target still and moves the eye around it — the signature of
 * every WebGL demo on the internet, and it reads as *a model being shown to you*
 * because that is exactly what it is. Breathing translates the eye and the
 * target together, by a few centimetres, and reads as *someone standing in a
 * room*. Same number of lines, opposite effect, and a stranger can tell the
 * difference in two seconds without being able to say why.
 *
 * So: no rotation term at all. Everything below is a translation, and the gaze
 * moves with the head rather than against it. That survives the lift, which is the
 * one moment the view direction genuinely changes: the descent swings it through
 * about twenty degrees by moving the point being looked at, not by rotating
 * anything.
 *
 * The other decision is periods that do not divide into one another. Three
 * sinusoids at 11, 23.7 and 41.3 seconds have a common period measured in hours,
 * so the piece never visibly loops. A single sine at any period is a loop a
 * visitor will notice inside a minute, and a noticed loop turns a room into a
 * screensaver.
 *
 * Pure, and a function of time alone: no state, no easing, nothing to reset. The
 * reduced-motion path renders `breathe(0)`, which is the anchor pose exactly —
 * every term is a sine, and every sine is zero at zero. Floor −3 adds the one term
 * that is not a sine, and it is zero at zero too, on purpose and for this reason;
 * see the note beside it.
 *
 * ## Floor −3 is the exception to the rule about periods
 *
 * The Cellar swaps the eleven-second breath for the 4-7-8 cycle in `cellar.ts` and
 * damps everything else to a third. That is a deliberate violation of the
 * paragraph above — nineteen seconds is a period a visitor will absolutely notice —
 * and the violation is the room. Nowhere else does the piece want to be followed;
 * there, it does.
 *
 * The cycle itself is a parameter rather than an import, which keeps this file free
 * of dependencies and is also forced by the toolchain. See `breathe`'s third
 * parameter, where both halves of that are set out.
 */

/** A point or a direction. Plain data; the shader wants three floats. */
export interface IVec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Where the camera is and what it is looking at. */
export interface ICameraPose {
  /** Eye position, metres, in room space. */
  readonly eye: IVec3;

  /** The point the eye is aimed at, metres. */
  readonly target: IVec3;

  /** Roll about the view axis, radians. Tiny, and never zero for long. */
  readonly roll: number;
}

/**
 * Where a person would stand: a few metres back from the desk, left of the
 * centre line, at standing eye height.
 *
 * Off-centre matters more than it sounds. Dead centre puts the door and the desk
 * symmetrically either side and the room reads as a diagram; a metre to the left
 * puts the desk nearer, the door further, and gives the shaft of moonlight
 * something to cross the frame diagonally against.
 *
 * These two are the composition, and they are load-bearing on the shader's
 * layout in `rooms/hotel.frag.ts`: they were chosen so that the transom, the
 * pool of light it throws on the floor, the desk lamp and the key rack are all
 * inside a 46° frame at once. Move either and check all four are still in shot.
 */
export const ANCHOR_EYE: IVec3 = { x: -0.7, y: 1.62, z: -3.6 };

/** Aimed between the door and the desk, and a little down — the floor is lit. */
export const ANCHOR_TARGET: IVec3 = { x: 0.9, y: 0.95, z: 2.0 };

/**
 * Where a person stands on Floor −1: right of the corridor's axis, so the mirrored
 * wall on the left is seen along its length rather than head-on.
 *
 * Head-on is the one placement that does not work, and it fails for a reason worth
 * recording. A mirror viewed square returns the viewer's own position, so the
 * reflection is dominated by the part of the room directly behind the camera —
 * which is a blank near wall — and the sconces and doors that make the reflection
 * legible as a corridor slide out of it. Standing off to one side puts the whole
 * receding line of them in the glass, which is what the phase's Definition of Done
 * needs there before it can take anything away.
 *
 * Lower than the lobby's eye by 70mm, and that is the descent rather than a
 * different person: the camera sinks as the lift travels and this is where it
 * stops.
 */
export const CORRIDOR_EYE: IVec3 = { x: 0.42, y: 1.55, z: -3.1 };

/**
 * Aimed down the corridor's length, a little towards the mirror and a little down.
 *
 * The gaze is what actually turns during the descent — there is still no rotation
 * term anywhere in this file. Moving the target from the lobby's back wall to a
 * point twelve metres down a corridor swings the view direction through about
 * twenty degrees, and it does it by translation, which is the same thing every
 * other motion here is made of.
 */
export const CORRIDOR_TARGET: IVec3 = { x: -0.34, y: 1.05, z: 4.6 };

/**
 * Where a person stands on Floor −2: back from the first pair of reading tables,
 * a little left of the room's axis, and lower again than the corridor.
 *
 * The library is the widest room in the building and the only one with matching
 * walls, so the composition cannot lean on asymmetry the way the other two do —
 * the lobby puts the desk to one side of the door, the corridor puts every
 * fitting opposite the mirror. What holds this one together instead is depth: the
 * bays recede in a line down both sides and the reading lamps march away between
 * them, so the camera stands slightly off axis and low, where the two runs of
 * shelving converge fastest.
 *
 * Low also because that is where the descent has got to. The eye has come down
 * 120mm from the lobby and 50mm from the corridor, and each drop is the lift
 * rather than a different person.
 */
export const LIBRARY_EYE: IVec3 = { x: -0.55, y: 1.5, z: -4.2 };

/**
 * Aimed down the room, level with the shelving a person reads from.
 *
 * Higher off the floor than the corridor's target, which is the one place the
 * descent stops descending: the corridor is a passage and is looked along, the
 * library is a room and is looked *into*. Raising the gaze is what puts the
 * shelves rather than the floor in the middle of the frame, and the shelves are
 * where this floor's writing is.
 */
export const LIBRARY_TARGET: IVec3 = { x: 0.3, y: 1.15, z: 3.4 };

/**
 * Where a person stands on Floor −3: back from the candle, right of the room's
 * axis, and lower than anywhere else in the building.
 *
 * Off to the right specifically, which is the casks' side, so that the one light
 * in the room is across the frame rather than beside the camera. That matters more
 * on this floor than on any other, because the picture at second zero has to be a
 * small bright thing a long way off with a great deal of nothing around it — and a
 * candle at the visitor's shoulder lights the near brick, fills the bottom of the
 * frame, and tells them the room is small.
 *
 * Lowest of the four, and the drop from the library is the largest of the three:
 * this is a barrel vault springing at 850mm and the whole feeling of one is that
 * the sides come down past your shoulders. Standing high in it renders a tunnel.
 */
export const CELLAR_EYE: IVec3 = { x: 0.3, y: 1.42, z: -4.0 };

/**
 * Aimed down the room and slightly down, at the flags rather than the vault.
 *
 * The opposite choice from the library's, and for the opposite reason. That room's
 * subject is on the shelves, so the gaze goes up to meet it; this room's subject is
 * that there is nothing to see yet, and the two things that eventually arrive at
 * the bottom of the frame — the flagstone joints and the standing water at the far
 * end — are the ones a visitor finds last and remembers.
 */
export const CELLAR_TARGET: IVec3 = { x: -0.25, y: 0.98, z: 3.2 };

/**
 * Where a person stands on Floor −4: back and to the left, so that the projector is
 * a three-quarter silhouette on the right and its beam crosses the frame away from
 * it rather than towards the camera.
 *
 * Behind the machine and off its axis, which is where a projectionist actually
 * stands and is also the only placement that composes. Square behind it, the beam
 * recedes to a point and the room is a corridor with a box in it; square beside it,
 * the beam is a horizontal bar and the machine is an elevation drawing. From back
 * left the lens, the beam and the port lie on a diagonal — the same argument the
 * lobby's shaft of moonlight makes about crossing a frame rather than dividing it.
 *
 * Lowest in the building, and the drop from the cellar is the smallest of the four:
 * the box is a small room with a normal ceiling rather than a vault, so the descent
 * is nearly finished here. It is a shelf, not a plunge.
 */
export const PROJECTION_EYE: IVec3 = { x: -1.6, y: 1.45, z: -3.0 };

/**
 * Aimed at the middle of the beam, which is neither of the two things making it.
 *
 * The one target in the building that is not aimed at a surface. Every other floor
 * looks at something — the desk, the far end of a corridor, the shelving, the flags —
 * and this one looks at a piece of air, because the air is the subject: the machine
 * is a silhouette and the port is a hole, and what is worth standing here for is the
 * two metres of lit dust between them.
 *
 * That is also what fixes the composition rather than the anchor above doing it
 * alone. The eye is on the left, the machine is on the right, the port is on the
 * left again and lower — so the beam runs right to left and slightly down across the
 * frame, and this point is halfway along it. Aimed at the port instead, the machine
 * leaves the shot; aimed at the machine, the port does.
 */
export const PROJECTION_TARGET: IVec3 = { x: 0.35, y: 1.05, z: 2.6 };

/**
 * Where a person stands on Floor −5: in the box, back from the rail, and seated.
 *
 * The lowest eye in the building and the only one that is not a standing height —
 * 1.18 is a person in a chair, which is what a box is furnished for and what makes
 * the balustrade read as something to look over rather than as a wall at waist
 * height. Every other floor in this hotel is a room somebody is walking through.
 *
 * Back from the rail rather than at it, and that is the composition. Up against the
 * balustrade the house fills the frame and the box is gone, so the floor becomes an
 * auditorium seen from nowhere — which is a picture of an opera house rather than a
 * picture of being in one. Half a metre back, the rail crosses the bottom of the
 * frame, the near chair is in the corner of it, and the house is a bright thing
 * beyond a dark near edge. That contrast is the room: the subject is out there and
 * the visitor is in here, and both have to be in shot to say so.
 *
 * Off-axis to the left by a little, so the two chairs are not a symmetrical pair
 * across the middle of the frame and the chandelier does not sit dead centre. The
 * same argument the lobby's moonlight makes about crossing a frame rather than
 * dividing it.
 */
export const BOX_EYE: IVec3 = { x: -0.34, y: 1.18, z: -2.05 };

/**
 * Aimed out over the rail and slightly up, into the house.
 *
 * Up, which no other target in this building is. Every room above this one is
 * looked at level or downward — at a desk, down a corridor, at shelving, at flags,
 * at a beam — because they are all rooms with floors that matter. This one is aimed
 * above the horizontal because the house has eleven metres of height on it and the
 * only things in it worth resolving, the chandelier and the upper tiers, are above
 * the eye of somebody sitting down.
 *
 * It is also what keeps the stalls out of shot, which is deliberate rather than
 * incidental: there is no floor modelled down there, and the reason there is none is
 * that a box does not have one. A target ten centimetres lower would put the march
 * through the gap where an auditorium's floor should be and out into the dark, and
 * the bottom of every frame on this floor would be the void the model actually is.
 *
 * The z is far enough out that the aim does not swing as `uHouse` moves — it is a
 * direction, not a point in the house, so the same composition survives all five
 * hours. Aimed at something *in* the auditorium, the camera would turn through
 * thirty degrees between midnight and dawn, and this floor's answer to the sun would
 * be swamped by a camera move nobody asked for.
 */
export const BOX_TARGET: IVec3 = { x: 0.42, y: 2.9, z: 12.0 };

/**
 * The six floors' anchors, in the order the lift passes them — so the index is
 * the depth, exactly, which is the same identity `descent.ts` is built on.
 *
 * A table rather than six named pairs threaded through a branch, because the
 * interpolation below has to work between *whichever* pair the lift is straddling
 * and there is no version of that written as a conditional which survives a
 * sixth floor. Three floors have arrived since that was written and none of them
 * touched a line of `anchorAt`, which is what the table was for — the sixth being
 * the one the sentence above was actually predicting.
 */
const EYE_ANCHORS: readonly IVec3[] = [
  ANCHOR_EYE,
  CORRIDOR_EYE,
  LIBRARY_EYE,
  CELLAR_EYE,
  PROJECTION_EYE,
  BOX_EYE,
];
const TARGET_ANCHORS: readonly IVec3[] = [
  ANCHOR_TARGET,
  CORRIDOR_TARGET,
  LIBRARY_TARGET,
  CELLAR_TARGET,
  PROJECTION_TARGET,
  BOX_TARGET,
];

/**
 * Seconds per cycle. Coprime enough that the sum has no useful period.
 *
 * Four of them rather than three, and `DRIFT_DEPTH_PERIOD` exists specifically
 * so the two drift terms are not a sine and its own cosine. Quadrature would
 * have been the obvious way to keep them out of step, and it traces a circle in
 * the x-z plane — a slow orbit, which is the one shape this file exists to
 * avoid — and it is non-zero at t=0, which would put the reduced-motion still
 * seven centimetres off the composition the anchors describe.
 */
const BREATH_PERIOD = 11;
const SWAY_PERIOD = 23.7;
const DRIFT_PERIOD = 41.3;
const DRIFT_DEPTH_PERIOD = 33.1;

/**
 * Metres. A breath moves a standing head by about this much; anything larger
 * stops being a body and starts being a dolly.
 */
const BREATH_RISE = 0.014;
const BREATH_PUSH = 0.032;
const SWAY_LATERAL = 0.075;
const DRIFT_LATERAL = 0.055;
const DRIFT_DEPTH = 0.07;

/**
 * How much of the eye's motion the gaze inherits.
 *
 * Not 1 and not 0. At 1 the whole view translates rigidly and the parallax
 * disappears; at 0 the target is pinned and the camera is orbiting after all,
 * which is the one thing this file exists to avoid. Around a third keeps the
 * near desk sliding against the far wall — the cue that says "space" — while the
 * composition holds still.
 */
const GAZE_FOLLOW = 0.34;

/** Radians. Roughly a quarter of a degree; felt rather than seen. */
const ROLL_AMPLITUDE = 0.0045;

/**
 * Metres the camera drops *below* the straight line between two floors, peaking
 * halfway through a ride and zero at both ends.
 *
 * A lift that interpolates its way between two heights arrives correctly and feels
 * like nothing at all. The extra sag in the middle is where the travel is fastest,
 * and eleven centimetres of it is the difference between descending and
 * cross-fading. It has to vanish at both endpoints or the settled floors are not
 * the compositions their anchors describe — which is the same requirement the
 * reduced-motion still has, for the same reason.
 *
 * Per leg, not per journey: it is driven by the fractional part of the depth, so
 * a second floor's ride sags exactly as the first one did rather than inverting
 * into a rise, which is what a term in the whole depth would have done between
 * depths 1 and 2.
 */
const DESCENT_SAG = 0.11;

/**
 * How much of its ordinary motion the camera keeps on Floor −3.
 *
 * A third. Everywhere else in this hotel the camera is a person standing in a
 * room; on the cellar floor it is a person standing very still in one, and the
 * difference between those has to be visible or the room's whole demand is
 * rhetorical. It is not zero, because a camera that stops entirely is the
 * reduced-motion still and this visitor did not ask for that.
 *
 * Applied to the sway, the drift and the roll but *not* to the breath, which on
 * this floor is the point rather than the noise.
 */
const CELLAR_QUIET = 0.34;

/** Turn seconds into radians for a cycle of `period` seconds. */
function phase(seconds: number, period: number): number {
  return (seconds * 2 * Math.PI) / period;
}

/**
 * Straight-line interpolation between two points, exact at both ends.
 *
 * Written as `(1 − t)·a + t·b` rather than the more obvious `a + (b − a)·t`, and
 * the difference is not style. The obvious form is not exact at t = 1: with the
 * lobby at x = −0.7 and the corridor at 0.42 it returns 0.41999999999999993, so
 * the camera never quite arrives. That is a hundredth of a micrometre and it would
 * not matter at all except that the whole lift is built on its endpoints being
 * exact — the shader skips a scene at 0 and 1, the reduced-motion still is
 * `breathe(0, morph)` and has to be the composition the anchors describe, and
 * `descent.spec.ts` asserts the same property of `morphAt` with `toBe`. A camera
 * that is arbitrarily close to arriving is the one part of that chain where
 * "close enough" would have been true, which is exactly why it is worth closing.
 */
function between(from: IVec3, to: IVec3, t: number): IVec3 {
  const s = 1 - t;
  return {
    x: s * from.x + t * to.x,
    y: s * from.y + t * to.y,
    z: s * from.z + t * to.z,
  };
}

/**
 * The anchor a depth lands on, interpolating between the pair it straddles.
 *
 * The same construction the shader uses on its distance fields, and for the same
 * reason: at every integer depth this returns one floor's anchor untouched, so a
 * settled floor is the composition its constant describes rather than a mix that
 * happens to be very close to it.
 *
 * @param anchors The three floors' poses, indexed by depth.
 * @param depth Where the lift is. Already clamped by the caller.
 * @returns The pose. Exact at every integer, including the last one — the upper
 *   index is clamped rather than allowed off the end, which is what keeps depth 2
 *   from reading an anchor that does not exist.
 */
function anchorAt(anchors: readonly IVec3[], depth: number): IVec3 {
  const lower = Math.min(Math.floor(depth), anchors.length - 1);
  const upper = Math.min(lower + 1, anchors.length - 1);
  return between(anchors[lower], anchors[upper], depth - lower);
}

/**
 * The camera pose at a given moment of the room's clock, at a given depth.
 *
 * @param seconds Simulated seconds since the loop started — `IFrame.simulatedSeconds`,
 *   not `performance.now()`. Non-finite input falls back to the anchor pose rather
 *   than producing `NaN` uniforms, which a driver renders as a black screen with
 *   no error anywhere.
 *
 *   Near depth 4 the caller does not pass a wall second at all: it passes the
 *   instant the frame now in the projector's gate was struck at, blended in by the
 *   lift. That is Floor −4's whole subject and it is done on the caller's side
 *   rather than here for the reason `projection.ts` gives — this function stays a
 *   pure function of the second it is handed, and which second that is, is a fact
 *   about the room rather than about the camera. At a stopped projector the second
 *   is zero, so the camera is on its anchor and every term below is exactly zero:
 *   the same still the reduced-motion path draws, arrived at from the fiction.
 * @param depth Where the lift is: 0 in the lobby, 1 in the corridor, 2 in the
 *   library, 3 in the cellar, 4 in the projection box, and in between during a
 *   descent. The same number the shader mixes its distance fields by, so the camera
 *   and the room can never disagree about which floor they are on. Clamped to the
 *   floors that exist, and non-finite input is treated as the lobby.
 * @param breath How full the lungs are on the 4-7-8 cycle, in [0, 1] — `breathAt`
 *   from `cellar.ts`, evaluated at the same second.
 *
 *   Passed in rather than computed here, and the reason is worth recording because
 *   the obvious version does not build. `scripts/verify-shader.mjs` runs this file
 *   directly under Node, whose ESM resolver has no extensionless resolution, so a
 *   value import of `../cellar` fails there — and naming `../cellar.ts` outright
 *   fails the Angular build instead. It is the same fork `rooms/hotel.frag.ts`
 *   describes at length, and the way out here is better than either: the caller
 *   already computes this number to upload as `uBreath`, so handing it over keeps
 *   the camera a pure function of its arguments *and* makes it impossible for the
 *   pose and the uniform to disagree about where in the breath they are.
 *
 *   Read only near depth 3 and ignored everywhere else. Defaults to 0, which is an
 *   empty chest and therefore the anchor pose — so a caller that forgets it gets a
 *   cellar whose camera has stopped rather than one that has jumped.
 * @returns Eye, target and roll. Deterministic: the same second at the same depth
 *   always gives the same pose, which is what makes the fixed-step loop worth
 *   having.
 */
export function breathe(seconds: number, depth = 0, breath = 0): ICameraPose {
  const t = Number.isFinite(depth) ? Math.min(Math.max(depth, 0), EYE_ANCHORS.length - 1) : 0;
  const eyeAnchor = anchorAt(EYE_ANCHORS, t);
  const targetAnchor = anchorAt(TARGET_ANCHORS, t);

  if (!Number.isFinite(seconds)) {
    return { eye: eyeAnchor, target: targetAnchor, roll: 0 };
  }

  // How much of Floor −3 is in the frame. The same expression the shader's
  // `floorWeight` uses, deliberately, so the camera changes gait over exactly the
  // stretch of the shaft in which the room it is changing gait for is being drawn.
  const cellar = Math.max(0, 1 - Math.abs(t - 3));
  const loose = 1 - cellar * (1 - CELLAR_QUIET);

  // The one place in this file where a visible period is correct.
  //
  // Everything above is built on three sinusoids whose common period is measured
  // in hours, precisely so the piece never visibly loops — and on Floor −3 the
  // eleven-second breath crossfades into the caller's 4-7-8 cycle, which loops on
  // purpose every nineteen seconds. A pace a visitor cannot find is not a pace they
  // can keep, and the Cellar's whole proposition is that they keep one.
  //
  // Both terms are exactly zero at second zero, which is what keeps the
  // reduced-motion still on its anchor on every floor: the sine is zero at zero
  // because it is a sine, and the 4-7-8 curve is zero at zero because the cycle
  // starts on an empty chest. That is not a coincidence and `cellar.ts` says so.
  //
  // The two ranges differ — a sine covers [−1, 1] and a chest covers [0, 1] — and
  // that is deliberate rather than an oversight. A breath is one-sided: you rise
  // from rest and return to it, rather than sinking below where you started. So the
  // anchor on this floor is a body at the bottom of an exhale, which is the correct
  // place for a room that is asking you to stop.
  const paced = Number.isFinite(breath) ? Math.min(Math.max(breath, 0), 1) : 0;
  const rise = Math.sin(phase(seconds, BREATH_PERIOD)) * (1 - cellar) + paced * cellar;
  const sway = Math.sin(phase(seconds, SWAY_PERIOD)) * loose;
  const drift = Math.sin(phase(seconds, DRIFT_PERIOD)) * loose;
  const driftDepth = Math.sin(phase(seconds, DRIFT_DEPTH_PERIOD)) * loose;

  const offsetX = sway * SWAY_LATERAL + drift * DRIFT_LATERAL;
  const offsetY = rise * BREATH_RISE - Math.sin(Math.PI * (t - Math.floor(t))) * DESCENT_SAG;
  const offsetZ = rise * BREATH_PUSH + driftDepth * DRIFT_DEPTH;

  return {
    eye: {
      x: eyeAnchor.x + offsetX,
      y: eyeAnchor.y + offsetY,
      z: eyeAnchor.z + offsetZ,
    },
    target: {
      x: targetAnchor.x + offsetX * GAZE_FOLLOW,
      y: targetAnchor.y + offsetY * GAZE_FOLLOW,
      z: targetAnchor.z + offsetZ * GAZE_FOLLOW,
    },
    roll: Math.sin(phase(seconds, SWAY_PERIOD * 1.31)) * ROLL_AMPLITUDE * loose,
  };
}
