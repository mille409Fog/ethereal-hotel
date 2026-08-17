/**
 * Floor −1's five hours.
 *
 * `light-rig.ts` is this file's twin and carries the reasoning the two share: why
 * the states are uniforms rather than five shaders, why they do not blend, and why
 * a light's direction is written down as the point it lands on rather than as an
 * angle. What is worth saying here is the one thing that is different, and it is
 * not a detail.
 *
 * ## The corridor runs the other way
 *
 * Floor 0 gets brighter as the night ends. It has a window, the sun is on the far
 * side of it, and every rig from `open` to `shuttered` admits more light than the
 * one before — `verify-shader.mjs` asserts exactly that, as an ordering, and it is
 * the only automatic check on the whole concept.
 *
 * Floor −1 does the opposite, and it has to, because it has no window. Its light is
 * its own: seven gas sconces down one wall, which are full at astronomical night
 * and are *going out* as dawn approaches. AUBADE's description of the `late` state
 * is "rooms begin closing behind you, lights go out in the order you are not
 * looking", and this is that sentence with numbers in it. By `aubade` the corridor
 * is nearly dark. By `shuttered` the sconces are out altogether.
 *
 * So the corridor's ordering claim is the reverse of the lobby's, and asserting the
 * lobby's on it would be asserting the opposite of the truth. What is checked
 * instead is that `sconceStrength` never rises as the sun does, and that the shaft
 * is dark at every hour but the two at the end. Two rooms, two claims, one clock.
 *
 * ## And then the sun gets in anyway
 *
 * At `shuttered` the only light in the corridor that is not in the visitor's hand
 * comes down the lift shaft: a hard blade through the gap above the lift doors at
 * the far end, lying along the runner. It arrives through the very thing the
 * visitor descended in.
 *
 * That is the piece's whole argument in one lighting state. A building goes six
 * floors underground to be away from the sun; the sun comes down the lift. It is
 * also why `shuttered` is not a dead rig that only the committed frames ever see:
 * a visitor who goes down at three in the morning and stays is on this floor when
 * their own sunrise arrives, and what they see is the sconces failing one after
 * another and the day coming down the shaft. The Dawn phase is where that becomes
 * an event; the rig it will need is here already and is correct now. (Named rather
 * than numbered: AUBADE renumbers its list from 1 every time a phase lands, so a
 * number cited from outside that file is wrong within a commit or two.)
 *
 * Nothing here imports from `src/app/`, and the numbers are AUBADE's own.
 */

import type { IVec3 } from '../camera/drift';
import type { AubadeState } from '../solar/state';
import type { Rgb } from './light-rig';

/**
 * Everything the corridor needs to know about the hour.
 *
 * Adding a field here means adding a uniform in `renderer.ts` and reading it in
 * `hotel.frag.ts`; `npm run verify:shader` fails if the three ever disagree,
 * because it asks the linked program which uniforms it actually declares.
 *
 * There is deliberately no entry for the lamp the visitor carries. It is a GLSL
 * constant in `hotel.frag.ts` — the only light in the building the sun has no
 * opinion about, in a piece whose subject is that the sun decides everything.
 */
export interface ICorridorRig {
  /** The state this rig dresses. */
  readonly state: AubadeState;

  /** The sconces' colour. Gas, and it cools as it is turned down. */
  readonly sconceColour: Rgb;

  /**
   * How much of the corridor's own light is left. Monotonically non-increasing
   * across the five states, darkest hour first — which is the opposite of the
   * lobby and is the point.
   */
  readonly sconceStrength: number;

  /**
   * Unit vector along which the daylight travels, from the opening above the lift
   * doors into the corridor. Written as the point it lands on: the runner, six
   * metres short of the far wall, where the blade is a band across the carpet
   * rather than a stripe up a wall.
   */
  readonly shaftDirection: IVec3;

  /** What comes down the shaft: nothing, then the horizon, then the day. */
  readonly shaftColour: Rgb;

  /** Zero at every hour but the last two. Pre-tonemap, so above 1 by a lot. */
  readonly shaftStrength: number;

  /** Bounce off the runner and the marble. The warm half of the hemisphere. */
  readonly ambientFloor: Rgb;

  /** Off the ceiling. The cool half — and underground, there is no sky in it. */
  readonly ambientSky: Rgb;

  /**
   * Scattering in the air. Higher than the lobby at every hour: this is a
   * basement corridor nobody has opened a window in, and the dust is what gives
   * the blade of daylight a body to be visible in.
   */
  readonly dust: number;
}

/**
 * The direction the daylight travels down the shaft.
 *
 * One vector, shared by the two rigs that have any light in the shaft at all,
 * because the geometry of the opening does not change with the hour — only what
 * comes through it does. Derived from the landing point at (−0.12, 0, 9.0), which
 * is on the runner and clear of both the lift doors and the nearest pair of guest
 * doors.
 */
const SHAFT_DIRECTION: IVec3 = { x: -0.01885, y: -0.33307, z: -0.94271 };

/** The five rigs, darkest hour first — the order `AUBADE_STATES` walks. */
export const CORRIDOR_RIGS: Readonly<Record<AubadeState, ICorridorRig>> = {
  /**
   * Astronomical night, and the corridor at its best. Seven sconces at full gas,
   * a warm line of them receding down the right-hand wall and again down the
   * mirror. Nothing in the shaft. The ambient is as low as the lobby's, so the
   * pool from the lamp in the visitor's hand is unmistakably the brightest thing
   * near them — which is what makes its absence in the mirror carry.
   */
  open: {
    state: 'open',
    sconceColour: [1.0, 0.66, 0.32],
    sconceStrength: 2.0,
    shaftDirection: SHAFT_DIRECTION,
    shaftColour: [1.0, 0.97, 0.92],
    shaftStrength: 0,
    ambientFloor: [0.021, 0.017, 0.015],
    ambientSky: [0.016, 0.015, 0.018],
    dust: 1.35,
  },

  /**
   * The sky has started somewhere above, and down here that shows as the gas
   * dropping. This is the state whose description in AUBADE is rooms closing
   * behind you; the corridor loses about a third of its light and the far end
   * goes first, because the sconces at the far end are the ones a visitor
   * standing at the near end is not looking at.
   */
  late: {
    state: 'late',
    sconceColour: [1.0, 0.63, 0.29],
    sconceStrength: 1.4,
    shaftDirection: SHAFT_DIRECTION,
    shaftColour: [1.0, 0.97, 0.92],
    shaftStrength: 0,
    ambientFloor: [0.018, 0.015, 0.013],
    ambientSky: [0.014, 0.013, 0.016],
    dust: 1.3,
  },

  /**
   * Nautical twilight. The gas is low enough that the pools under the sconces no
   * longer meet, and the corridor becomes a line of separate lights with dark
   * between them rather than a lit space.
   */
  warning: {
    state: 'warning',
    sconceColour: [1.0, 0.59, 0.26],
    sconceStrength: 0.85,
    shaftDirection: SHAFT_DIRECTION,
    shaftColour: [1.0, 0.97, 0.92],
    shaftStrength: 0,
    ambientFloor: [0.015, 0.012, 0.011],
    ambientSky: [0.012, 0.011, 0.014],
    dust: 1.28,
  },

  /**
   * Civil twilight — the hour the hotel is named for, and the last one it has.
   * The sconces are nearly out. The first light comes down the shaft and it is the
   * colour of the horizon rather than of the day: faint, rose, and lying across
   * the runner at the far end where nobody standing here can reach it.
   *
   * This is the one frame in the corridor where two lights of different colours
   * are in shot at once, and the contrast between the last of the gas and the
   * first of the sun is the whole of what the room has to say about that hour.
   */
  aubade: {
    state: 'aubade',
    sconceColour: [1.0, 0.55, 0.24],
    sconceStrength: 0.36,
    shaftDirection: SHAFT_DIRECTION,
    shaftColour: [1.0, 0.62, 0.44],
    shaftStrength: 1.5,
    ambientFloor: [0.019, 0.014, 0.013],
    ambientSky: [0.015, 0.013, 0.016],
    dust: 1.4,
  },

  /**
   * Day, five floors underground.
   *
   * The gas is out — not low, out, because the hotel has shut and this floor is
   * not being kept for anybody. What is left is one hard blade of daylight through
   * the gap above the lift doors, lying along the runner, and the lamp in the
   * visitor's hand.
   *
   * The ambient is lifted well above the night rigs even though there is less
   * light in the room, and that is not a contradiction: a blade of direct sun
   * bouncing off marble puts more indirect light into a corridor than seven gas
   * sconces ever did. It is also what keeps the mirror legible at this hour. With
   * the sconces out the reflection has almost nothing left to show, and a mirror
   * showing nothing is not a supernatural event, it is an unfinished mirror — so
   * what it shows at noon is the blade, and the corridor around it, and still not
   * the lamp the visitor is holding.
   */
  shuttered: {
    state: 'shuttered',
    sconceColour: [1.0, 0.55, 0.24],
    sconceStrength: 0,
    shaftDirection: SHAFT_DIRECTION,
    shaftColour: [1.0, 0.97, 0.92],
    shaftStrength: 12,
    ambientFloor: [0.03, 0.025, 0.02],
    ambientSky: [0.02, 0.019, 0.021],
    dust: 2.2,
  },
};

/**
 * The corridor's rig for an hour, and for whether the visitor let themselves in.
 *
 * Mirrors `rigFor` exactly, and for the same reason: AUBADE says the invitation
 * "runs the full night piece", so a visitor who opened the night rooms in daylight
 * and then took the lift down gets the corridor at astronomical night rather than
 * a basement with the sun in it. The mark the invitation leaves is a line of
 * daylight under the lobby's door, one floor up, and it stays where it was left.
 *
 * @param state What the clock says the hotel is doing.
 * @param invited Whether the visitor opened the night rooms themselves. Ignored at
 *   every hour but the shuttered one; the caller is not required to know that.
 * @returns The rig to upload. Never null: every state has one, and an unknown
 *   value falls back to `open` rather than rendering an unlit corridor.
 */
export function corridorRigFor(state: AubadeState, invited = false): ICorridorRig {
  const rig = CORRIDOR_RIGS[state] ?? CORRIDOR_RIGS.open;

  if (!invited || rig.state !== 'shuttered') {
    return rig;
  }

  return { ...CORRIDOR_RIGS.open, state };
}
