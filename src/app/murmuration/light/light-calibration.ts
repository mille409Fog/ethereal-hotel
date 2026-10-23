/** constants which govern the light mechanics */
import { FOG_FAR, FOG_NEAR } from '../atmosphere/atmospheric-calibration';
import { PALETTE } from '../batoid/batoid-calibration';

export const KEY_LIGHT_POSITION = [-3, 0.6, -4] as const;

/** the sun-coloured lights carry 1/0.82 of their orange-sun values, so the rose sun changes the hue and not the light */
export const KEY_LIGHT_INTENSITY = 4.9;

export const RIM_LIGHT_POSITION = [3, 1, -3] as const;

export const RIM_LIGHT_INTENSITY = 1.22;

export const HEMISPHERE_LIGHT_INTENSITY = 0.3;

export const VIGNETTER_DARKNESS = 1;

export const VIGNETTE_OFFSET = 0.8;

/** how the light shafts fade out as the sun leaves the frame */
export interface ISunFade {
  /** how far past the frame's edge, in fractions of the frame, before the shafts are gone */
  readonly edgeMargin: number;
  /** the `dot` of the view and the sun below which the shafts begin to fade; 0 is the sun at 90° */
  readonly facingMargin: number;
}

export interface IGodRaysCalibration extends ISunFade {
  /** the shafts are built at this fraction of the frame's resolution */
  readonly maskScale: number;
  /** the sun disc's radius, as a fraction of the frame's height */
  readonly sunRadius: number;
  /** how much of that radius is a soft edge rather than a hard one */
  readonly sunSoftness: number;
  /** steps marched toward the sun per pixel; a GLSL loop bound, so fixed at compile time */
  readonly samples: number;
  /** how much of the way to the sun those steps cover, 1 being all of it */
  readonly density: number;
  /** each step counts for this much of the one before it, so far-off sun weighs less */
  readonly decay: number;
  readonly weight: number;
  readonly exposure: number;
  readonly colour: number;
  /** bats nearer than this block the sun completely */
  readonly occlusionNear: number;
  /** bats further than this block nothing: they are lost in the fog */
  readonly occlusionFar: number;
}

export const GOD_RAYS: IGodRaysCalibration = {
  edgeMargin: 0.3,
  facingMargin: 0.2,
  maskScale: 0.5,
  sunRadius: 0.1,
  sunSoftness: 0.05,
  samples: 60,
  density: 0.9,
  decay: 0.96,
  weight: 0.4,
  exposure: 0.23, // sun-coloured, so compensated as the lights are
  colour: PALETTE.sun,
  // the same distances as the fog, so a bat stops casting a shadow exactly as it stops being seen
  occlusionNear: FOG_NEAR,
  occlusionFar: FOG_FAR,
};
