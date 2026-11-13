/**
 * every number the land is drawn with: where the sun stands, how far a shadow is looked for, and what the ground
 * is coloured by. the model's own numbers are in `model/erosion-calibration.ts`; nothing here changes the land,
 * only how it is seen.
 *
 * all of it is provisional until the phase that tunes the look, and was set to be legible and no more: rock that
 * reads as rock, a sun low enough to throw a valley into shade. colours are linear. the three lights are what a
 * white surface facing them sends back, so the division by pi that a physical material makes is already in them:
 * they are the stage's old sun and sky, the ones the slab is still lit by, divided by it.
 *
 * each key is a uniform of the same name; `land-shaders.ts` lists which shader reads which. so a number added
 * here does nothing until it is added to a list there, and the land's spec fails on a key no list names.
 *
 * a leaf module: it imports nothing, so Node can import it. see `model/fields.ts`.
 */

/** linear red, green and blue */
export type Colour = readonly [number, number, number];

export interface ILandLook {
  /** where the sun is: degrees round from +x toward +z, and degrees above the horizon */
  readonly sunBearing: number;
  readonly sunElevation: number;
  /** the sun's light on a surface that faces it, and the sky's on one that faces up */
  readonly sunColour: Colour;
  readonly skyColour: Colour;
  /** what a surface facing down is lit by: the sky's light come back off the ground */
  readonly groundColour: Colour;

  /** how many times the march toward the sun looks at the land, and how far it goes, metres */
  readonly shadowSteps: number;
  readonly shadowReach: number;
  /** how quickly a ray that only just clears a ridge comes out of its shadow; higher is a harder edge */
  readonly shadowSoftness: number;
  /** the ray starts this far above the ground, so a slope does not shade itself by rounding, metres */
  readonly shadowBias: number;
  /** how far out the horizon is looked for in each of the eight directions, metres, and in how many looks */
  readonly occlusionRadius: number;
  readonly occlusionSteps: number;
  /** how much of the sky a full horizon is taken to hide */
  readonly occlusionStrength: number;

  /**
   * the bottom of the block's cut sides, metres. it is about where the stack of beds ends, so the whole wall is
   * a section; the fog deck, when there is one, lies above it and decides how much of the wall is seen
   */
  readonly skirtFloor: number;

  /** regolith this thick hides the bedrock under it entirely, metres */
  readonly regolithFull: number;
  /** loose ground is silt where it lies flatter than the first and scree where steeper than the second, as 1 − normal.y */
  readonly screeFrom: number;
  readonly screeTo: number;
  readonly screeColour: Colour;
  readonly siltColour: Colour;

  /** snow begins at the line and is whole a band above it, metres; slopes between the two steepnesses shed it */
  readonly snowLine: number;
  readonly snowBand: number;
  readonly snowSlopeFrom: number;
  readonly snowSlopeTo: number;
  readonly snowColour: Colour;

  /** plants: none above the line, thinning over the band below it, metres */
  readonly greenLine: number;
  readonly greenBand: number;
  /** none on ground steeper than the second, as 1 − normal.y */
  readonly greenSlopeFrom: number;
  readonly greenSlopeTo: number;
  /** soil this deep carries full cover, metres, and water this deep counts as a bank, metres */
  readonly greenSoil: number;
  readonly greenWater: number;
  /** the share of full cover that ground away from water gets */
  readonly greenDry: number;
  readonly greenColour: Colour;

  /** the size of one lump of the fine relief on bare rock and on loose ground, metres */
  readonly rockGrain: number;
  readonly looseGrain: number;
  /** how far that relief tips the normal, on rock, on scree and on silt */
  readonly rockRough: number;
  readonly screeRough: number;
  readonly siltRough: number;

  /**
   * ground is wholly wet under water this deep, metres. it is a film's depth and far below what is drawn as
   * water: the film a cell keeps after its water has run off, until evaporation takes it, is the model's own
   * record of where water lately was
   */
  readonly wetDepth: number;
  /** what wet ground's colour is multiplied by */
  readonly wetDarken: number;
  /** how tight the sun's glint on wet ground is, as a specular exponent, and the share of the sun it sends back */
  readonly wetGloss: number;
  readonly wetShine: number;
}

export const LAND_LOOK: ILandLook = {
  sunBearing: 153,
  sunElevation: 28,
  sunColour: [1.02, 0.77, 0.52],
  skyColour: [0.078, 0.107, 0.147],
  groundColour: [0.01, 0.008, 0.006],

  shadowSteps: 48,
  shadowReach: 3600,
  shadowSoftness: 6,
  shadowBias: 0.5,
  occlusionRadius: 220,
  occlusionSteps: 4,
  occlusionStrength: 1,

  skirtFloor: -450,

  regolithFull: 1.5,
  screeFrom: 0.06,
  screeTo: 0.22,
  screeColour: [0.3, 0.29, 0.28],
  siltColour: [0.55, 0.49, 0.39],

  snowLine: 1650,
  snowBand: 120,
  snowSlopeFrom: 0.25,
  snowSlopeTo: 0.45,
  snowColour: [0.88, 0.9, 0.94],

  greenLine: 1300,
  greenBand: 400,
  greenSlopeFrom: 0.08,
  greenSlopeTo: 0.3,
  greenSoil: 0.5,
  greenWater: 0.05,
  greenDry: 0.35,
  greenColour: [0.07, 0.12, 0.04],

  rockGrain: 9,
  looseGrain: 4,
  rockRough: 0.5,
  screeRough: 0.7,
  siltRough: 0.12,

  wetDepth: 2e-3,
  wetDarken: 0.6,
  wetGloss: 60,
  wetShine: 0.05,
};

const DEGREES = 180 / Math.PI;

/** the unit vector from the land toward the sun; y is up */
export function sunDirection(look: ILandLook): [number, number, number] {
  const bearing = look.sunBearing / DEGREES;
  const elevation = look.sunElevation / DEGREES;
  return [
    Math.cos(elevation) * Math.cos(bearing),
    Math.sin(elevation),
    Math.cos(elevation) * Math.sin(bearing),
  ];
}
