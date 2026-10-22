import type { IThreeTuple } from '../cauldron/cauldron-flight';

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

export const TICK_SECONDS = 1 / 60;
export const CLAMP_SECONDS = 0.25;

export const INITIAL_DIMENSIONS: Readonly<IThreeTuple> = {
  x: CAULDRON.halfWidth,
  y: CAULDRON.halfHeight,
  z: CAULDRON.halfDepth,
};
