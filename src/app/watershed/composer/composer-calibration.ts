/**
 * the post-processing chain's numbers. all of them are placeholders in the sense that matters: the phase that
 * tunes the look sets them with the land, the water and the air running, and a value chosen before those exist is
 * chosen blind. they are set here to do as little as possible, so nothing built meanwhile is flattered by them.
 */
import { IGrade } from '../../murmuration/grade/grade-pass/grade-pass';

/** samples a pixel of the buffer the scene is drawn into; see `watershed.tokens.ts` */
export const COMPOSER_SAMPLES = 0;

/** only light brighter than display white blooms: the sun on water, later, and nothing on the placeholder */
export const BLOOM_THRESHOLD = 1;
export const BLOOM_STRENGTH = 0.35;
export const BLOOM_RADIUS = 0.6;

/**
 * set against the hero frame, and small: the light already makes the picture warm where the low sun reaches and
 * blue where only the sky does, so the grade leans the same two ways and adds no colour of its own. the shadow
 * tint is the clear zenith (`clearZenith` in the air's calibration, linear 0.035, 0.07, 0.16) as display values,
 * and the highlight tint the low sun's gold; the midtones open a little because the land's shaded side, which
 * the hero shot shows half of, sat heavy at the identity
 */
export const GRADE: IGrade = {
  shadowTint: 0x334a70,
  shadowStrength: 0.04,
  highlightTint: 0xffcc88,
  highlightStrength: 0.05,
  gamma: 1.08,
};

/** lighter than murmuration's: this picture is mostly mid-tones, where grain reads as noise sooner */
export const GRAIN_INTENSITY = 0.035;
