import type { IThreeTuple } from '../cauldron/cauldron-flight';
import type { IAwareness } from './batoid-awareness';
import type { IBehaviourWeights } from './batoid-behavior';

export const PALETTE = {
  sky: 0xe8a06a, // warmer sky value
  ground: 0x1a1410, // altering ground to account for dusk
  sun: 0xffa860, //moving towards dusk
  batoid: 0x2b2b30,
  zenith: 0x2b0071, // using a deep indigo
  fill: 0x6a7fa8,
} as const;

export const CAULDRON = {
  count: 200,
  halfWidth: 1.44,
  halfHeight: 0.8,
  halfDepth: 0.6,
  batScale: 0.1,
} as const;

export const FLIGHT_SPEED = 0.314; // measured in units per second, we use a simpler formulation for now
export const MAX_PITCH = Math.PI / 12; // we set bounds on the pitch to model bat behavior, pi/2 pitch angles are unrealistic

export const AWARENESS: Readonly<IAwareness> = { separation: 0.2, alignment: 0.6, cohesion: 0.8 };
export const BEHAVIOUR_WEIGHTS: Readonly<IBehaviourWeights> = {
  separation: 1,
  alignment: 1,
  cohesion: 1,
  homing: 1,
};

/** the wingbeat, bent into the mesh on the GPU; a real bat beats nearer 10Hz, slowed here so the stroke reads */
export const WING_BEAT = {
  hertz: 3,
  /** how far a wingtip rises and falls, in the unscaled geometry's units, against a half-span of about 0.62 */
  tipLift: 0.25,
} as const;

/** banking into a turn as a coordinated flier does, tan(roll) = speed × turn rate / gravity.
 *  gravity is a dial rather than 9.81: scene units are not metres, and a smaller one banks harder */
export const BANKING = {
  gravity: 0.5,
  maxRoll: Math.PI / 4,
  /** the time constant a roll eases toward its target with, so a jittery steer does not shake the wings */
  easeSeconds: 0.25,
} as const;

export const TICK_SECONDS = 1 / 60;
export const CLAMP_SECONDS = 0.25;

/** the half-extents the flock launches inside, and the ellipsoid homing measures each bat against afterwards */
export const INITIAL_DIMENSIONS: Readonly<IThreeTuple> = {
  x: CAULDRON.halfWidth,
  y: CAULDRON.halfHeight,
  z: CAULDRON.halfDepth,
};
