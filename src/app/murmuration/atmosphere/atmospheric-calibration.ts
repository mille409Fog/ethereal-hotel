/** generates constants used to calibrate the atmosphere */

// measured from the camera, so they follow its distance: clear to the flock's near edge, about 6.6 to its centre,
// and gone a little past its far edge, so the far side of the mass recedes rather than vanishing
export const FOG_NEAR = 5;

export const FOG_FAR = 9.5;

export const SKY_DOME_RADIUS = 50;

export const SKY_DOME_WIDTH_SEGMENTS = 32;

export const SKY_DOME_HEIGHT_SEGMENTS = 16;

export const BLOOM_STRENGTH = 1.5;

export const BLOOM_RADIUS = 0.4;

export const BLOOM_THRESHOLD = 0.85;
