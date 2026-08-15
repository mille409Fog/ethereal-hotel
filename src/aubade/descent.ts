/**
 * The lift: two floors, one number, and the rule that turns time into it.
 *
 * AUBADE says the elevator "is not a transition, it is a room", and that it is
 * "where the morph between two distance fields happens in full view". Both
 * sentences land on the same variable. `uMorph` runs from 0 (the lobby's
 * distance field, exactly) to 1 (the corridor's, exactly), and every part of the
 * descent — which room is drawn, where the camera stands, which lights exist, how
 * much of the mirror is awake — is derived from it. There is no second clock and
 * no parallel animation to keep in step, because a descent whose light and
 * geometry are timed separately is a descent that will eventually disagree with
 * itself on a slow machine.
 *
 * ## Why the endpoints have to be exact
 *
 * This is the one subtle thing in the file. `hotel.frag.ts` branches on `uMorph`
 * to skip whole scenes: below `MORPH_EPSILON` it evaluates only the lobby, above
 * `1 - MORPH_EPSILON` only the corridor, and in between it evaluates both and
 * mixes them. That branch is what keeps the settled floors at the same cost they
 * had when there was only one room — and it is also what wakes the mirror, which
 * is a second march and does not run during the ride.
 *
 * So an easing curve that approaches 1 asymptotically, or lands on 0.9997, is not
 * a rounding error. It is a corridor that permanently pays for a lobby nobody can
 * see, and a mirror that never turns on. The progress function is required to
 * return exact 0 and exact 1 at and beyond its endpoints, and `descent.spec.ts`
 * asserts it with `toBe` rather than `toBeCloseTo` for that reason.
 *
 * ## Why it is timed rather than driven
 *
 * The lift takes a fixed number of seconds and cannot be scrubbed, hurried, or
 * cancelled halfway. "Visible and unhurried" is the spec's phrase and it is a
 * refusal as much as a pace: a piece that lets you skip its one transition has
 * decided the transition was in the way, and this one is the floor between two
 * floors. The control is disabled while the car is moving for the same reason the
 * invitation is one-way.
 */

/**
 * A floor of the hotel that exists. Not the full six — `reader/edition.ts` lists
 * those, and the difference between what is written and what is built is a
 * distinction that page keeps on purpose.
 */
export type Floor = 0 | -1;

/** Which way the car is going. */
export type LiftDirection = 'down' | 'up';

/**
 * How long the ride lasts, in seconds of the room's clock.
 *
 * Long. Deliberately longer than a transition wants to be and shorter than a
 * visitor's patience: the morph is the spectacle, so hurrying it is throwing away
 * the thing that was built, and at much under six seconds the two distance fields
 * pass through each other too fast to read as anything but a dissolve. Seven and a
 * half seconds is about two breaths, which is the unit the rest of the piece is
 * timed in.
 */
export const LIFT_SECONDS = 7.5;

/**
 * How close to an endpoint counts as arrived, for the shader's scene-skipping
 * branch and for this file's own arithmetic.
 *
 * Shared with `hotel.frag.ts`, which declares the same number as a GLSL constant.
 * They are two declarations of one value because the shader cannot import — see
 * the note over `MORPH_EPSILON` there.
 */
export const MORPH_EPSILON = 0.001;

/** A ride in progress. Held by the component; `null` when the car is at rest. */
export interface ILift {
  /** Which way it is going. */
  readonly direction: LiftDirection;

  /**
   * The room's clock when the doors closed, in seconds — `IFrame.simulatedSeconds`,
   * not `performance.now()`. The lift is timed in simulated seconds so that a
   * machine dropping frames takes the same seven and a half seconds to arrive as
   * one that is not, and so that a backgrounded tab does not come back to a lift
   * that finished without anyone in it.
   */
  readonly startedAtSeconds: number;
}

/**
 * The floor a ride ends on.
 *
 * @param direction Which way the car is going.
 * @returns The floor it arrives at. Two floors exist, so this is total; when the
 *   third is built this becomes a function of the departing floor as well.
 */
export function floorAfter(direction: LiftDirection): Floor {
  return direction === 'down' ? -1 : 0;
}

/**
 * The floor a ride starts from — the one whose distance field `uMorph` is
 * leaving.
 *
 * @param direction Which way the car is going.
 * @returns The floor it departs.
 */
export function floorBefore(direction: LiftDirection): Floor {
  return direction === 'down' ? 0 : -1;
}

/**
 * `uMorph` for a floor the lift is not moving between.
 *
 * @param floor Where the visitor is standing.
 * @returns 0 for the lobby, 1 for the corridor. Exact, for the reason in the file
 *   comment.
 */
export function morphForFloor(floor: Floor): number {
  return floor === -1 ? 1 : 0;
}

/**
 * How far the lift has got, as the shader's `uMorph`.
 *
 * Eased in and out of a sine, which is the curve the phrase "visible and
 * unhurried" actually describes: it is zero-derivative at both ends, so the car
 * leaves at rest and arrives at rest rather than starting and stopping instantly,
 * and it is symmetric, so the ride up is the ride down in reverse and a visitor
 * who goes down and comes straight back sees one motion instead of two.
 *
 * The clamps come before the easing rather than after it. That ordering is what
 * makes the endpoints exactly 0 and 1 — see the file comment, where the whole
 * reason that matters is set out — and it is also what keeps a corrupted clock out
 * of the trigonometry, since a `NaN` handed to `Math.cos` comes back as a `NaN`
 * uniform and renders as a black screen with nothing in the console.
 *
 * @param elapsedSeconds Seconds of the room's clock since the doors closed.
 *   Before zero the car has not left; past `LIFT_SECONDS` it has arrived; and
 *   non-finite counts as arrived, so nobody is stranded between floors.
 * @param direction Which way the car is going.
 * @returns `uMorph` in [0, 1] — 0 is the lobby's distance field exactly, 1 is the
 *   corridor's exactly.
 */
export function morphAt(elapsedSeconds: number, direction: LiftDirection): number {
  // This is a two-step process. We calculate the distance traveled and then apply it according to the direction given.
  // Distance calculation: we apply the simplest easing function for this situation, the ease in and out sine.
  // First we must normalize the time input by measuring by the LIFT_SECONDS.
  const normalizedTime = elapsedSeconds / LIFT_SECONDS;
  // We handle clamping to local extrema with out of range inputs here
  let distance: number;
  if (Number.isNaN(normalizedTime) || normalizedTime >= 1) {
    distance = 1;
  } else if (normalizedTime <= 0) {
    distance = 0;
  } else distance = easeInOutSine(normalizedTime);

  // Then apply it according to the direction given. Going up is the same ride
  // read backwards, which is what makes a visitor who goes down and returns see
  // one motion rather than two.
  if (direction === 'up') {
    return 1 - distance;
  }
  return distance;
}

/**
 * A standard easing function that uses a trigonometric function to model easing
 * when progress is near the boundaries.
 *
 * @param elapsedTime Progress through the ride, already normalised to [0, 1] and
 *   already clamped by the caller — this does no range checking of its own, and
 *   a value outside that interval would come back outside [0, 1] too.
 * @returns The eased fraction. Exactly 0 and 1 at the ends, 0.5 at the middle,
 *   and flat at both ends because the derivative is a sine.
 */
function easeInOutSine(elapsedTime: number): number {
  return -1 * ((Math.cos(Math.PI * elapsedTime) - 1) / 2);
}

/**
 * Whether a ride that started `elapsedSeconds` ago has finished.
 *
 * Asked once a frame by the component, which retires the lift and settles the
 * visitor onto a floor. Kept separate from `morphAt` rather than folded into a
 * returned struct: the arrival is a state change with consequences outside the
 * render — a plate that changes, a control that comes back, a focus move — and a
 * function whose result is read for two unrelated purposes is a function that
 * gets called twice a frame for one of them.
 *
 * @param elapsedSeconds Seconds of the room's clock since the doors closed.
 * @returns Whether the car has arrived. Non-finite input counts as arrived, so a
 *   corrupted clock strands nobody between floors.
 */
export function liftHasArrived(elapsedSeconds: number): boolean {
  return !Number.isFinite(elapsedSeconds) || elapsedSeconds >= LIFT_SECONDS;
}
