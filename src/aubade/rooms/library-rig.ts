/**
 * Floor −2's five hours, four of which are the same hour.
 *
 * `light-rig.ts` is the original of this file and carries the reasoning all three
 * share: why the states are uniforms rather than five shaders, why they do not
 * blend, and why a light's direction is written down as the point it lands on
 * rather than as an angle. What is worth saying here is the one thing that is
 * different, and on this floor it is the whole room.
 *
 * ## The library does not answer the sun with its light
 *
 * Floor 0 gets brighter as the night ends: it has a window, the sun is on the far
 * side of it, and every rig from `open` to `shuttered` admits more light than the
 * one before. Floor −1 does the reverse, because it has no window and its gas is
 * being turned down. Two rooms, two opposite orderings, and `verify-shader.mjs`
 * asserts both.
 *
 * Floor −2 does neither, and that is not a gap in the design. **Every light in
 * this room is identical at all five hours.** The reading lamps are the same
 * colour and the same strength at astronomical night and at noon, the ambient does
 * not move, and the air holds the same dust. A visitor who takes the lift down at
 * three in the morning and a visitor who lets themselves in at two in the
 * afternoon are standing in rooms lit exactly alike.
 *
 * What the sun takes instead is the writing.
 *
 * `inkStrength` is the only field in this table that moves, and it runs from full
 * at astronomical night to *nothing* at noon. The gilt on the spines goes. The
 * lettering on the shelf labels goes. The room stays exactly as bright and, by
 * dawn, there is not one legible thing in it. That is Floor −2's answer to
 * AUBADE's first failure mode — a room that stops keeping the hotel's hours — and
 * it is a different answer from the two above it rather than a third dimmer
 * switch.
 *
 * It is also the room's own idea arriving early. The Library's subject is one
 * sentence that will not stay in a single writing system; the phase that puts that
 * sentence into the room reads this same uniform, so the sentence fades at dawn by
 * the same rule the spines already do. A floor whose subject is writing loses its
 * writing at sunrise, and keeps the light on so you can see that it has.
 *
 * ## Which is why four of these five entries are identical
 *
 * They are meant to be, character for character, and `check:docs` fails if they
 * stop being — see the check named for this file. A table where four of six fields
 * never vary looks like a copy-paste that got away, and the only way to say "this
 * floor's light does not answer the sun" in the same shape the other two floors
 * use is to write it out five times and assert that it stayed written.
 *
 * Nothing here imports from `src/app/`, and the numbers are AUBADE's own.
 */

import type { AubadeState } from '../solar/state';
import type { Rgb } from './light-rig';

/**
 * Everything the library needs to know about the hour — which, uniquely on this
 * floor, is almost nothing.
 *
 * Adding a field here means adding a uniform in `renderer.ts` and reading it in
 * `hotel.frag.ts`; `npm run verify:shader` fails if the three ever disagree,
 * because it asks the linked program which uniforms it actually declares.
 */
export interface ILibraryRig {
  /** The state this rig dresses. */
  readonly state: AubadeState;

  /**
   * The reading lamps' colour. Tungsten under a green shade — deliberately the
   * same bulb as the one on the desk three floors up, because it is the same
   * hotel and somebody bought them at the same time.
   */
  readonly readingColour: Rgb;

  /** How hard the reading lamps are driven. Identical at all five hours. */
  readonly readingStrength: number;

  /**
   * How much of the writing is left: the gilt on the spines, the shelf labels,
   * and in the phase that puts it there, the sentence itself.
   *
   * The only field on this floor the sun moves. Monotonically non-increasing
   * across the five states, darkest hour first, and exactly zero at `shuttered`
   * — not nearly zero. A library with a trace of gilt still catching the light at
   * noon is a library whose lettering got dim; a library with none is a library
   * that has stopped saying anything, which is the thing being claimed.
   */
  readonly inkStrength: number;

  /**
   * The stop into the tonemap, on this floor.
   *
   * Floor 0 has one of these too and Floor −1 borrows it, which was harmless while
   * the two of them shared a sun. It is not harmless here. `uExposure` is applied
   * in `tonemap` to the whole frame whatever floor it is of, so the lobby's daytime
   * stop — the one that opens up for a room full of sunlight — was reaching two
   * storeys underground and lifting the library at noon by about eight per cent.
   *
   * That is a small number and it broke the entire floor. The claim this room makes
   * is that its light does *not* change with the hour, and a room that is measurably
   * brighter at noon is not making it. So the library carries its own stop, it is
   * the same at all five hours like everything else here, and `tonemap` blends
   * towards it by the lift.
   */
  readonly exposure: number;

  /** Bounce off the boards and the paper. The warm half of the hemisphere. */
  readonly ambientFloor: Rgb;

  /** Off the plaster ceiling. The cool half — and underground, no sky in it. */
  readonly ambientSky: Rgb;

  /**
   * Scattering in the air. The highest in the building at every hour: this is a
   * room full of paper that nobody has opened a window on in a century, and the
   * dust is what gives the reading lamps a body to be visible in.
   */
  readonly dust: number;
}

/**
 * The light that does not change, written once and spread into all five rigs.
 *
 * Spread rather than referenced, so that each entry below is a complete rig a
 * reader can take in without assembling it — and so that the day somebody needs
 * one hour to differ, they change that hour rather than discovering that they
 * cannot.
 */
const CONSTANT_LIGHT = {
  readingColour: [1.0, 0.55, 0.2] as Rgb,
  readingStrength: 3.4,
  // The night-side stop the whole building is graded at. Deliberately not the
  // lobby's daytime 1.35 — no hour reaches this floor.
  exposure: 1.15,
  // As low as the two floors above, and for the same reason their comments give:
  // ambient is the enemy of a room lit by a few sources. Set nearer what a room
  // full of pale paper would really bounce, this came out as an evenly lit box
  // with no light in it anywhere — legible, and not a picture.
  ambientFloor: [0.013, 0.011, 0.009] as Rgb,
  ambientSky: [0.01, 0.0095, 0.011] as Rgb,
  dust: 1.5,
};

/** The five rigs, darkest hour first — the order `AUBADE_STATES` walks. */
export const LIBRARY_RIGS: Readonly<Record<AubadeState, ILibraryRig>> = {
  /**
   * Astronomical night. Every lamp lit, and every spine on both walls legible
   * from where the visitor is standing — the gilt catching the light in a long
   * receding line down each run of shelving, which is what a library at its best
   * looks like and is the state the other four are measured against.
   */
  open: {
    state: 'open',
    ...CONSTANT_LIGHT,
    inkStrength: 1.0,
  },

  /**
   * The sky has started somewhere above. The light has not moved and the gilt has
   * begun to. The far end of each run goes first, which is the same sentence
   * AUBADE writes about the corridor — "lights go out in the order you are not
   * looking" — with the lights left on.
   */
  late: {
    state: 'late',
    ...CONSTANT_LIGHT,
    inkStrength: 0.82,
  },

  /**
   * Nautical twilight, and the hour the room becomes uncomfortable. Half the
   * lettering is gone and the half that remains is legible, so a visitor can still
   * read some of the shelves and can see exactly how much they have lost.
   */
  warning: {
    state: 'warning',
    ...CONSTANT_LIGHT,
    inkStrength: 0.55,
  },

  /**
   * Civil twilight — the hour the hotel is named for. What is left on the spines
   * is a suggestion of gilt rather than a word, and nothing on this floor can be
   * read. The lamps are exactly as bright as they were at midnight, which is the
   * detail that makes the loss legible as a loss rather than as a dimming.
   */
  aubade: {
    state: 'aubade',
    ...CONSTANT_LIGHT,
    inkStrength: 0.24,
  },

  /**
   * Day, two floors underground, in a fully lit room with nothing written in it.
   *
   * Exactly zero, and the exactness is the point: this is the one hour at which
   * the library has no content whatever. Every shelf, every spine and every label
   * is blank, under lamps burning at the same strength they burn at three in the
   * morning. It is the piece's argument at its plainest — the sun does not have to
   * reach a room to close it.
   */
  shuttered: {
    state: 'shuttered',
    ...CONSTANT_LIGHT,
    inkStrength: 0,
  },
};

/**
 * The library's rig for an hour, and for whether the visitor let themselves in.
 *
 * Mirrors `rigFor` and `corridorRigFor` exactly, and for the same reason: AUBADE
 * says the invitation "runs the full night piece", so a visitor who opened the
 * night rooms in daylight and then took the lift down twice gets the library with
 * its writing intact rather than a reading room full of blank books. The mark the
 * invitation leaves is a line of daylight under the lobby's door, two floors up,
 * and it stays where it was left.
 *
 * @param state What the clock says the hotel is doing.
 * @param invited Whether the visitor opened the night rooms themselves. Ignored at
 *   every hour but the shuttered one; the caller is not required to know that.
 * @returns The rig to upload. Never null: every state has one, and an unknown
 *   value falls back to `open` rather than rendering an unreadable library.
 */
export function libraryRigFor(state: AubadeState, invited = false): ILibraryRig {
  const rig = LIBRARY_RIGS[state] ?? LIBRARY_RIGS.open;

  if (!invited || rig.state !== 'shuttered') {
    return rig;
  }

  return { ...LIBRARY_RIGS.open, state };
}
