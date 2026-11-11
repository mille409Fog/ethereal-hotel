/**
 * the numbers of the empty stage: how big the block is, where it is seen from, and how the placeholder is lit.
 * world units are metres throughout the piece, so a height read out of the simulation is a position in the scene.
 */

/** the block's side, in metres */
export const LAND_EXTENT = 8000;

/** the high three-quarter view the storm is watched from; the block is centred on the origin */
export const CAMERA_POSITION = [7600, 5200, 9800] as const;
export const CAMERA_TARGET = [0, 0, 0] as const;

/** vertical field of view on a landscape canvas, in degrees */
export const CAMERA_FOV = 32;
/** the aspect the view was composed at; a narrower canvas opens the lens to keep the same width of land in frame */
export const CAMERA_REFERENCE_ASPECT = 16 / 10;
/** metres. near is far enough out that the depth buffer keeps its precision across the block */
export const CAMERA_NEAR = 20;
export const CAMERA_FAR = 80000;

/** what is behind the block until the sky exists */
export const BACKDROP_COLOUR = 0x1b2530;
/** the placeholder's surface, a mid rock grey */
export const PLACEHOLDER_COLOUR = 0x8d8a82;

export const SUN_POSITION = [-6000, 5000, 3000] as const;
export const SUN_COLOUR = 0xffe2bd;
export const SUN_INTENSITY = 3.2;
export const SKY_LIGHT_COLOUR = 0x9fb8d4;
export const GROUND_LIGHT_COLOUR = 0x3a342c;
export const SKY_LIGHT_INTENSITY = 0.7;
