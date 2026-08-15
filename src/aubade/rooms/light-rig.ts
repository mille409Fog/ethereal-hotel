/**
 * Five states, five palettes, five light rigs.
 *
 * `solar/state.ts` answers what the hotel is doing; this answers what that looks
 * like. It is the join between the clock and the room, and it is deliberately
 * plain data — one record per state, uploaded to the shader as uniforms — because
 * the alternative is five fragment shaders, five compiles, and a visitor watching
 * dawn arrive as a black frame while a driver recompiles a raymarcher.
 *
 * ## Why the states do not blend
 *
 * They could. The boundaries are elevations, elevation is continuous, and lerping
 * two rigs is four lines. They do not, for two reasons. AUBADE's phase for this
 * work asks for five states that can be screenshotted as five images, and a
 * continuum has no five images in it. And the states are supposed to be *legible*
 * — a visitor who returns an hour later should be able to say the hotel is doing
 * something different, which a gradient hides by construction. The one moment
 * where a cut would be felt as a cut is a visitor sitting through actual dawn,
 * and that is Dawn's problem to solve, with the whole arrival of the light to
 * spend on it rather than a lerp.
 *
 * ## The key light's direction
 *
 * The transom is a fixed rectangle in a fixed wall, so a rig cannot simply state
 * an azimuth and an elevation and expect the beam to be in shot. What decides the
 * picture is where the beam *stops* — the pool it throws on the floor — so each
 * direction below is derived from the point it lands on, and the landing point is
 * what is written down. The shader's file comment has the full version of this
 * mistake; the short one is that a beam aimed at a wall lights the faces pointing
 * away from the camera and reads as a window doing nothing.
 *
 * The angles also carry the astronomy, loosely. Night light comes in steeply
 * because it is a moon well up in the sky; `aubade` comes in almost flat because
 * the sun is minutes below the horizon and its light is arriving along the
 * ground; `shuttered` is steepest of all, because it is the middle of the day.
 *
 * Nothing here imports from `src/app/`, and the numbers are AUBADE's own —
 * see the note at the top of `aubade.css`.
 */

import type { IVec3 } from '../camera/drift';
import type { AubadeState } from '../solar/state';

/** Linear RGB as the shader wants it. Values above 1 are legal for emitters. */
export type Rgb = readonly [number, number, number];

/**
 * Everything the lobby shader needs to know about the hour.
 *
 * One rig is one complete lighting state: the aperture, what comes through it,
 * what the room does with it, and how the whole thing is exposed. Adding a field
 * here means adding a uniform in `renderer.ts` and reading it in `hotel.frag.ts`;
 * `npm run verify:shader` fails if the three ever disagree.
 */
export interface ILightRig {
  /** The state this rig dresses. */
  readonly state: AubadeState;

  /**
   * Unit vector along which the key light *travels* — from the transom into the
   * room, so it points down and towards the camera. Not a direction to the sun.
   */
  readonly keyDirection: IVec3;

  /** The key light's colour: moonlight, pre-dawn sky, sunrise, or daylight. */
  readonly keyColour: Rgb;

  /** How hard the key light is driven. Pre-tonemap, so above 1 by a lot. */
  readonly keyStrength: number;

  /** What the transom itself reads as — the sky beyond the glass. */
  readonly paneColour: Rgb;

  /** The pane's emitted strength. It is the brightest thing in every night frame. */
  readonly paneStrength: number;

  /**
   * The desk lamp. Zero in daylight: a lamp left burning at noon is a set
   * dressing error, and switching it off is what makes the day read as day
   * rather than as the night frame with the brightness turned up.
   */
  readonly lampStrength: number;

  /** Bounce off the floor. The warm half of the ambient hemisphere. */
  readonly ambientFloor: Rgb;

  /** Light from the ceiling. The cool half, and the one the sky drives. */
  readonly ambientSky: Rgb;

  /** Scattering in the air, relative to the night rig. Daylight has more of it. */
  readonly dust: number;

  /**
   * The shutter over the transom: 0 open, 1 closed. Above 0.5 the louvres exist
   * as geometry and the beam is cut into bars by them, which is the whole of the
   * daytime picture.
   */
  readonly shutter: number;

  /**
   * How far the palette is pulled towards a warm, faded pale. Zero at every hour
   * but one.
   *
   * This is the daytime piece's palette and not a claim about physics — a
   * sun-faded surface would be faded at midnight too. It earns its place by being
   * applied to albedo rather than to the frame: taking the colour out of the
   * *materials* leaves the shadows exactly where they are, where taking it out of
   * the output lifts them and reads as a badly graded photograph.
   */
  readonly bleach: number;

  /** Exposure into the tonemap. The day is deliberately over it. */
  readonly exposure: number;

  /**
   * A hairline of daylight under the door, 0 to 1. Zero for every honest hour:
   * this is the mark left by the invitation, and it is set by `rigFor` rather
   * than by any state. See `INVITED_THRESHOLD`.
   */
  readonly threshold: number;
}

/**
 * How bright the daylight under the door is when a visitor let themselves in.
 *
 * AUBADE requires the invitation to leave "a faint permanent marker that this was
 * not your hour", and this is it: the night rooms, exactly as they are at three
 * in the morning, with one thin bar of the day you brought with you lying across
 * the marble at the foot of the door. It is the oldest image the form has. Faint
 * on purpose — a visitor should find it rather than be shown it.
 */
export const INVITED_THRESHOLD = 0.55;

/** The five rigs, darkest first — the order `AUBADE_STATES` walks. */
export const LIGHT_RIGS: Readonly<Record<AubadeState, ILightRig>> = {
  /**
   * Astronomical night. The room the lobby was built for: one moon, one lamp,
   * and an ambient low enough that the shaft is the brightest thing in the frame.
   * Beam lands at (−0.40, 0, 0.60) — open marble, left of centre, clear of the
   * desk.
   */
  open: {
    state: 'open',
    keyDirection: { x: 0.41752, y: -0.7832, z: -0.46071 },
    keyColour: [0.42, 0.58, 0.92],
    keyStrength: 3.4,
    paneColour: [0.42, 0.58, 0.92],
    paneStrength: 1.55,
    lampStrength: 3.4,
    ambientFloor: [0.022, 0.019, 0.024],
    ambientSky: [0.027, 0.033, 0.05],
    dust: 1,
    shutter: 0,
    bleach: 0,
    exposure: 1.15,
    threshold: 0,
  },

  /**
   * Astronomical twilight has begun and the sky is no longer black. The beam
   * steepens and shortens — the moon is getting lower and the room is starting to
   * lose it — and the first ambient light arrives, cold. Lands at (−0.55, 0,
   * 0.90), a little further from the camera than `open`.
   */
  late: {
    state: 'late',
    keyDirection: { x: 0.39597, y: -0.8285, z: -0.39597 },
    keyColour: [0.4, 0.55, 0.9],
    keyStrength: 2.7,
    paneColour: [0.4, 0.56, 0.94],
    paneStrength: 2,
    lampStrength: 3.4,
    ambientFloor: [0.026, 0.024, 0.032],
    ambientSky: [0.036, 0.046, 0.075],
    dust: 1.05,
    shutter: 0,
    bleach: 0,
    exposure: 1.15,
    threshold: 0,
  },

  /**
   * Nautical twilight — the hour the desk clerk starts mentioning the time. The
   * sky through the transom is now plainly blue and bright enough to compete with
   * the lamp, so the shaft loses its authority even as the room gets easier to
   * read. Lands at (−0.20, 0, 0.20).
   */
  warning: {
    state: 'warning',
    keyDirection: { x: 0.4391, y: -0.72382, z: -0.53223 },
    keyColour: [0.4, 0.53, 0.87],
    keyStrength: 2.1,
    paneColour: [0.46, 0.6, 0.98],
    paneStrength: 2.7,
    lampStrength: 3.1,
    ambientFloor: [0.034, 0.033, 0.042],
    ambientSky: [0.052, 0.066, 0.1],
    dust: 1.1,
    shutter: 0,
    bleach: 0,
    exposure: 1.15,
    threshold: 0,
  },

  /**
   * Civil twilight, and the piece's climax. The sun is minutes below the horizon,
   * so its light arrives along the ground: the beam comes in almost flat, throws
   * the longest shaft the room ever sees, and turns from blue to rose in the one
   * transition here anybody will remember. Lands at (0.35, 0, −1.40), well
   * towards the camera and across the front of the desk.
   */
  aubade: {
    state: 'aubade',
    keyDirection: { x: 0.43827, y: -0.54186, z: -0.71716 },
    keyColour: [1.0, 0.55, 0.38],
    keyStrength: 4.4,
    paneColour: [1.0, 0.62, 0.46],
    paneStrength: 1.7,
    lampStrength: 2.4,
    ambientFloor: [0.042, 0.034, 0.032],
    ambientSky: [0.05, 0.052, 0.068],
    dust: 1.2,
    shutter: 0,
    bleach: 0,
    exposure: 1.15,
    threshold: 0,
  },

  /**
   * Day, and the second piece rather than the empty one.
   *
   * The louvres are down, so the direct light in the room is six bars of it lying
   * across the marble and nothing else; everything beyond them is what those bars
   * bounce off the floor and the ceiling, and the lamp is out. A room shut against
   * daylight is *still a dark room* — that is what makes the bars hard, and it is
   * the thing the first attempt at this got wrong. Over-exposing the whole frame
   * produced a white room with no light in it, which is a rendering of the word
   * "bright" rather than a picture of an afternoon.
   *
   * So the drive goes into the key rather than into the exposure: the bars clip
   * to white on their own, the dust in them is nearly double the night's, and the
   * ambient is only a little above three in the morning. Beam lands at (−0.55, 0,
   * −0.20) — shallower than the night rigs on purpose, so the bars stretch across
   * the chequer towards the camera instead of pooling at the foot of the door.
   */
  shuttered: {
    state: 'shuttered',
    keyDirection: { x: 0.38526, y: -0.65495, z: -0.65014 },
    keyColour: [1.0, 0.97, 0.92],
    keyStrength: 13,
    paneColour: [1.0, 0.99, 0.96],
    paneStrength: 6,
    lampStrength: 0,
    ambientFloor: [0.135, 0.115, 0.092],
    ambientSky: [0.115, 0.118, 0.128],
    dust: 3,
    shutter: 1,
    bleach: 0.28,
    exposure: 1.35,
    threshold: 0,
  },
};

/**
 * The rig for an hour, and for whether the visitor was invited or let themselves
 * in.
 *
 * The second argument is the whole of the invitation's effect on the render.
 * AUBADE is explicit that taking it "runs the full night piece" — not a
 * compromise between day and night, not a dimmed version, the piece — so this
 * returns the `open` rig unchanged except for the one thing that says the hour
 * was not yours.
 *
 * It applies only while the hotel is actually shut, and that is not a guard
 * against a caller mistake. A visitor can take the invitation at four in the
 * afternoon and still be on the page at sunset; from that moment the hotel is
 * open of its own accord, the night is theirs by right rather than by request,
 * and the mark goes. The invitation was never a mode — it was a door, and once
 * the door is open anyway there is nothing to have let yourself through.
 *
 * @param state What the clock says the hotel is doing.
 * @param invited Whether the visitor opened the night rooms themselves. Ignored
 *   at every hour but the shuttered one; the caller is not required to know that.
 * @returns The rig to upload. Never null: every state has one, and an unknown
 *   value falls back to `open` rather than rendering nothing.
 */
export function rigFor(state: AubadeState, invited = false): ILightRig {
  const rig = LIGHT_RIGS[state] ?? LIGHT_RIGS.open;

  if (!invited || rig.state !== 'shuttered') {
    return rig;
  }

  return { ...LIGHT_RIGS.open, state, threshold: INVITED_THRESHOLD };
}
