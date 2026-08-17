/**
 * Floor −4's clock, and the bench that operates everything except it.
 *
 * Every other floor of this hotel runs on continuous time. The lobby's dust turns
 * over, the corridor's lamp flickers at eleven and eighteen hertz, the cellar's
 * candle wobbles slowly — all of them evaluated at whatever second the frame
 * happens to land on, which is the ordinary way to animate anything and is
 * invisible when it is right.
 *
 * The Projection Room does not. It runs on a projector, and a projector is a
 * machine for making time discrete: the film is held still in the gate, lit, and
 * yanked on. Twenty-four times a second, if it is running properly. This file is
 * the whole of that — one quantisation, and the six switches on the bench beside
 * it — and like `cellar.ts` it knows nothing about WebGL and is a pure function of
 * the room's clock.
 *
 * ## Why the quantisation is here and not in GLSL
 *
 * It could be one `floor()` in the fragment shader and it would render the same
 * picture. It is here because the camera has to step too.
 *
 * A room where the *picture* judders and the *viewpoint* glides is a room with a
 * filter over it — the eye reads the smooth motion as the truth and the stepping as
 * an effect laid on top, which is precisely the reading this floor cannot afford.
 * AUBADE's first failure mode is the piece becoming a demo reel, six rooms of
 * unrelated effects with a hotel painted on, and a post-process that does not reach
 * the camera is exactly that. So `renderer.ts` evaluates `camera/drift.ts` at
 * `time` from here rather than at the wall second, weighted by the lift, and the
 * eye and the frame step together because they are the same number.
 *
 * That is only possible if the quantisation happens on this side of the uniform
 * upload, which is the whole argument for the file.
 *
 * ## What the sun does to this floor
 *
 * It slows the projector down, and then it stops it.
 *
 * The four floors above answer the hour with light arriving, light leaving, writing
 * leaving, and a visitor's own eye. This one answers with **time**, which is the
 * one dimension a projection room has that none of them do. Twenty-four frames a
 * second at astronomical night, eighteen, twelve, eight, and at noon the machine is
 * stopped dead with the lamp still on — one frame held in the gate, burning through
 * from the middle outward, which is what actually happens to a stationary frame in
 * front of an arc.
 *
 * The rates live in `rooms/projection-rig.ts`, with the other four floors' hours.
 * What lives here is the rule that turns one into a frame, and the rule's one
 * interesting case is the last of those five: **at a rate of zero the answer does
 * not depend on the second at all.** That is not a guard against division; it is the
 * floor's claim, and `verify-shader.mjs` renders the shuttered hour at two
 * different seconds and requires the two frames to be identical to the byte.
 */

/**
 * The six things a projector does to a picture on its way to the wall, in the
 * order the bench lists them.
 *
 * AUBADE names all six — "gate weave, halation, grain, 24fps judder, splice
 * flashes, reel-change cue dots" — and this is that list, in that order, spelled as
 * identifiers. It is the single source of the bench: the controls are generated
 * from it, the mask below is indexed by it, and a seventh effect is one entry here
 * and one bit there.
 */
export const FILM_STACK = ['weave', 'halation', 'grain', 'judder', 'splices', 'cues'] as const;

/** One item of the stack. */
export type FilmEffect = (typeof FILM_STACK)[number];

/** Which of the six are switched on. */
export type IBench = Readonly<Record<FilmEffect, boolean>>;

/**
 * The bench as the visitor finds it: everything on.
 *
 * Threaded up and running, rather than a bare machine they have to switch on piece
 * by piece. A visitor who arrives to six dead switches has been handed a
 * configuration screen, and the room's proposition is that they are standing behind
 * a projector that is already showing something.
 */
export const THREADED: IBench = {
  weave: true,
  halation: true,
  grain: true,
  judder: true,
  splices: true,
  cues: true,
};

/**
 * The bit each effect occupies in `uStack`.
 *
 * Declared twice — here and as six GLSL constants in `rooms/hotel.frag.ts`, which
 * cannot import — for the same reason `MORPH_EPSILON` is, and gated the same way:
 * `check:docs` fails if the two lists drift. A drifted pair looks entirely fine and
 * silently wires the halation switch to the grain.
 *
 * One integer rather than six float uniforms. WebGL2's GLSL is ES 3.00 and has
 * integer bitwise operators, so the shader reads this with an `&` and a compare;
 * six uniforms would have been six more names in the reflection check and six more
 * lines in three files for no gain.
 */
export const STACK_BITS: Readonly<Record<FilmEffect, number>> = {
  weave: 1,
  halation: 2,
  grain: 4,
  judder: 8,
  splices: 16,
  cues: 32,
};

/**
 * How long one reel runs, in seconds of the room's clock.
 *
 * A real reel is twenty minutes and nobody is standing in this room for twenty
 * minutes. Forty seconds is chosen from the other end: it is long enough that a
 * reel change is an event rather than a tic, and short enough that a visitor who
 * stays the ninety seconds Floor −3 asks for would see two of them.
 *
 * The cue dots are the only part of the projection stack a visitor is likely to
 * have seen deliberately — they are the thing Tyler Durden points at — so the
 * interval is set to make sure they are seen at all.
 */
export const REEL_SECONDS = 40;

/**
 * How far before the end of a reel the first cue comes, in seconds.
 *
 * The real convention, unchanged: the motor cue is about eight seconds out, so the
 * second projector can be run up to speed, and the changeover cue is about a fifth
 * of a second before the last frame. Both are four frames of a dot in the top right
 * corner, and both are in the room because the pair is the thing — one dot is a
 * blemish and two dots eight seconds apart is a machine talking to a person.
 */
export const CUE_LEAD_SECONDS = 8;

/** Frames a cue dot is held for. Four, which is the standard and is a sixth of a second. */
export const CUE_FRAMES = 4;

/**
 * Where the projector is in its show, and which frame of it is in the gate.
 *
 * Two numbers because the room needs both and they are not the same. `time` is what
 * everything continuous is evaluated at — the camera, the dust, the flicker — so
 * that all of it steps together. `index` is what everything *discrete* is keyed on:
 * the grain is redrawn per frame of film rather than per frame of display, the
 * splices are a hash of the frame number, and the cue dots count frames.
 *
 * Keeping them separate matters at the one rate where they disagree about nothing
 * and everything: at rate 0 both are held, and the grain being keyed on `index`
 * rather than on `time` is what stops a stopped projector from having crawling
 * grain on it. A stopped frame is a still photograph, and its grain is part of the
 * photograph.
 */
export interface IFilmFrame {
  /**
   * The second the room is drawn at: the instant the frame now in the gate was
   * struck. Never later than the second asked for.
   */
  readonly time: number;

  /** Which frame of the show it is. Integral, and monotone in `seconds`. */
  readonly index: number;
}

/**
 * Which frame of film is in the gate, at a given second of the room's clock and a
 * given projector speed.
 *
 * @param seconds The room's clock — `IFrame.simulatedSeconds`, not
 *   `performance.now()`. Non-finite input reads as the held frame, for the reason
 *   every other guard in this piece exists: a `NaN` here becomes a `NaN` uniform
 *   and a `NaN` uniform is a black screen with nothing in the console.
 * @param rate Frames per second, from `rooms/projection-rig.ts`. Zero is the
 *   shuttered hour and is not an error — see the file comment.
 * @returns The frame in the gate. `time` is the second that frame was struck at,
 *   which is at or before `seconds` and never after it; `index` is which frame of
 *   the show it is, and rises by one every `1 / rate` seconds.
 *
 *   At a rate of zero — or any rate that is negative or non-finite — the answer is
 *   the held frame, `{ time: 0, index: 0 }`, **and does not depend on `seconds`**.
 *   That exactness is Floor −4's whole answer to the sun and it is asserted rather
 *   than assumed.
 */
export function filmFrameAt(seconds: number, rate: number): IFilmFrame {
  // The held frame, and the three ways to arrive at it. Only the first is a real
  // state of the hotel — the shuttered hour, where the rig's rate is exactly zero —
  // and the other two are the guards every pure function in this piece carries, for
  // the reason `cellar.ts` gives about its own: a NaN here becomes a NaN uniform,
  // and a NaN uniform is a black screen with nothing in the console.
  //
  // Written as one test rather than as a division guard followed by a clock guard,
  // because they have the same answer and it is the same answer for the same reason.
  // Nothing is being pulled through the gate, so the frame in it is the frame that
  // was in it, and the frame that was in it is the first one.
  if (!Number.isFinite(seconds) || !Number.isFinite(rate) || rate <= 0) {
    return { time: 0, index: 0 };
  }

  // `floor`, not `round`. Rounding shows the frame *nearest* in time, which for half
  // of every interval is a frame that has not been struck yet — invisible in a still,
  // invisible in motion, and it would leave the room drawn from a clock half a frame
  // ahead of the one the grain and the cue dots are counting on.
  const index = Math.floor(seconds * rate);

  // Divided back out rather than accumulated, so the answer is a function of the
  // second it was asked about and not of how it was reached. At every rate in
  // `PROJECTION_RIGS` this is exact at the frame boundaries, which is what puts the
  // camera on its anchor at second zero.
  return { time: index / rate, index };
}

/**
 * The bench as one integer, for `uStack`.
 *
 * @param bench Which switches are down.
 * @returns The bits of the six effects that are on, or'd together. `0` is a bare
 *   machine — the beam, the room, and none of the apparatus — which is a legitimate
 *   thing to look at and is what the bench is for.
 */
export function benchMask(bench: IBench): number {
  let mask = 0;
  for (const effect of FILM_STACK) {
    if (bench[effect]) {
      mask |= STACK_BITS[effect];
    }
  }
  return mask;
}

/**
 * The bench with one switch thrown.
 *
 * A new object rather than a mutation, because the component holds this in a signal
 * and a signal that is written with the same reference it already has does not
 * notify — which renders as a switch that visibly moves and changes nothing.
 *
 * @param bench Where the bench stands.
 * @param effect The switch being thrown.
 * @returns A new bench with that one effect inverted.
 */
export function toggled(bench: IBench, effect: FilmEffect): IBench {
  return { ...bench, [effect]: !bench[effect] };
}
