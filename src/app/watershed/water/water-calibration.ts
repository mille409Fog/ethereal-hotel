/**
 * every number the water is drawn with. none of them says where water is: that is the simulation's `land`
 * texture and nothing else. these say how deep water has to be before it is drawn as water, and what it looks
 * like once it is.
 *
 * all of it is provisional until the phase that tunes the look, and was set to be legible and no more. the two
 * depths were set against a measurement, though, and should move only against another: on the hero seed's land
 * in the rain half the cells hold under a millimetre and nine in ten under seven, which is a film on a hillside
 * and is the wet ground's to show (`land-calibration.ts`), while the channels hold centimetres to metres and the
 * lakes tens of metres. `waterFrom` sits between the two populations.
 *
 * colours are linear. each key is a uniform of the same name; `water-shaders.ts` lists which are read.
 *
 * a leaf module: it imports types and nothing else, so Node can import it. see `model/fields.ts`.
 */
import type { Colour } from '../land/land-calibration';

export interface IWaterLook {
  /** water shallower than the first is not drawn; it comes in over the range to the second, metres */
  readonly waterFrom: number;
  readonly waterFull: number;

  /** how much of each of red, green and blue a metre of clear water takes out of the light crossing it, 1/m */
  readonly absorption: Colour;
  /** what clear water deep enough to hide its bed sends back of the light that falls on it */
  readonly deepColour: Colour;
  /** suspended sediment this thick makes the water wholly turbid, metres */
  readonly turbidFull: number;
  /** what a metre of wholly turbid water takes out of the light, every colour alike, 1/m */
  readonly turbidExtinction: number;
  /** what wholly turbid water sends back of the light that falls on it: the silt it carries */
  readonly turbidColour: Colour;

  /** the size of one lump of the ripples, metres */
  readonly rippleGrain: number;
  /** seconds for which a pattern of ripples is carried along the flow before it is swapped for a fresh one */
  readonly ripplePeriod: number;
  /** how far the ripples tip the surface on water moving at `rippleSpeed`, metres a second, or faster */
  readonly rippleStrength: number;
  readonly rippleSpeed: number;

  /** whitewater begins at the first speed and is whole at the second, metres a second */
  readonly foamSpeedFrom: number;
  readonly foamSpeedTo: number;
  /** and where the surface is steeper than the first and whole at the second, as 1 − normal.y */
  readonly foamSlopeFrom: number;
  readonly foamSlopeTo: number;
  readonly foamColour: Colour;

  /** the share of light water reflects when looked straight down into */
  readonly reflectance: number;
  /** how tight the sun's glint on the water is, as a specular exponent */
  readonly sunGloss: number;

  /**
   * the water is drawn this much nearer than it is, as the two numbers of a polygon offset. shallow water lies
   * closer to its bed than the depth buffer can tell apart at the far side of the block
   */
  readonly offsetFactor: number;
  readonly offsetUnits: number;
}

export const WATER_LOOK: IWaterLook = {
  waterFrom: 0.02,
  waterFull: 0.15,

  absorption: [1.6, 0.5, 0.35],
  deepColour: [0.03, 0.16, 0.2],
  turbidFull: 4,
  turbidExtinction: 6,
  turbidColour: [0.42, 0.36, 0.26],

  rippleGrain: 14,
  ripplePeriod: 4,
  rippleStrength: 0.35,
  rippleSpeed: 3,

  foamSpeedFrom: 4,
  foamSpeedTo: 9,
  foamSlopeFrom: 0.02,
  foamSlopeTo: 0.12,
  foamColour: [0.8, 0.82, 0.85],

  reflectance: 0.02,
  sunGloss: 300,

  offsetFactor: -2,
  offsetUnits: -8,
};

/**
 * how far through its period the ripples' pattern is, in [0, 1), at `seconds` on any clock that only runs
 * forward. the shader draws two patterns half a period apart and fades each out as it comes round to be swapped,
 * so neither is ever seen stretched further than half a period of flow, and neither is seen to jump
 */
export function ripplePhase(seconds: number, look: IWaterLook): number {
  const turns = seconds / look.ripplePeriod;
  return turns - Math.floor(turns);
}
