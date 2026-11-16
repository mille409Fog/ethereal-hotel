/**
 * the stored land: the hero seed's storm, run earlier by the reference model (`scripts/build-watershed-land.mjs`),
 * fetched, decoded, and stood on the stage as if a storm had just finished there.
 *
 * - **the same textures, so the same drawing.** the light pass, the ground and the water ask the simulation for
 *   three textures and a size (`ISimTextures` in `sim/sim-driver.ts`), and this offers the same: `land` decoded
 *   from the image into a float texture of the layout the driver writes, and `terrain` and `strata` raised again
 *   from the seed by the same `raiseLand`. sampling a float texture needs no extension, only rendering to one
 *   does, and the light's own target is eight-bit, so a device that cannot simulate draws this.
 * - **decoded as bytes, not as a picture.** `createImageBitmap` is told to convert no colour space and
 *   premultiply nothing, and the image has no alpha, so what the canvas hands back is the bytes the build wrote.
 *   `stored-layout.ts` turns them back into metres.
 * - **the flow is still.** the image keeps no velocity, so every state but `land` is one texture of zeros: the
 *   water is where the storm left it and nothing on it moves.
 * - **the valley is found the way a storm finds it**, from a quarter copy of the land and the uplift averaged to
 *   the same grid (`direction/valley.ts`). a storm reads its quarter back from the GPU; here the land is already
 *   on the CPU, so the quarter is averaged here, and no float target is needed for it.
 *
 * the show runs the piece's clocks with the storm over, `p = 1`, and `e` counting from `from`: 0 for the camera's
 * pass and the orbit after it, `heroSeconds` for the one still frame.
 */
import * as THREE from 'three';
import { DIRECTION, IDirection } from '../direction/direction-calibration';
import { QUARTER } from '../direction/readback-shaders';
import { coarsen, findValley, IValley, waterSurface } from '../direction/valley';
import { EROSION, IErosionConstants } from '../model/erosion-calibration';
import { raise } from '../model/reference';
import { HERO_SEED } from '../seed/seed';
import { fixedTexture, ISimTextures } from '../sim/sim-driver';
import { packStrata, packTerrain } from '../sim/sim-layout';
import { SimState } from '../sim/sim-shaders';
import { IStage } from '../stage/create-stage';
import { ILandShow, IStormFrame, pieceClock, standLand } from '../stage/stand-land';
import { unpackStored } from './stored-layout';

/** where the build writes it; `public/` is served from the root */
export const STORED_LAND_URL = '/watershed-land.png';

/** a stored land, decoded: its side, and its `land` texels, cut, regolith, water and suspended, four a cell */
export interface IStoredLand {
  readonly size: number;
  readonly land: Float32Array;
}

/** an image's bytes: RGBA, four a pixel, as a canvas returns them */
export interface IPixels {
  readonly width: number;
  readonly height: number;
  readonly data: ArrayLike<number>;
}

/** the bytes of an image, with no colour converted and nothing premultiplied */
export async function decodeImage(blob: Blob): Promise<IPixels> {
  const bitmap = await window.createImageBitmap(blob, {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none',
  });
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context === null) {
      throw new Error('no 2D context to read the stored land through');
    }
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    return { width: bitmap.width, height: bitmap.height, data };
  } finally {
    bitmap.close();
  }
}

/** fetches the stored land and decodes it; rejects on a failed fetch or an image of the wrong shape */
export async function fetchStoredLand(
  url: string = STORED_LAND_URL,
  decode: (blob: Blob) => Promise<IPixels> = decodeImage
): Promise<IStoredLand> {
  const response = await window.fetch(url);
  if (!response.ok) {
    throw new Error(`the stored land answered ${response.status}`);
  }
  const { width, height, data } = await decode(await response.blob());
  if (width !== height * 2 || height < 1) {
    throw new Error(`a stored land is twice as wide as it is tall, and this is ${width}×${height}`);
  }
  return { size: height, land: unpackStored(data, height, 4) };
}

/** the quarter copy a storm reads back from the GPU, averaged from a land already on the CPU */
export function quarterOf(land: Float32Array, size: number): Float32Array {
  const channels = [0, 1, 2, 3].map((channel) =>
    coarsen(
      land.filter((_, k) => k % 4 === channel),
      size,
      QUARTER
    )
  );
  const quarter = new Float32Array(channels[0].length * 4);
  for (let i = 0; i < channels[0].length; i++) {
    for (let channel = 0; channel < 4; channel++) {
      quarter[i * 4 + channel] = channels[channel][i];
    }
  }
  return quarter;
}

/** the three textures and the size a stored land offers, as a driver would; never changing */
export function storedTextures(
  stored: IStoredLand,
  seed: number = HERO_SEED,
  constants: IErosionConstants = EROSION
): ISimTextures & { readonly uplift: Float32Array; dispose(): void } {
  const { size } = stored;
  const raised = raise(seed, size, constants);
  const land = fixedTexture(stored.land, size, size);
  const still = fixedTexture(new Float32Array(size * size * 4), size, size);
  const terrain = fixedTexture(packTerrain(raised.terrain), size, size);
  const strata = fixedTexture(packStrata(raised.strata), raised.strata.erodibility.length, 1);
  return {
    size,
    terrain,
    strata,
    uplift: raised.terrain.uplift,
    current: (state: SimState): THREE.Texture => (state === 'land' ? land : still),
    dispose(): void {
      for (const texture of [land, still, terrain, strata]) {
        texture.dispose();
      }
    },
  };
}

/**
 * stands a stored land on the stage with the storm over. `from` is the `e` of its first frame: 0 to fly the pass
 * and orbit after, `heroSeconds` to draw the hero frame
 */
export function showStoredLand(
  renderer: THREE.WebGLRenderer,
  stage: IStage,
  stored: IStoredLand,
  from = 0,
  constants: IErosionConstants = EROSION,
  direction: IDirection = DIRECTION
): ILandShow {
  const textures = storedTextures(stored, HERO_SEED, constants);
  const standing = standLand(renderer, stage, textures, constants, direction);
  const surface = waterSurface(
    quarterOf(stored.land, stored.size),
    coarsen(textures.uplift, stored.size, QUARTER)
  );
  const valley: IValley | null = findValley(
    surface,
    Math.max(1, Math.floor(stored.size / QUARTER)),
    constants.extent,
    direction
  );
  const piece = pieceClock();
  const steps = constants.stormSteps;
  return {
    valley,
    advance(nowMs: number, paused = false): IStormFrame {
      const seconds = piece.tick(nowMs, paused);
      const ended = from + seconds;
      standing.follow(1, ended, seconds);
      return { steps, progress: 1, ended };
    },
    dispose(): void {
      standing.dispose();
      textures.dispose();
    },
  };
}
