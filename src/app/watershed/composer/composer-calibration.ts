/**
 * the post-processing chain's numbers. all of them are placeholders in the sense that matters: the phase that
 * tunes the look sets them with the land, the water and the air running, and a value chosen before those exist is
 * chosen blind. they are set here to do as little as possible, so nothing built meanwhile is flattered by them.
 */
import { IGrade } from '../../murmuration/grade/grade-pass/grade-pass';

/** only light brighter than display white blooms: the sun on water, later, and nothing on the placeholder */
export const BLOOM_THRESHOLD = 1;
export const BLOOM_STRENGTH = 0.35;
export const BLOOM_RADIUS = 0.6;

/** the identity grade: no lift, no gain, midtones where the tone mapping put them */
export const GRADE: IGrade = {
  shadowTint: 0x000000,
  shadowStrength: 0,
  highlightTint: 0xffffff,
  highlightStrength: 0,
  gamma: 1,
};

/** lighter than murmuration's: this picture is mostly mid-tones, where grain reads as noise sooner */
export const GRAIN_INTENSITY = 0.035;
