/**
 * every number the air is drawn with: the sky, the sun's light through it, the haze and the mist, the deck of
 * cloud the block stands in, the shadows of the clouds overhead, and the rain.
 *
 * none of it says what the weather is. that is `weather`, a uniform in [0, 1] from overcast to clear, which the
 * storm sets; these say what each end of it looks like. and none of it says where mist lies: that is the light
 * pass's humidity, a blur of the simulation's own water (`land/land-shaders.ts`).
 *
 * all of it is provisional until the phase that tunes the look, and was set to be legible and no more. colours
 * are linear. a light is what a white surface facing it sends back, so the division by pi a physical material
 * makes is already in it, as it is in the land's numbers; and a sky's radiance is then exactly what a white
 * surface under a whole sky of it sends back, which is why the ground can be lit by the sky function itself.
 *
 * each key is a uniform of the same name; `air-shaders.ts` lists which shader reads which, and the air's spec
 * fails on a key no list names.
 *
 * a leaf module: it imports types and nothing else, so Node can import it. see `model/fields.ts`.
 */
import type { Colour } from '../land/land-calibration';

export interface IAirLook {
  /** the sun's light above the air, and how much of each colour one thickness of air takes out of it, 1 a zenith */
  readonly sunColour: Colour;
  readonly sunExtinction: Colour;
  /** the sun's disc: its angular radius, radians, drawn larger than the real one, and its radiance as a share of its light */
  readonly sunDiscRadius: number;
  readonly sunDiscGain: number;

  /** an overcast sky overhead; at the horizon it is a third of this, by the CIE's standard overcast sky */
  readonly overcastZenith: Colour;
  /** a clear sky overhead and at the horizon, and how quickly the one gives way to the other going up */
  readonly clearZenith: Colour;
  readonly clearHorizon: Colour;
  readonly clearFalloff: number;
  /** the warmth along the horizon toward a low sun: its colour, how close to the horizon it keeps, and how high the sun is, as a sine, when it has gone */
  readonly horizonWarmth: Colour;
  readonly warmthFalloff: number;
  readonly warmthElevation: number;
  /** the glow round the sun in a clear sky, and how tight it is, as an exponent */
  readonly sunGlow: Colour;
  readonly glowTightness: number;
  /** a clear sky dims to this share of itself as the sun sets, from this high, as a sine */
  readonly duskSky: number;
  readonly duskElevation: number;
  /** the share of the light falling on the ground that it sends back up, onto whatever faces down */
  readonly groundBounce: number;

  /** haze at the height `fogBase`, under overcast and under a clear sky, 1/m, thinning by e every `fogFalloff` metres up */
  readonly hazeStorm: number;
  readonly hazeClear: number;
  readonly fogBase: number;
  readonly fogFalloff: number;

  /** mist over wholly humid ground, 1/m, thinning to none `mistCeiling` metres above it */
  readonly mistDensity: number;
  readonly mistCeiling: number;

  /**
   * the deck of cloud: the height of its top, metres, which has to be above `skirtFloor` and below the rim, and
   * the softness of that top, over which the cloud thins to nothing, metres. the walls go down into it
   */
  readonly deckHeight: number;
  readonly deckSoft: number;
  /** how thick the cloud is, 1/m: thick enough that what is below the top is not seen */
  readonly deckDensity: number;
  /** what the cloud sends back of the light on it */
  readonly deckColour: Colour;
  /** the size of one billow of its surface, metres, and how far the billows tip it */
  readonly deckGrain: number;
  readonly deckRelief: number;
  /** how far out it is drawn, metres; it is faded into the sky well before the edge */
  readonly deckReach: number;

  /** the wind that carries the deck and the clouds overhead, metres a second along x and along z */
  readonly windX: number;
  readonly windZ: number;
  /**
   * the clouds overhead: how high, metres, the size of one, metres, the share of the sky they leave clear, and
   * how soft their edges are. they stand above the highest land by more than its relief: a cloud just over the
   * peaks casts its shadow by every few metres of height somewhere else, and a low sun turns the pattern to
   * confetti. at 2,600 m it did
   */
  readonly cloudHeight: number;
  readonly cloudGrain: number;
  readonly cloudCover: number;
  readonly cloudSoftness: number;
  /** the share of the sun's light a cloud takes out of its shadow under a clear sky */
  readonly cloudShadow: number;

  /** the rain's streaks: how far they lean, as sideways over down, and the width of a column of them, pixels */
  readonly rainSlant: number;
  readonly rainColumn: number;
  /** the share of a column a streak is wide, and the length of the slot a streak falls in, pixels; a streak fills half its slot */
  readonly rainWidth: number;
  readonly rainLength: number;
  /** how fast the streaks fall, pixels a second */
  readonly rainSpeed: number;
  /** the share of slots holding a streak at the heaviest rain, and how far a streak covers what is behind it */
  readonly rainDensity: number;
  readonly rainOpacity: number;
  readonly rainColour: Colour;
  /** how many sheets of streaks there are, and how much smaller each is than the one in front of it */
  readonly rainLayers: number;
  readonly rainLayerScale: number;
}

export const AIR_LOOK: IAirLook = {
  sunColour: [1.3, 1.15, 1.0],
  sunExtinction: [0.05, 0.1, 0.2],
  sunDiscRadius: 0.012,
  sunDiscGain: 40,

  overcastZenith: [0.3, 0.32, 0.36],
  clearZenith: [0.035, 0.07, 0.16],
  clearHorizon: [0.16, 0.19, 0.23],
  clearFalloff: 0.4,
  horizonWarmth: [0.45, 0.22, 0.07],
  warmthFalloff: 6,
  warmthElevation: 0.5,
  sunGlow: [0.5, 0.36, 0.22],
  glowTightness: 24,
  duskSky: 0.5,
  duskElevation: 0.5,
  groundBounce: 0.08,

  hazeStorm: 2e-4,
  hazeClear: 3e-5,
  fogBase: 0,
  fogFalloff: 900,

  mistDensity: 4e-3,
  mistCeiling: 120,

  deckHeight: -150,
  deckSoft: 110,
  deckDensity: 0.02,
  deckColour: [0.78, 0.8, 0.84],
  deckGrain: 1800,
  deckRelief: 0.5,
  deckReach: 60000,

  windX: 9,
  windZ: 4,
  cloudHeight: 4500,
  cloudGrain: 2400,
  cloudCover: 0.55,
  cloudSoftness: 0.12,
  cloudShadow: 0.7,

  rainSlant: 0.18,
  rainColumn: 9,
  rainWidth: 0.12,
  rainLength: 90,
  rainSpeed: 1400,
  rainDensity: 0.3,
  rainOpacity: 0.22,
  rainColour: [0.55, 0.6, 0.66],
  rainLayers: 2,
  rainLayerScale: 0.55,
};
