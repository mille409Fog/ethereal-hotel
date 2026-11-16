import * as THREE from 'three';
import { heroSeconds } from '../direction/camera-path';
import { DIRECTION } from '../direction/direction-calibration';
import { sunAt } from '../direction/direction';
import { QUARTER } from '../direction/readback-shaders';
import { coarsen, findValley, waterSurface } from '../direction/valley';
import { LAND_MESH } from '../land/land-mesh';
import { LIGHT_PASS } from '../land/light-pass';
import { EROSION, IErosionConstants } from '../model/erosion-calibration';
import { raise } from '../model/reference';
import { HERO_SEED } from '../seed/seed';
import { packStrata, packTerrain } from '../sim/sim-layout';
import { SIM_STATES } from '../sim/sim-shaders';
import { createStage, IStage } from '../stage/create-stage';
import { WATER_MESH } from '../water/water-mesh';
import {
  decodeImage,
  fetchStoredLand,
  IPixels,
  IStoredLand,
  quarterOf,
  showStoredLand,
  STORED_LAND_URL,
  storedTextures,
} from './stored-land';
import { CUT_RANGE, packStored, REGOLITH_RANGE, WATER_RANGE } from './stored-layout';

/** sixteen cells: the smallest grid whose quarter copy is big enough to have a valley in it, as in `storm.spec.ts` */
const SIZE = 16;
const CONSTANTS: IErosionConstants = { ...EROSION, extent: SIZE * 16 };

/** a stored land's fields, varied enough that a channel mixed up with another would show */
const fields = (): {
  size: number;
  cut: Float32Array;
  regolith: Float32Array;
  water: Float32Array;
} => {
  const cells = SIZE * SIZE;
  const cut = new Float32Array(cells);
  const regolith = new Float32Array(cells);
  const water = new Float32Array(cells);
  for (let i = 0; i < cells; i++) {
    cut[i] = (i * 3.25) % CUT_RANGE;
    regolith[i] = (i * 0.75) % REGOLITH_RANGE;
    water[i] = i % 3 === 0 ? 0 : ((i % 11) / 11) * WATER_RANGE;
  }
  return { size: SIZE, cut, regolith, water };
};

/** the bytes a canvas would hand back for the image the build writes: its RGB, and an opaque alpha */
const canvasBytes = (): IPixels => {
  const rgb = packStored(fields());
  const data = new Uint8ClampedArray((rgb.length / 3) * 4);
  for (let p = 0; p < rgb.length / 3; p++) {
    data.set([rgb[p * 3], rgb[p * 3 + 1], rgb[p * 3 + 2], 255], p * 4);
  }
  return { width: SIZE * 2, height: SIZE, data };
};

/** counts the light's draws; nothing else may draw off screen for a stored land */
class FakeRenderer {
  public lit = 0;

  public getRenderTarget(): null {
    return null;
  }

  public setRenderTarget(): void {
    // nothing to bind
  }

  public render(scene: THREE.Scene): void {
    const { material } = scene.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
    expect(material.name).toBe(LIGHT_PASS);
    this.lit++;
  }
}

const meshIn = (
  stage: IStage,
  name: string
): THREE.Mesh<THREE.BufferGeometry, THREE.RawShaderMaterial> | undefined =>
  stage.scene.children.find((child) => child.name === name) as
    THREE.Mesh<THREE.BufferGeometry, THREE.RawShaderMaterial> | undefined;

const dry: IStoredLand = { size: SIZE, land: new Float32Array(SIZE * SIZE * 4) };

describe('stored land', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('fetching', () => {
    const answer = (ok: boolean, status = 200): ReturnType<typeof vi.fn> => {
      const fetch = vi.fn(() =>
        Promise.resolve({ ok, status, blob: () => Promise.resolve(new Blob()) })
      );
      vi.stubGlobal('fetch', fetch);
      return fetch;
    };

    it('asks for the image the build writes, from the root', async () => {
      const fetch = answer(true);
      await fetchStoredLand(undefined, () => Promise.resolve(canvasBytes()));

      expect(STORED_LAND_URL).toBe('/watershed-land.png');
      expect(fetch).toHaveBeenCalledWith(STORED_LAND_URL);
    });

    it('unpacks a canvas’s four bytes a pixel into the land texture’s four numbers a cell', async () => {
      answer(true);
      const { size, land } = await fetchStoredLand(STORED_LAND_URL, () =>
        Promise.resolve(canvasBytes())
      );
      const expected = fields();

      expect(size).toBe(SIZE);
      expect(land).toHaveLength(SIZE * SIZE * 4);
      for (const i of [0, 1, 17, SIZE * SIZE - 1]) {
        expect(land[i * 4]).toBeCloseTo(expected.cut[i], 1);
        expect(land[i * 4 + 1]).toBeCloseTo(expected.regolith[i], 2);
        expect(Math.abs(land[i * 4 + 2] - expected.water[i])).toBeLessThan(0.3);
        expect(land[i * 4 + 3]).toBe(0);
      }
    });

    it('rejects an answer that is not the image', async () => {
      answer(false, 404);

      await expect(
        fetchStoredLand(STORED_LAND_URL, () => Promise.resolve(canvasBytes()))
      ).rejects.toThrow('404');
    });

    it('rejects an image that is not twice as wide as it is tall', async () => {
      answer(true);
      const square = { width: SIZE, height: SIZE, data: new Uint8ClampedArray(SIZE * SIZE * 4) };

      await expect(fetchStoredLand(STORED_LAND_URL, () => Promise.resolve(square))).rejects.toThrow(
        'twice as wide'
      );
    });
  });

  describe('decoding', () => {
    const bitmap = { width: 4, height: 2, close: vi.fn() };

    it('converts no colour space and premultiplies nothing, and frees the bitmap', async () => {
      const create = vi.fn(() => Promise.resolve(bitmap));
      vi.stubGlobal('createImageBitmap', create);
      const data = new Uint8ClampedArray(4 * 2 * 4).fill(7);
      const context = { drawImage: vi.fn(), getImageData: vi.fn(() => ({ data })) };
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
        context as unknown as CanvasRenderingContext2D
      );
      bitmap.close.mockClear();

      const pixels = await decodeImage(new Blob());

      expect(create).toHaveBeenCalledWith(expect.any(Blob), {
        colorSpaceConversion: 'none',
        premultiplyAlpha: 'none',
      });
      expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0);
      expect(pixels).toEqual({ width: 4, height: 2, data });
      expect(bitmap.close).toHaveBeenCalledTimes(1);
    });

    it('says so when there is no canvas to read through, and still frees the bitmap', async () => {
      vi.stubGlobal('createImageBitmap', () => Promise.resolve(bitmap));
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
      bitmap.close.mockClear();

      await expect(decodeImage(new Blob())).rejects.toThrow('no 2D context');
      expect(bitmap.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('its textures', () => {
    it('offers the land as decoded, and the terrain and the beds raised again from the hero seed', () => {
      const stored: IStoredLand = { size: SIZE, land: new Float32Array(SIZE * SIZE * 4).fill(2) };
      const textures = storedTextures(stored, HERO_SEED, CONSTANTS);
      const raised = raise(HERO_SEED, SIZE, CONSTANTS);
      const dataOf = (texture: THREE.Texture): ArrayLike<number> =>
        (texture as THREE.DataTexture).image.data as ArrayLike<number>;

      expect(textures.size).toBe(SIZE);
      expect(dataOf(textures.current('land'))).toBe(stored.land);
      expect(textures.current('land').type).toBe(THREE.FloatType);
      expect(textures.current('land').magFilter).toBe(THREE.NearestFilter);
      expect(dataOf(textures.terrain)).toEqual(packTerrain(raised.terrain));
      expect(dataOf(textures.strata)).toEqual(packStrata(raised.strata));
    });

    it('holds every other state still, at zero: the image keeps no flow', () => {
      const textures = storedTextures(dry, HERO_SEED, CONSTANTS);

      for (const state of SIM_STATES.filter((name) => name !== 'land')) {
        const data = (textures.current(state) as THREE.DataTexture).image.data as Float32Array;
        expect(data).toHaveLength(SIZE * SIZE * 4);
        expect(data.every((value) => value === 0)).toBe(true);
      }
    });

    it('frees all four on dispose', () => {
      const textures = storedTextures(dry, HERO_SEED, CONSTANTS);
      const freed = [
        textures.current('land'),
        textures.current('flow'),
        textures.terrain,
        textures.strata,
      ].map((texture) => vi.spyOn(texture, 'dispose'));

      textures.dispose();

      for (const spy of freed) {
        expect(spy).toHaveBeenCalledTimes(1);
      }
    });
  });

  describe('the quarter copy', () => {
    it('is the mean of each four-by-four block, channel by channel, as the GPU’s read is', () => {
      const land = new Float32Array(SIZE * SIZE * 4);
      for (let i = 0; i < land.length; i++) {
        land[i] = i;
      }
      const quarter = quarterOf(land, SIZE);
      const side = SIZE / QUARTER;

      expect(quarter).toHaveLength(side * side * 4);
      for (let channel = 0; channel < 4; channel++) {
        const alone = land.filter((_, k) => k % 4 === channel);
        const expected = coarsen(alone, SIZE, QUARTER);
        for (let i = 0; i < side * side; i++) {
          expect(quarter[i * 4 + channel]).toBeCloseTo(expected[i], 3);
        }
      }
    });
  });

  describe('on the stage', () => {
    const show = (
      from = 0
    ): { renderer: FakeRenderer; stage: IStage; stored: ReturnType<typeof showStoredLand> } => {
      const renderer = new FakeRenderer();
      const stage = createStage();
      const stored = showStoredLand(
        renderer as unknown as THREE.WebGLRenderer,
        stage,
        dry,
        from,
        CONSTANTS
      );
      return { renderer, stage, stored };
    };

    it('stands its ground and its water on the stage, drawn by the code that draws a live land', () => {
      const { stage } = show();
      const land = meshIn(stage, LAND_MESH);

      expect(land?.geometry.getAttribute('position').count).toBe(SIZE ** 2 + 8 * SIZE);
      expect(meshIn(stage, WATER_MESH)).toBeDefined();
    });

    it('finds the valley the way a storm does, from the quarter copy and the uplift', () => {
      const { stored } = show();
      const uplift = coarsen(raise(HERO_SEED, SIZE, CONSTANTS).terrain.uplift, SIZE, QUARTER);
      const expected = findValley(
        waterSurface(quarterOf(dry.land, SIZE), uplift),
        SIZE / QUARTER,
        CONSTANTS.extent,
        DIRECTION
      );

      expect(stored.valley).not.toBeNull();
      expect(stored.valley).toEqual(expected);
    });

    it('has the storm over from the first frame, and counts e on the piece’s own seconds', () => {
      const { stored } = show();

      expect(stored.advance(1_000)).toEqual({ steps: CONSTANTS.stormSteps, progress: 1, ended: 0 });
      expect(stored.advance(1_200).ended).toBeCloseTo(0.2, 9);
      expect(stored.advance(1_400, true).ended).toBeCloseTo(0.2, 9);
      // a hidden tab is not made up
      expect(stored.advance(9_400).ended).toBeLessThan(0.5);
    });

    it('starts at the hero moment when asked to, with the golden sun where the curves put it then', () => {
      const { stored, renderer } = show(heroSeconds(DIRECTION));
      const frame = stored.advance(1_000);
      const light = new THREE.Vector3(...sunAt(1, heroSeconds(DIRECTION), DIRECTION));

      expect(frame.ended).toBe(heroSeconds(DIRECTION));
      expect(renderer.lit).toBe(1);
      expect(light.length()).toBeCloseTo(1, 9);
    });

    it('lights the land once and again only while the sun moves', () => {
      const { stored, renderer } = show(heroSeconds(DIRECTION));
      stored.advance(1_000);
      stored.advance(1_016);
      stored.advance(1_032);

      // at the hero moment the sun has long since come down, so nothing moves the light
      expect(renderer.lit).toBe(1);
    });

    it('takes its land off the stage and frees it', () => {
      const { stage, stored } = show();
      const land = meshIn(stage, LAND_MESH) as THREE.Mesh<
        THREE.BufferGeometry,
        THREE.RawShaderMaterial
      >;
      const texture = vi.spyOn(land.material.uniforms['land'].value as THREE.Texture, 'dispose');

      stored.dispose();

      expect(meshIn(stage, LAND_MESH)).toBeUndefined();
      expect(meshIn(stage, WATER_MESH)).toBeUndefined();
      expect(texture).toHaveBeenCalledTimes(1);
    });
  });
});
