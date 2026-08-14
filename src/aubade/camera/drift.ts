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
 * moves with the head rather than against it.
 *
 * The other decision is periods that do not divide into one another. Three
 * sinusoids at 11, 23.7 and 41.3 seconds have a common period measured in hours,
 * so the piece never visibly loops. A single sine at any period is a loop a
 * visitor will notice inside a minute, and a noticed loop turns a room into a
 * screensaver.
 *
 * Pure, and a function of time alone: no state, no easing, nothing to reset. The
 * reduced-motion path renders `breathe(0)`, which is the anchor pose exactly —
 * every term is a sine, and every sine is zero at zero.
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
 * layout in `rooms/lobby.frag.ts`: they were chosen so that the transom, the
 * pool of light it throws on the floor, the desk lamp and the key rack are all
 * inside a 46° frame at once. Move either and check all four are still in shot.
 */
export const ANCHOR_EYE: IVec3 = { x: -0.7, y: 1.62, z: -3.6 };

/** Aimed between the door and the desk, and a little down — the floor is lit. */
export const ANCHOR_TARGET: IVec3 = { x: 0.9, y: 0.95, z: 2.0 };

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

/** Turn seconds into radians for a cycle of `period` seconds. */
function phase(seconds: number, period: number): number {
  return (seconds * 2 * Math.PI) / period;
}

/**
 * The camera pose at a given moment of the room's clock.
 *
 * @param seconds Simulated seconds since the loop started — `IFrame.simulatedSeconds`,
 *   not `performance.now()`. Non-finite input falls back to the anchor pose
 *   rather than producing `NaN` uniforms, which a driver renders as a black
 *   screen with no error anywhere.
 * @returns Eye, target and roll. Deterministic: the same second always gives the
 *   same pose, which is what makes the fixed-step loop worth having.
 */
export function breathe(seconds: number): ICameraPose {
  if (!Number.isFinite(seconds)) {
    return { eye: ANCHOR_EYE, target: ANCHOR_TARGET, roll: 0 };
  }

  const breath = Math.sin(phase(seconds, BREATH_PERIOD));
  const sway = Math.sin(phase(seconds, SWAY_PERIOD));
  const drift = Math.sin(phase(seconds, DRIFT_PERIOD));
  const driftDepth = Math.sin(phase(seconds, DRIFT_DEPTH_PERIOD));

  const offsetX = sway * SWAY_LATERAL + drift * DRIFT_LATERAL;
  const offsetY = breath * BREATH_RISE;
  const offsetZ = breath * BREATH_PUSH + driftDepth * DRIFT_DEPTH;

  return {
    eye: {
      x: ANCHOR_EYE.x + offsetX,
      y: ANCHOR_EYE.y + offsetY,
      z: ANCHOR_EYE.z + offsetZ,
    },
    target: {
      x: ANCHOR_TARGET.x + offsetX * GAZE_FOLLOW,
      y: ANCHOR_TARGET.y + offsetY * GAZE_FOLLOW,
      z: ANCHOR_TARGET.z + offsetZ * GAZE_FOLLOW,
    },
    roll: Math.sin(phase(seconds, SWAY_PERIOD * 1.31)) * ROLL_AMPLITUDE,
  };
}
