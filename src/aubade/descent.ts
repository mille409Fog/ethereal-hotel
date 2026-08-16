/**
 * The lift: three floors, one number, and the rule that turns time into it.
 *
 * AUBADE says the elevator "is not a transition, it is a room", and that it is
 * "where the morph between two distance fields happens in full view". Both
 * sentences land on the same variable. `uDepth` counts floors below the lobby —
 * 0 is the lobby's distance field exactly, 1 the corridor's, 2 the library's —
 * and every part of the descent, which room is drawn, where the camera stands,
 * which lights exist, how much of the mirror is awake, is derived from it. There
 * is no second clock and no parallel animation to keep in step, because a descent
 * whose light and geometry are timed separately is a descent that will eventually
 * disagree with itself on a slow machine.
 *
 * ## Why it counts down rather than across
 *
 * It used to be `uMorph`, a single fraction from the lobby to the corridor, and
 * AUBADE's phase note is explicit that a third room does not extend that for
 * free: "either `mapScene` starts branching on which pair is being mixed, or the
 * lift stops being a mix and becomes a fade." The branch is what was chosen, and
 * this file is the half of it that is not GLSL.
 *
 * A fade would have been less work and it would have cost the piece its one
 * transition. A cross-fade between two rendered images is a dissolve; the whole
 * claim being made about the elevator is that it is *not* one — that what happens
 * is one piece of arithmetic becoming another in full view. So the number stays a
 * position in a continuum and the shader keeps mixing distance fields; what
 * changes is that the continuum is now two legs long instead of one.
 *
 * Depth rather than a leg index and a fraction, because depth is a single
 * monotonic quantity that means something on its own: **depth is minus the floor**,
 * exactly, at every settled position. One number, no pair to keep consistent, and
 * a value of 1.6 is legible as "between the corridor and the library, nearer the
 * library" without consulting anything.
 *
 * ## Why the endpoints have to be exact
 *
 * This is the one subtle thing in the file, and generalising the lift made it
 * subtler rather than less so. `hotel.frag.ts` branches on `uDepth` to skip whole
 * scenes, and it does so on an exact comparison: an integral depth evaluates that
 * floor alone, and every other depth evaluates the two floors it lies between and
 * mixes them. That branch is what keeps the settled floors at the same cost they
 * had when there was only one room. `MORPH_EPSILON` is a second, wider net thrown
 * over the same endpoints, and it is the mirror's — a second march that only ever
 * runs at depth 1 and does not run during a ride.
 *
 * So an easing curve that approaches its endpoint asymptotically, or lands on
 * 0.9997, is not a rounding error. It is a corridor that permanently pays for a
 * lobby nobody can see, and — a thousandth further out — a mirror that never turns
 * on. The scene branch is the unforgiving one of the two, because it has no
 * epsilon at all: a depth is either a floor or it is between two, and there is no
 * third thing for a tolerance to describe. The progress function is required to
 * return its two endpoints exactly, and `descent.spec.ts` asserts it with `toBe`
 * rather than `toBeCloseTo` for that reason — now at three values rather than two,
 * which is three chances for the same invisible failure.
 *
 * ## Why it is timed rather than driven
 *
 * The lift takes a fixed number of seconds and cannot be scrubbed, hurried, or
 * cancelled halfway. "Visible and unhurried" is the spec's phrase and it is a
 * refusal as much as a pace: a piece that lets you skip its one transition has
 * decided the transition was in the way, and this one is the floor between two
 * floors. The control is disabled while the car is moving for the same reason the
 * invitation is one-way.
 *
 * The ride is always one floor. A lift that ran the lobby to the library in one
 * seven-and-a-half-second move would be mixing two fields that are never adjacent
 * — the shader has no such pair — and it would skip the corridor, which is a room
 * rather than a landing.
 */

/**
 * A floor of the hotel that exists. Not the full six — `reader/edition.ts` lists
 * those, and the difference between what is written and what is built is a
 * distinction that page keeps on purpose.
 */
export type Floor = 0 | -1 | -2;

/** Which way the car is going. */
export type LiftDirection = 'down' | 'up';

/**
 * The floors, in the order the lift passes them. Depth is the index, which is
 * the whole of `depthForFloor`.
 */
export const FLOORS: readonly Floor[] = [0, -1, -2];

/** The deepest floor built. The lift refuses to be called past it. */
export const LOWEST_FLOOR: Floor = -2;

/**
 * How long one floor's ride lasts, in seconds of the room's clock.
 *
 * Long. Deliberately longer than a transition wants to be and shorter than a
 * visitor's patience: the morph is the spectacle, so hurrying it is throwing away
 * the thing that was built, and at much under six seconds the two distance fields
 * pass through each other too fast to read as anything but a dissolve. Seven and a
 * half seconds is about two breaths, which is the unit the rest of the piece is
 * timed in.
 *
 * Per floor rather than per journey, so the second leg is worth as much as the
 * first. A lift that budgeted one ride's worth of seconds across a deeper descent
 * would get cheaper the further down it went, which is the wrong way round for a
 * building whose good rooms are at the bottom.
 */
export const LIFT_SECONDS = 7.5;

/**
 * How close to an endpoint counts as arrived, for the shader's mirror and for
 * this file's own arithmetic.
 *
 * Not for the shader's scene-skipping branch, which takes no epsilon — see §Why
 * the endpoints have to be exact. The two used to be one test, and separating them
 * cost the mirror nothing and bought the scene branch the right to name each room
 * exactly once.
 *
 * Shared with `hotel.frag.ts`, which declares the same number as a GLSL constant.
 * They are two declarations of one value because the shader cannot import — see
 * the note over `MORPH_EPSILON` there.
 *
 * Still named for the morph rather than for the depth, and that is not a leftover.
 * The quantity it bounds is how far through a *morph* the car is, which is a
 * fraction of one leg; the depth is where the car is in the building. The epsilon
 * belongs to the first of those and is applied to the distance from the nearest
 * integer of the second.
 */
export const MORPH_EPSILON = 0.001;

/** A ride in progress. Held by the component; `null` when the car is at rest. */
export interface ILift {
  /** The floor the doors closed on. The ride is one floor from here. */
  readonly from: Floor;

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
 * Whether the lift can go that way from here.
 *
 * The two ends of the shaft are the whole of this rule, and it is worth having as
 * a function rather than as two comparisons at the call sites: the component asks
 * it to decide which controls exist, `call` asks it before starting a ride, and a
 * building that grows a floor should not have to be found in three places.
 *
 * @param from Where the car is.
 * @param direction Which way it is being asked to go.
 * @returns Whether there is a floor that way.
 */
export function canCall(from: Floor, direction: LiftDirection): boolean {
  return direction === 'down' ? from > LOWEST_FLOOR : from < 0;
}

/**
 * The floor a one-floor ride ends on.
 *
 * @param from The floor the car is leaving.
 * @param direction Which way it is going.
 * @returns The floor it arrives at, or `from` unchanged when there is no floor
 *   that way. Clamped rather than throwing: the controls are already gated on
 *   `canCall`, and a lift that threw on an impossible call would turn a UI bug
 *   into a dead render loop.
 */
export function floorAfter(from: Floor, direction: LiftDirection): Floor {
  if (!canCall(from, direction)) {
    return from;
  }
  return (direction === 'down' ? from - 1 : from + 1) as Floor;
}

/**
 * `uDepth` for a floor the lift is not moving between.
 *
 * Depth is minus the floor, exactly, and that identity is the reason the lift is
 * expressed as a depth at all — see the file comment.
 *
 * @param floor Where the visitor is standing.
 * @returns 0 in the lobby, 1 in the corridor, 2 in the library. Exact, for the
 *   reason in the file comment.
 */
export function depthForFloor(floor: Floor): number {
  // Written out rather than as a bare negation, and the reason is the one value
  // JavaScript has two of. `-0` is what `-floor` gives for the lobby, and it is
  // numerically zero, compares equal to zero, and uploads to the shader as zero —
  // so nothing renders wrongly. What it does do is fail `Object.is`, which is what
  // `toBe` uses, so a settled lobby would not equal the depth the lift said it had
  // arrived at even though both are zero. That is a test failure with no bug under
  // it, and worse, a bug with no test failure over it the day the comparison runs
  // the other way.
  return floor === 0 ? 0 : -floor;
}

/**
 * How far the lift has got, as the shader's `uDepth`.
 *
 * Eased in and out of a sine, which is the curve the phrase "visible and
 * unhurried" actually describes: it is zero-derivative at both ends, so the car
 * leaves at rest and arrives at rest rather than starting and stopping instantly,
 * and it is symmetric, so the ride up is the ride down in reverse and a visitor
 * who goes down and comes straight back sees one motion instead of two.
 *
 * The clamps come before the easing rather than after it. That ordering is what
 * makes the endpoints exact — see the file comment, where the whole reason that
 * matters is set out — and it is also what keeps a corrupted clock out of the
 * trigonometry, since a `NaN` handed to `Math.cos` comes back as a `NaN` uniform
 * and renders as a black screen with nothing in the console.
 *
 * @param elapsedSeconds Seconds of the room's clock since the doors closed.
 *   Before zero the car has not left; past `LIFT_SECONDS` it has arrived; and
 *   non-finite counts as arrived, so nobody is stranded between floors.
 * @param from The floor the doors closed on.
 * @param direction Which way the car is going.
 * @returns `uDepth`, between the departing floor's depth and the arriving floor's.
 *   Exactly `depthForFloor(from)` at and before zero, exactly
 *   `depthForFloor(floorAfter(from, direction))` at and after `LIFT_SECONDS`, and
 *   monotonic in between. A ride that cannot happen — called down from the lowest
 *   floor — never moves, because `floorAfter` gives back the floor it started on.
 */
export function depthAt(elapsedSeconds: number, from: Floor, direction: LiftDirection): number {
  const departed = depthForFloor(from);
  const arrived = depthForFloor(floorAfter(from, direction));

  // Clamp first, ease second. The ordering is the whole of the endpoint guarantee
  // — see the file comment — and it is also what keeps a corrupted clock out of the
  // trigonometry, since a NaN handed to Math.cos comes back as a NaN uniform.
  const elapsed = elapsedSeconds / LIFT_SECONDS;
  let travelled: number;
  if (Number.isNaN(elapsed) || elapsed >= 1) {
    travelled = 1;
  } else if (elapsed <= 0) {
    travelled = 0;
  } else {
    travelled = easeInOutSine(elapsed);
  }

  // Written as `(1 − t)·a + t·b` rather than `a + (b − a)·t`, which is the same
  // arithmetic and is not the same at the endpoints. `between` in `camera/drift.ts`
  // sets out the whole argument and it applies twice as hard here: the obvious form
  // is exact leaving a floor and inexact arriving at one, so the first leg would
  // land on 1 and the second on something indistinguishable from 2 — and
  // indistinguishable is precisely what the shader's branch cannot work with.
  return departed * (1 - travelled) + arrived * travelled;
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
export function easeInOutSine(elapsedTime: number): number {
  // Arranged so the leading term is the subtraction rather than a negation of it.
  // The algebraically identical `-1 * ((cos(pi t) - 1) / 2)` returns `-0` at zero,
  // which is numerically zero and fails `Object.is` — see the note in
  // `depthForFloor`, where the same one-character hazard is spelled out.
  return (1 - Math.cos(Math.PI * elapsedTime)) / 2;
}

/**
 * Whether a ride that started `elapsedSeconds` ago has finished.
 *
 * Asked once a frame by the component, which retires the lift and settles the
 * visitor onto a floor. Kept separate from `depthAt` rather than folded into a
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
