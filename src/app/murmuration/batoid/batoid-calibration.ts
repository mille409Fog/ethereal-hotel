export const PALETTE = {
  sky: 0x96ded1,
  ground: 0x2e2a1f,
  sun: 0xf3d9c4,
  batoid: 0x2b2b30,
} as const;

export const SPIN_RADIANS_PER_SECOND = Math.PI / 8;

export const TICK_SECONDS = 1 / 60;
export const CLAMP_SECONDS = 0.25;

export const CAULDRON = {
  count: 200,
  halfWidth: 1.2,
  halfHeight: 0.5,
  halfDepth: 0.1,
  batScale: 0.1,
} as const;
