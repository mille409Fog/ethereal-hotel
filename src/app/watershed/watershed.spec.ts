import { Location } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GradePass } from '../murmuration/grade/grade-pass/grade-pass';
import { GrainPass } from '../murmuration/grain/grain-pass/grain-pass';
import { REDUCED_MOTION_QUERY } from '../murmuration/renderer/renderer-calibration';
import { DECK_MESH, DOME_MESH } from './air/air';
import { RainPass } from './air/rain-pass';
import { LAND_MESH } from './land/land-mesh';
import { LIGHT_PASS } from './land/light-pass';
import { LAND_PICTURES, landLine, NO_PICTURE, UNLOADED } from './land-state';
import { EROSION } from './model/erosion-calibration';
import { ILand } from './model/land';
import { IQualityTier, MEASURE_WINDOW_MS, QUALITY_TIERS } from './quality/quality-calibration';
import { HERO_SEED, Random, SEED_SPAN } from './seed/seed';
import { heroSeconds } from './direction/camera-path';
import { DIRECTION } from './direction/direction-calibration';
import { RaiseLand, raiseHere } from './sim/raise-land';
import { ANNOUNCE_EVERY_MS, REPORT_EVERY, STORM_SECONDS } from './sim/sim-calibration';
import { SIM_PASSES, SIM_STATES } from './sim/sim-shaders';
import { PROBE_VALUE } from './sim/sim-support';
import { verticalFovFor } from './stage/stage-camera';
import { CAMERA_POSITION } from './stage/stage-calibration';
import { Watershed } from './watershed';
import {
  WATERSHED_ADDRESS,
  WATERSHED_COMPOSER,
  WATERSHED_RAISE,
  WATERSHED_RANDOM,
  WATERSHED_RENDERER,
  WATERSHED_SEARCH,
  WATERSHED_STORED_LAND,
  WATERSHED_TIERS,
} from './watershed.tokens';
import { IStoredLand } from './stored/stored-land';

/** The calibrated tiers on a grid of a few cells: what these tests prove holds at any size. */
const SPEC_GRID = 8;
const SPEC_TIERS: readonly IQualityTier[] = QUALITY_TIERS.map((tier) => ({
  ...tier,
  grid: SPEC_GRID,
}));

/**
 * jsdom has no WebGL, so a real `WebGLRenderer` always throws here and only the
 * failure path would ever run. Everything else in `three` is real; the renderer
 * and the composer are swapped, through their tokens, for ones that record what
 * the component asked of them. The renderer can be told to fail, and told what
 * the float-target probe reads back.
 */

type FrameCallback = (nowMs: number) => void;

class FakeRenderer {
  public readonly setPixelRatio = vi.fn();
  public readonly setSize = vi.fn();
  public readonly render = vi.fn();
  public readonly setAnimationLoop = vi.fn<(callback: FrameCallback | null) => void>();
  public readonly dispose = vi.fn();
  public readonly getRenderTarget = vi.fn(() => null);
  public readonly setRenderTarget = vi.fn();
  public readonly readRenderTargetPixels = vi.fn(
    (_target: unknown, _x: number, _y: number, _w: number, _h: number, buffer: Float32Array) => {
      buffer.fill(rendererState.probeReads);
    }
  );
  /** the readout's sums: cut, regolith, water, suspended, over every cell */
  public readonly readRenderTargetPixelsAsync = vi.fn(
    (_target: unknown, _x: number, _y: number, _w: number, _h: number, buffer: Float32Array) => {
      buffer.set([3, 1.5, 7, 0.5]);
      return Promise.resolve(buffer);
    }
  );
}

class FakeComposer {
  public readonly passes: Pass[] = [];
  public readonly addPass = vi.fn((pass: Pass) => {
    this.passes.push(pass);
  });
  public readonly render = vi.fn();
  public readonly setSize = vi.fn();
  public readonly setPixelRatio = vi.fn();
  public readonly dispose = vi.fn();
  /** The two buffers the scene is drawn into, whose samples are the tier's. */
  public readonly renderTarget1 = { samples: 0, dispose: vi.fn() };
  public readonly renderTarget2 = { samples: 0, dispose: vi.fn() };
  /** A real composer sizes its targets from the renderer once, when it is built. */
  public readonly builtOnSizedRenderer: boolean;
  /** The probe borrows the renderer; it must have handed it back before the chain is built on it. */
  public readonly builtAfterProbe: boolean;

  constructor(public readonly renderer: FakeRenderer) {
    this.builtOnSizedRenderer =
      renderer.setPixelRatio.mock.calls.length > 0 && renderer.setSize.mock.calls.length > 0;
    this.builtAfterProbe = renderer.readRenderTargetPixels.mock.calls.length === 1;
  }
}

/** What the fake factories do this test, and everything they made. */
const rendererState = {
  fail: false,
  probeReads: PROBE_VALUE,
  instances: [] as FakeRenderer[],
  composers: [] as FakeComposer[],
  /** every seed the component wrote into the address */
  addressed: [] as number[],
  /** whether the stored land arrives, and how many times it was asked for */
  storedFails: false,
  storedAsked: 0,
  /** when set, the stored land waits for `release` to be called, as a slow network makes it */
  storedHeld: false,
  release: (): void => undefined,
};

/** A stored land of a few cells, with a pond in it: what the decoded image would hand over. */
const SPEC_STORED: IStoredLand = (() => {
  const land = new Float32Array(SPEC_GRID * SPEC_GRID * 4);
  for (let i = 0; i < SPEC_GRID * SPEC_GRID; i++) {
    land[i * 4] = (i % SPEC_GRID) * 3;
    land[i * 4 + 2] = i % 7 === 0 ? 2 : 0;
  }
  return { size: SPEC_GRID, land };
})();

const fakeStoredLand = (): Promise<IStoredLand> => {
  rendererState.storedAsked++;
  if (rendererState.storedFails) {
    return Promise.reject(new Error('the stored land answered 404'));
  }
  if (rendererState.storedHeld) {
    return new Promise((resolve) => {
      rendererState.release = (): void => resolve(SPEC_STORED);
    });
  }
  return Promise.resolve(SPEC_STORED);
};

const fakeRendererFactory = (): THREE.WebGLRenderer => {
  if (rendererState.fail) {
    throw new Error('Error creating WebGL context.');
  }
  const renderer = new FakeRenderer();
  rendererState.instances.push(renderer);
  return renderer as unknown as THREE.WebGLRenderer;
};

const fakeComposerFactory = (renderer: THREE.WebGLRenderer): EffectComposer => {
  const composer = new FakeComposer(renderer as unknown as FakeRenderer);
  rendererState.composers.push(composer);
  return composer as unknown as EffectComposer;
};

const stubReducedMotion = (reduce: boolean): void => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query === REDUCED_MOTION_QUERY,
  }));
};

interface IMountOptions {
  readonly random?: Random;
  readonly search?: string;
  /** Leave the real `WebGLRenderer` in place, which jsdom cannot give a context. */
  readonly realRenderer?: boolean;
  /** Tiers other than the spec's, all of whose grids are one size. */
  readonly tiers?: readonly IQualityTier[];
  /** Raises lands as given, instead of at once on this thread. */
  readonly raise?: RaiseLand;
}

/**
 * Raises on this thread, but hands each land over only when `release` is called, as a worker does when it answers:
 * every land asked for, in order, with what became of it.
 */
const heldRaise = (): {
  raise: RaiseLand;
  asked: Array<{ seed: number; size: number; cancelled: boolean }>;
  release: () => void;
} => {
  const asked: Array<{ seed: number; size: number; cancelled: boolean }> = [];
  const waiting: Array<() => void> = [];
  const raise: RaiseLand = (seed, size, constants) => {
    const record = { seed, size, cancelled: false };
    asked.push(record);
    let land: ILand | null = null;
    waiting.push(() => {
      land = raiseHere(seed, size, constants).land;
    });
    return {
      get land(): ILand | null {
        return land;
      },
      cancel: (): void => {
        record.cancelled = true;
      },
    };
  };
  return { raise, asked, release: () => waiting.splice(0).forEach((hand) => hand()) };
};

const mount = async (options: IMountOptions = {}): Promise<ComponentFixture<Watershed>> => {
  const providers: object[] = [
    { provide: WATERSHED_TIERS, useValue: options.tiers ?? SPEC_TIERS },
    { provide: WATERSHED_ADDRESS, useValue: (seed: number) => rendererState.addressed.push(seed) },
    { provide: WATERSHED_STORED_LAND, useValue: fakeStoredLand },
  ];
  if (options.random) {
    providers.push({ provide: WATERSHED_RANDOM, useValue: options.random });
  }
  if (options.search !== undefined) {
    providers.push({ provide: WATERSHED_SEARCH, useValue: options.search });
  }
  if (options.raise) {
    providers.push({ provide: WATERSHED_RAISE, useValue: options.raise });
  }
  if (!options.realRenderer) {
    providers.push({ provide: WATERSHED_RENDERER, useValue: fakeRendererFactory });
  }
  providers.push({ provide: WATERSHED_COMPOSER, useValue: fakeComposerFactory });
  await TestBed.configureTestingModule({ imports: [Watershed], providers }).compileComponents();
  const fixture = TestBed.createComponent(Watershed);
  await fixture.whenStable();
  return fixture;
};

const onlyRenderer = (): FakeRenderer => {
  expect(rendererState.instances).toHaveLength(1);
  return rendererState.instances[0];
};

const onlyComposer = (): FakeComposer => {
  expect(rendererState.composers).toHaveLength(1);
  return rendererState.composers[0];
};

/** The frame callback the component handed to `setAnimationLoop`. */
const frameLoopOf = (renderer: FakeRenderer): FrameCallback => {
  const callback = renderer.setAnimationLoop.mock.calls[0][0];
  if (!callback) {
    throw new Error('no animation loop was started');
  }
  return callback;
};

/** The pipeline's one pass of a kind, found by type rather than by position. */
const passOf = <T extends Pass>(composer: FakeComposer, type: new (...args: never[]) => T): T => {
  const pass = composer.passes.find((candidate): candidate is T => candidate instanceof type);
  if (!pass) {
    throw new Error(`no ${type.name} in the pipeline`);
  }
  return pass;
};

const cameraOf = (composer: FakeComposer): THREE.PerspectiveCamera => {
  const { camera } = passOf(composer, RenderPass);
  if (!(camera instanceof THREE.PerspectiveCamera)) {
    throw new Error('no perspective camera was rendered through');
  }
  return camera;
};

type Land = THREE.Mesh<THREE.BufferGeometry, THREE.RawShaderMaterial>;

/** The land in the scene drawn, once a storm has stood one there. */
const landIn = (composer: FakeComposer): Land | undefined =>
  passOf(composer, RenderPass).scene.children.find((child) => child.name === LAND_MESH) as
    Land | undefined;

const hostOf = (fixture: ComponentFixture<Watershed>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

const canvasOf = (fixture: ComponentFixture<Watershed>): HTMLCanvasElement => {
  const canvas = hostOf(fixture).querySelector('canvas');
  if (!canvas) {
    throw new Error('no canvas');
  }
  return canvas;
};

const landLineOf = (fixture: ComponentFixture<Watershed>): string | undefined =>
  hostOf(fixture).querySelector('.land-line')?.textContent?.trim();

/** the readout's rows as label and value, as a visitor reads them */
const readoutOf = (fixture: ComponentFixture<Watershed>): string[][] =>
  Array.from(hostOf(fixture).querySelectorAll('.readout-row')).map((row) => [
    row.querySelector('dt')?.textContent?.trim() ?? '',
    row.querySelector('dd')?.textContent?.trim() ?? '',
  ]);

/** the button whose words are these */
const buttonOf = (fixture: ComponentFixture<Watershed>, words: string): HTMLButtonElement => {
  const button = Array.from(hostOf(fixture).querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === words
  );
  if (!button) {
    throw new Error(`no button says "${words}"`);
  }
  return button;
};

/** lets every read already handed back be taken in */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** Feeds the loop frames `frameMs` apart for `forMs`. */
const runFrames = (loop: FrameCallback, frameMs: number, forMs: number): void => {
  for (let now = 1_000; now <= 1_000 + forMs; now += frameMs) {
    loop(now);
  }
};

describe('Watershed', () => {
  beforeEach(() => {
    rendererState.fail = false;
    rendererState.probeReads = PROBE_VALUE;
    rendererState.instances = [];
    rendererState.composers = [];
    rendererState.addressed = [];
    rendererState.storedFails = false;
    rendererState.storedAsked = 0;
    rendererState.storedHeld = false;
    stubReducedMotion(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('without WebGL', () => {
    it('says so instead of drawing, and claims no land', async () => {
      rendererState.fail = true;
      const fixture = await mount();

      expect(hostOf(fixture).querySelector('.stage-failure')?.textContent).toContain('WebGL');
      expect(canvasOf(fixture).hidden).toBe(true);
      expect(landLineOf(fixture)).toBeUndefined();
      expect(rendererState.composers).toHaveLength(0);
    });

    it('builds a real WebGLRenderer by default, and says so when the browser cannot', async () => {
      const fixture = await mount({ realRenderer: true });

      expect(hostOf(fixture).querySelector('.stage-failure')).not.toBeNull();
      expect(rendererState.instances).toHaveLength(0);
    });

    it('stops and owns up when the context is lost, rather than holding a dead frame', async () => {
      const fixture = await mount();
      const renderer = onlyRenderer();

      canvasOf(fixture).dispatchEvent(new Event('webglcontextlost'));
      await fixture.whenStable();

      expect(renderer.setAnimationLoop).toHaveBeenLastCalledWith(null);
      expect(hostOf(fixture).querySelector('.stage-failure')).not.toBeNull();
      expect(canvasOf(fixture).hidden).toBe(true);
      expect(landLineOf(fixture)).toBeUndefined();
    });
  });

  describe('default seams', () => {
    it('builds a real EffectComposer on half-float buffers that keep their depth', () => {
      const renderer = {
        getPixelRatio: (): number => 2,
        getSize: (target: THREE.Vector2): THREE.Vector2 => target.set(4, 3),
      };
      const composer = TestBed.inject(WATERSHED_COMPOSER)(
        renderer as unknown as THREE.WebGLRenderer
      );

      expect(composer).toBeInstanceOf(EffectComposer);
      expect(composer.readBuffer.texture.type).toBe(THREE.HalfFloatType);
      expect(composer.readBuffer.depthTexture).toBeInstanceOf(THREE.DepthTexture);
      expect(composer.writeBuffer.depthTexture).not.toBe(composer.readBuffer.depthTexture);
      expect(composer.readBuffer.width).toBe(8);
      // built with none: the samples are the tier's, and the component gives them before the first frame
      expect(composer.readBuffer.samples).toBe(0);
      expect(composer.writeBuffer.samples).toBe(0);
      composer.dispose();
    });

    it('raises a land on this thread where there is no Worker, as in jsdom', () => {
      expect(TestBed.inject(WATERSHED_RAISE)).toBe(raiseHere);
    });

    it('draws chance from Math.random as it is when called, so a suite can pin it first', () => {
      const random = TestBed.inject(WATERSHED_RANDOM);
      vi.spyOn(Math, 'random').mockReturnValue(0.25);

      expect(random()).toBe(0.25);
    });

    it('offers the calibrated tiers unless a spec supplies smaller ones', () => {
      expect(TestBed.inject(WATERSHED_TIERS)).toBe(QUALITY_TIERS);
    });

    it("reads the seed from the address's query string", () => {
      expect(TestBed.inject(WATERSHED_SEARCH)).toBe(window.location.search);
    });

    it('writes a seed into the address in place, keeping the path and naming one seed only', () => {
      const location = TestBed.inject(Location);
      location.replaceState('/watershed', 'seed=7');
      const write = TestBed.inject(WATERSHED_ADDRESS);
      write(42);
      write(43);

      expect(location.path()).toBe('/watershed?seed=43');
    });
  });

  describe('the land it says it shows', () => {
    it('can simulate when the float target reads back exactly', async () => {
      const fixture = await mount({ search: '?seed=77' });

      expect(canvasOf(fixture).hidden).toBe(false);
      expect(canvasOf(fixture).dataset['land']).toBe('simulating');
      expect(landLineOf(fixture)).toBe(landLine('simulating', 77));
      expect(canvasOf(fixture).getAttribute('role')).toBe('img');
      expect(canvasOf(fixture).getAttribute('aria-label')).toBe(LAND_PICTURES.simulating);
    });

    it('draws a seed from chance when the address names none', async () => {
      const fixture = await mount({ search: '', random: () => 0.5 });

      expect(landLineOf(fixture)).toContain(`Seed ${SEED_SPAN / 2}.`);
    });

    it('draws a seed from chance when the address names something that is not one', async () => {
      const fixture = await mount({ search: '?seed=12abc', random: () => 0 });

      expect(landLineOf(fixture)).toContain('Seed 0.');
    });

    it('shows the stored land, under its own seed, when the float target rounds, once it has drawn it', async () => {
      rendererState.probeReads = 2400;
      const fixture = await mount({ search: '?seed=77' });
      await settle();

      // fetched, but not yet drawn: the line claims nothing until a frame has the land in it
      expect(rendererState.storedAsked).toBe(1);
      expect(landLineOf(fixture)).toBeUndefined();
      expect(canvasOf(fixture).getAttribute('aria-label')).toBe(NO_PICTURE);

      frameLoopOf(onlyRenderer())(1_000);
      await fixture.whenStable();

      expect(landIn(onlyComposer())).toBeDefined();
      expect(canvasOf(fixture).dataset['land']).toBe('stored');
      expect(canvasOf(fixture).getAttribute('aria-label')).toBe(LAND_PICTURES.stored);
      expect(landLineOf(fixture)).toBe(landLine('stored', HERO_SEED));
      // no storm to start again, but a pass that can be held
      expect(() => buttonOf(fixture, 'New land')).toThrow();
      expect(buttonOf(fixture, 'Pause')).toBeInstanceOf(HTMLButtonElement);
    });

    it('holds still under reduced motion, under the stored seed, even on a device that could simulate', async () => {
      stubReducedMotion(true);
      const fixture = await mount({ search: '?seed=77' });
      await settle();
      await fixture.whenStable();

      expect(rendererState.storedAsked).toBe(1);
      expect(landIn(onlyComposer())).toBeDefined();
      expect(canvasOf(fixture).dataset['land']).toBe('still');
      expect(landLineOf(fixture)).toBe(landLine('still', HERO_SEED));
      expect(canvasOf(fixture).getAttribute('aria-label')).toBe(LAND_PICTURES.still);
      expect(hostOf(fixture).querySelector('.controls')).toBeNull();
    });

    it('asks for no stored land where a storm runs', async () => {
      await mount();
      await settle();

      expect(rendererState.storedAsked).toBe(0);
    });

    it('owns up when the stored land cannot be loaded, and names no land', async () => {
      stubReducedMotion(true);
      rendererState.storedFails = true;
      const fixture = await mount();
      await settle();
      await fixture.whenStable();

      expect(landLineOf(fixture)).toBe(UNLOADED);
      expect(canvasOf(fixture).getAttribute('aria-label')).toBe(NO_PICTURE);
      expect(landIn(onlyComposer())).toBeUndefined();
      // the empty sky is drawn, once, rather than nothing
      expect(onlyComposer().render).toHaveBeenCalledTimes(1);
    });

    it('offers no Pause when the stored land could not be loaded, since nothing moves', async () => {
      rendererState.probeReads = 2400;
      rendererState.storedFails = true;
      const fixture = await mount();
      await settle();
      await fixture.whenStable();

      expect(landLineOf(fixture)).toBe(UNLOADED);
      expect(hostOf(fixture).querySelector('.controls')).toBeNull();
    });

    it('stands nothing on a stage that has gone by the time the stored land arrives', async () => {
      stubReducedMotion(true);
      rendererState.storedHeld = true;
      const fixture = await mount();
      const composer = onlyComposer();
      fixture.destroy();
      rendererState.release();
      await settle();

      expect(landIn(composer)).toBeUndefined();
      expect(composer.render).not.toHaveBeenCalled();
    });

    it('probes the device before building the chain on its renderer', async () => {
      await mount();

      expect(onlyComposer().builtAfterProbe).toBe(true);
    });
  });

  describe('post-processing', () => {
    it('draws the scene, rains on it, blooms it, tone-maps it, grades it, and only then grains it', async () => {
      // the grain is last because it is also the dither: see orchestrate-passes.ts
      await mount();
      const kinds = onlyComposer().passes.map((pass) => pass.constructor);

      expect(kinds).toEqual([
        RenderPass,
        RainPass,
        UnrealBloomPass,
        OutputPass,
        GradePass,
        GrainPass,
      ]);
    });

    it('draws no rain until a storm says it is raining', async () => {
      await mount();

      expect(passOf(onlyComposer(), RainPass).enabled).toBe(false);
    });

    it('builds the composer on the renderer, after the renderer is sized', async () => {
      await mount();
      const composer = onlyComposer();

      expect(composer.renderer).toBe(onlyRenderer());
      expect(composer.builtOnSizedRenderer).toBe(true);
    });

    it('tone-maps with ACES, which the output pass reads from the renderer', async () => {
      await mount();
      const renderer = onlyRenderer() as unknown as THREE.WebGLRenderer;

      expect(renderer.toneMapping).toBe(THREE.ACESFilmicToneMapping);
    });
  });

  describe('the stage', () => {
    it('stands no slab and no lights: before a land, there is only the air', async () => {
      await mount();
      const names = passOf(onlyComposer(), RenderPass).scene.children.map((child) => child.name);

      expect(names.sort()).toEqual([DECK_MESH, DOME_MESH].sort());
    });

    it('is seen from the calibrated vantage', async () => {
      await mount();

      expect(cameraOf(onlyComposer()).position.toArray()).toEqual([...CAMERA_POSITION]);
    });

    it('stands under a sky and in a deck of cloud from the first frame, before there is a land', async () => {
      await mount();
      const names = passOf(onlyComposer(), RenderPass).scene.children.map((child) => child.name);

      expect(names).toEqual(expect.arrayContaining([DOME_MESH, DECK_MESH]));
      expect(passOf(onlyComposer(), RenderPass).scene.background).toBeNull();
    });

    it('releases the air’s dome and deck on destroy', async () => {
      const fixture = await mount();
      const scene = passOf(onlyComposer(), RenderPass).scene;
      const meshes = scene.children.filter(
        (child): child is THREE.Mesh<THREE.BufferGeometry, THREE.Material> =>
          child.name === DOME_MESH || child.name === DECK_MESH
      );
      const freed = meshes.map((mesh) => vi.spyOn(mesh.material, 'dispose'));

      fixture.destroy();

      expect(freed).toHaveLength(2);
      for (const spy of freed) {
        expect(spy).toHaveBeenCalledTimes(1);
      }
    });
  });

  describe('drawing', () => {
    it('draws one still frame under reduced motion, of the stored land, and starts no loop', async () => {
      stubReducedMotion(true);
      await mount();
      await settle();
      const renderer = onlyRenderer();

      expect(onlyComposer().render).toHaveBeenCalledTimes(1);
      expect(landIn(onlyComposer())).toBeDefined();
      expect(renderer.setAnimationLoop).not.toHaveBeenCalled();
    });

    it('draws the still frame at the hero shot, where the orbit begins', async () => {
      stubReducedMotion(true);
      await mount();
      await settle();
      const camera = cameraOf(onlyComposer());
      const target = new THREE.Vector3(0, DIRECTION.heroTargetHeight, 0);

      expect(camera.position.distanceTo(target)).toBeCloseTo(DIRECTION.heroDistance, 3);
    });

    it('draws every frame of the loop through the composer', async () => {
      await mount();
      const loop = frameLoopOf(onlyRenderer());

      loop(1_000);
      loop(1_016);
      loop(1_032);

      expect(onlyComposer().render).toHaveBeenCalledTimes(3);
    });
  });

  describe('quality', () => {
    it('leaves the resolution alone while frames are fast', async () => {
      await mount();
      const renderer = onlyRenderer();
      const calibrated = renderer.setPixelRatio.mock.calls.length;

      runFrames(frameLoopOf(renderer), 16, MEASURE_WINDOW_MS * 3);

      expect(renderer.setPixelRatio).toHaveBeenCalledTimes(calibrated);
      expect(onlyComposer().setPixelRatio).not.toHaveBeenCalled();
    });

    it('steps down to the lowest tier when frames stay slow, and redraws both buffers at its scale', async () => {
      await mount();
      const renderer = onlyRenderer();
      const lowest = QUALITY_TIERS[QUALITY_TIERS.length - 1];

      runFrames(frameLoopOf(renderer), 40, MEASURE_WINDOW_MS * (QUALITY_TIERS.length + 1));

      // jsdom's device pixel ratio is 1, under the cap, so the scale is the whole ratio
      expect(renderer.setPixelRatio).toHaveBeenLastCalledWith(lowest.resolutionScale);
      expect(onlyComposer().setPixelRatio).toHaveBeenLastCalledWith(lowest.resolutionScale);
      expect(onlyComposer().setPixelRatio).toHaveBeenCalledTimes(QUALITY_TIERS.length - 1);
      expect(onlyComposer().renderTarget1.samples).toBe(lowest.samples);
      expect(onlyComposer().renderTarget2.samples).toBe(lowest.samples);
    });

    it('draws the scene with the best tier’s samples from before the first frame', async () => {
      await mount();
      const composer = onlyComposer();

      expect(composer.renderTarget1.samples).toBe(QUALITY_TIERS[0].samples);
      expect(composer.renderTarget2.samples).toBe(QUALITY_TIERS[0].samples);
    });

    describe('with the storm running', () => {
      /** a grid for each of the top two tiers, and the bottom two sharing one, as the calibrated tiers do */
      const GRIDS = [16, 8, 8];
      const TIERS: readonly IQualityTier[] = QUALITY_TIERS.map((tier, at) => ({
        ...tier,
        grid: GRIDS[at],
      }));
      const cellsOf = (composer: FakeComposer): number | undefined =>
        landIn(composer)?.geometry.getAttribute('position').count;
      const meshOn = (grid: number): number => grid ** 2 + 8 * grid;

      /** frames `frameMs` apart from `from` for `forMs`; returns the time of the last */
      const framesFrom = (
        loop: FrameCallback,
        from: number,
        frameMs: number,
        forMs: number
      ): number => {
        let now = from;
        for (; now <= from + forMs; now += frameMs) {
          loop(now);
        }
        return now - frameMs;
      };

      it('measures the storm too, and starts it again on a smaller grid when it is too dear', async () => {
        await mount({ tiers: TIERS });
        const renderer = onlyRenderer();
        const loop = frameLoopOf(renderer);
        const composer = onlyComposer();

        // the empty stage is quick: the best tier, and a storm on its grid
        const now = framesFrom(loop, 1_000, 16, MEASURE_WINDOW_MS + 100);
        expect(cellsOf(composer)).toBe(meshOn(16));
        expect(composer.setPixelRatio).not.toHaveBeenCalled();

        // the storm is not: one window of it steps down, to a smaller grid, and the storm starts again on it
        framesFrom(loop, now + 40, 40, MEASURE_WINDOW_MS + 80);
        expect(cellsOf(composer)).toBe(meshOn(8));
        expect(composer.renderTarget1.samples).toBe(TIERS[1].samples);
      });

      it('runs on through a step down that keeps its grid, and never steps back up', async () => {
        await mount({ tiers: TIERS });
        const renderer = onlyRenderer();
        const loop = frameLoopOf(renderer);
        const composer = onlyComposer();
        let now = framesFrom(loop, 1_000, 16, MEASURE_WINDOW_MS + 100);
        now = framesFrom(loop, now + 40, 40, MEASURE_WINDOW_MS + 80);
        const land = landIn(composer);

        now = framesFrom(loop, now + 40, 40, 2 * MEASURE_WINDOW_MS + 80);
        const lowest = TIERS[TIERS.length - 1];

        expect(landIn(composer)).toBe(land);
        expect(composer.setPixelRatio).toHaveBeenLastCalledWith(lowest.resolutionScale);
        expect(composer.renderTarget1.samples).toBe(lowest.samples);

        // fast again: the meter has settled, and stays where it is
        const calls = composer.setPixelRatio.mock.calls.length;
        framesFrom(loop, now + 16, 16, 3 * MEASURE_WINDOW_MS);
        expect(composer.setPixelRatio).toHaveBeenCalledTimes(calls);
      });

      it('counts no frame while the land is being raised, nor while the storm is paused', async () => {
        const held = heldRaise();
        const fixture = await mount({ tiers: TIERS, raise: held.raise });
        const renderer = onlyRenderer();
        const loop = frameLoopOf(renderer);
        const composer = onlyComposer();
        let now = framesFrom(loop, 1_000, 16, MEASURE_WINDOW_MS + 100);

        // slow, but there is no storm yet: an empty stage, already measured
        now = framesFrom(loop, now + 40, 40, 3 * MEASURE_WINDOW_MS);
        expect(composer.setPixelRatio).not.toHaveBeenCalled();

        held.release();
        loop((now += 16));
        buttonOf(fixture, 'Pause').click();
        framesFrom(loop, now + 40, 40, 3 * MEASURE_WINDOW_MS);
        expect(composer.setPixelRatio).not.toHaveBeenCalled();
      });
    });
  });

  describe('the storm', () => {
    /** The name of the material each `render` drew with: a pass of the simulation, the light, or the probe. */
    const drawn = (renderer: FakeRenderer): string[] =>
      renderer.render.mock.calls.map(
        ([scene]) => ((scene as THREE.Scene).children[0] as Land).material.name
      );

    const PASSES = new Set(SIM_PASSES.map((pass) => pass.name));

    /** Draws made by the simulation, which is not the only thing that draws off screen. */
    const simulated = (renderer: FakeRenderer): number =>
      drawn(renderer).filter((name) => PASSES.has(name)).length;

    const lit = (renderer: FakeRenderer): number =>
      drawn(renderer).filter((name) => name === LIGHT_PASS).length;

    /** Frames fast enough that the meter settles on the first window, then `afterMs` more. */
    const settleAndRun = (renderer: FakeRenderer, afterMs: number): void => {
      runFrames(frameLoopOf(renderer), 16, MEASURE_WINDOW_MS + 16 + afterMs);
    };

    it('does not start until the quality meter has settled on a tier', async () => {
      await mount();
      const renderer = onlyRenderer();

      runFrames(frameLoopOf(renderer), 16, MEASURE_WINDOW_MS / 2);

      expect(simulated(renderer)).toBe(0);
      expect(landIn(onlyComposer())).toBeUndefined();
    });

    it('starts on the settled tier’s grid, and stands its land on the stage', async () => {
      await mount();
      const renderer = onlyRenderer();

      settleAndRun(renderer, 200);
      const land = landIn(onlyComposer());

      // one vertex a cell, and two down each of the four walls
      expect(land?.geometry.getAttribute('position').count).toBe(SPEC_GRID ** 2 + 8 * SPEC_GRID);
      expect(land?.material.uniforms['land'].value).toBeInstanceOf(THREE.Texture);
    });

    it('lights the land only in frames that moved it', async () => {
      await mount();
      const renderer = onlyRenderer();
      const loop = frameLoopOf(renderer);
      settleAndRun(renderer, 200);
      const before = lit(renderer);
      const steps = simulated(renderer);

      // the same instant again: no time has passed, so no step is due and nothing has moved
      const last = 1_000 + Math.floor((MEASURE_WINDOW_MS + 16 + 200) / 16) * 16;
      loop(last);
      loop(last);

      expect(before).toBeGreaterThan(1);
      expect(simulated(renderer)).toBe(steps);
      expect(lit(renderer)).toBe(before);
    });

    it('runs the model in whole steps, every pass of each', async () => {
      await mount();
      const renderer = onlyRenderer();

      settleAndRun(renderer, 500);

      expect(simulated(renderer)).toBeGreaterThan(0);
      expect(simulated(renderer) % SIM_PASSES.length).toBe(0);
    });

    it('keeps the pace that finishes a storm in its calibrated time', async () => {
      await mount();
      const renderer = onlyRenderer();

      settleAndRun(renderer, 3_000);
      const steps = simulated(renderer) / SIM_PASSES.length;
      const expected = (EROSION.stormSteps / STORM_SECONDS) * 3;

      // the storm's first frame runs nothing, and the frames are 16ms where a second is 62.5 of them
      expect(Math.abs(steps - expected)).toBeLessThan(expected * 0.02);
    });

    it('keeps the land on the texture it is in now, which changes every step', async () => {
      await mount();
      const renderer = onlyRenderer();
      settleAndRun(renderer, 200);
      const land = landIn(onlyComposer());
      // the simulation's targets are the float ones; the light's is not
      const written = renderer.setRenderTarget.mock.calls
        .map(([target]) => target as THREE.WebGLRenderTarget | null)
        .filter(
          (target): target is THREE.WebGLRenderTarget => target?.texture.type === THREE.FloatType
        );

      // the last pass of a step writes the land, so the land is in the last of them drawn into
      expect(land?.material.uniforms['land'].value).toBe(written[written.length - 1].texture);
    });

    it('tells the readout how far it has got, in round numbers, and what the land read back says', async () => {
      const fixture = await mount({ search: '?seed=77' });
      const renderer = onlyRenderer();

      settleAndRun(renderer, 2_000);
      await settle();
      // a read is taken in by the frame after it comes back, so one more, at the same instant: no step
      const last = 1_000 + Math.floor((MEASURE_WINDOW_MS + 16 + 2_000) / 16) * 16;
      frameLoopOf(renderer)(last);
      await fixture.whenStable();
      const steps = simulated(renderer) / SIM_PASSES.length;
      const said = steps - (steps % REPORT_EVERY);

      expect(said).toBeGreaterThan(0);
      expect(renderer.readRenderTargetPixelsAsync).toHaveBeenCalled();
      // the fake's sums on a grid of eight across eight kilometres, a square kilometre a cell
      expect(readoutOf(fixture)).toEqual([
        ['Step', `${said.toLocaleString('en-US')} of 12,000`],
        ['Rain', expect.stringMatching(/^\d\.\d\d m$/)],
        ['Rock moved', '3 million m³'],
        ['Carried off', '1 million m³'],
      ]);
      expect(landLineOf(fixture)).toBe(landLine('simulating', 77));
    });

    it('shows no readout until a storm has run', async () => {
      const fixture = await mount();

      expect(readoutOf(fixture)).toEqual([]);
    });

    it('stands the camera where the path says, turning slowly off the vantage as the storm runs', async () => {
      await mount();
      const camera = cameraOf(onlyComposer());

      settleAndRun(onlyRenderer(), 3_000);
      const [x, y, z] = CAMERA_POSITION;

      expect(camera.position.toArray()).not.toEqual([x, y, z]);
      expect(camera.position.y).toBe(y);
      expect(Math.hypot(camera.position.x, camera.position.z)).toBeCloseTo(Math.hypot(x, z), 6);
    });

    describe('Pause', () => {
      it('holds the storm: no step runs, the button says how to go on, and the line says it is paused', async () => {
        const fixture = await mount({ search: '?seed=77' });
        const renderer = onlyRenderer();
        const loop = frameLoopOf(renderer);
        settleAndRun(renderer, 200);
        buttonOf(fixture, 'Pause').click();
        await fixture.whenStable();
        const steps = simulated(renderer);
        for (let now = 3_000; now < 5_000; now += 16) {
          loop(now);
        }

        expect(simulated(renderer)).toBe(steps);
        expect(landLineOf(fixture)).toBe(landLine('simulating', 77, true));

        buttonOf(fixture, 'Resume').click();
        await fixture.whenStable();
        loop(5_016);
        loop(5_032);

        expect(simulated(renderer)).toBeGreaterThan(steps);
        expect(landLineOf(fixture)).toBe(landLine('simulating', 77));
      });
    });

    describe('New land', () => {
      it('draws a seed, writes it into the address, and starts a storm on it in place of the old', async () => {
        let draws = 0;
        const fixture = await mount({ search: '?seed=77', random: () => [0.5, 0.25][draws++] });
        const renderer = onlyRenderer();
        const loop = frameLoopOf(renderer);
        settleAndRun(renderer, 2_000);
        const before = landIn(onlyComposer());
        const freed = vi.spyOn((before as Land).material, 'dispose');

        buttonOf(fixture, 'New land').click();
        await fixture.whenStable();

        expect(rendererState.addressed).toEqual([SEED_SPAN / 2]);
        expect(landLineOf(fixture)).toBe(landLine('simulating', SEED_SPAN / 2));
        expect(freed).toHaveBeenCalledTimes(1);
        expect(landIn(onlyComposer())).toBeUndefined();
        expect(readoutOf(fixture)).toEqual([]);

        loop(4_000);
        await fixture.whenStable();

        expect(landIn(onlyComposer())).toBeDefined();
        expect(landIn(onlyComposer())).not.toBe(before);
        expect(readoutOf(fixture)[0]).toEqual(['Step', '0 of 12,000']);
      });

      it('gives up a land still being raised, and asks for its own on the same grid', async () => {
        let draws = 0;
        const held = heldRaise();
        const fixture = await mount({
          search: '?seed=77',
          random: () => [0.5, 0.25][draws++],
          raise: held.raise,
        });
        settleAndRun(onlyRenderer(), 200);

        buttonOf(fixture, 'New land').click();
        await fixture.whenStable();
        frameLoopOf(onlyRenderer())(4_000);

        expect(held.asked).toEqual([
          { seed: 77, size: SPEC_GRID, cancelled: true },
          { seed: SEED_SPAN / 2, size: SPEC_GRID, cancelled: false },
        ]);
      });

      it('unpauses: a new land is a new storm, and a storm starts by raining', async () => {
        const fixture = await mount();
        settleAndRun(onlyRenderer(), 200);
        buttonOf(fixture, 'Pause').click();
        await fixture.whenStable();
        buttonOf(fixture, 'New land').click();
        await fixture.whenStable();

        expect(buttonOf(fixture, 'Pause')).toBeInstanceOf(HTMLButtonElement);
      });
    });

    describe('the status a screen reader hears', () => {
      it('is a status region and not the readout, and says nothing until the first digest is due', async () => {
        const fixture = await mount();
        settleAndRun(onlyRenderer(), 2_000);
        await fixture.whenStable();
        const status = hostOf(fixture).querySelectorAll('[role="status"]');

        expect(status).toHaveLength(1);
        expect(status[0].textContent?.trim()).toBe('');
        expect(hostOf(fixture).querySelector('[aria-live]')).toBeNull();
        expect(hostOf(fixture).querySelector('.readout')?.getAttribute('role')).toBeNull();
      });

      it('is the readout in one sentence, rewritten every thirty seconds and no oftener', async () => {
        const intervals = vi.spyOn(window, 'setInterval');
        const fixture = await mount();
        settleAndRun(onlyRenderer(), 2_000);
        await settle();
        frameLoopOf(onlyRenderer())(10_000);
        await fixture.whenStable();
        const [announce, every] =
          intervals.mock.calls.find(([, ms]) => ms === ANNOUNCE_EVERY_MS) ?? [];
        (announce as () => void)();
        await fixture.whenStable();

        expect(every).toBe(ANNOUNCE_EVERY_MS);
        expect(hostOf(fixture).querySelector('[role="status"]')?.textContent?.trim()).toMatch(
          /^Step [\d,]+ of 12,000; \d\.\d\d m of rain\. 3 million m³ of rock moved, 1 million m³ carried off the block\.$/
        );
      });

      it('is never started where no storm runs', async () => {
        stubReducedMotion(true);
        const intervals = vi.spyOn(window, 'setInterval');
        await mount();

        expect(intervals.mock.calls.some(([, ms]) => ms === ANNOUNCE_EVERY_MS)).toBe(false);
      });
    });

    describe('turning the orbit', () => {
      const arrow = (key: string): KeyboardEvent => {
        const event = new KeyboardEvent('keydown', { key, cancelable: true });
        document.dispatchEvent(event);
        return event;
      };

      /** the whole storm, the descent and the settle, at the pace a device that keeps up runs them */
      const runToTheOrbit = (renderer: FakeRenderer): number => {
        const loop = frameLoopOf(renderer);
        const until = 1_000 + (STORM_SECONDS + heroSeconds(DIRECTION) + 3) * 1_000;
        let now = 1_000;
        for (; now <= until; now += 16) {
          loop(now);
        }
        return now;
      };

      it('is left to the page while the storm runs and the camera is on its path', async () => {
        await mount();
        settleAndRun(onlyRenderer(), 2_000);
        const camera = cameraOf(onlyComposer());
        const before = camera.position.clone();

        expect(arrow('ArrowLeft').defaultPrevented).toBe(false);
        expect(camera.position.equals(before)).toBe(true);
      });

      it('turns with the arrow keys once the orbit has begun, at once and on a paused orbit too', async () => {
        const fixture = await mount();
        runToTheOrbit(onlyRenderer());
        buttonOf(fixture, 'Pause').click();
        await fixture.whenStable();
        const camera = cameraOf(onlyComposer());
        const before = camera.position.clone();

        expect(arrow('ArrowLeft').defaultPrevented).toBe(true);
        expect(camera.position.equals(before)).toBe(false);
        expect(camera.position.length()).toBeCloseTo(before.length(), 0);
        expect(arrow('a').defaultPrevented).toBe(false);

        const lifted = camera.position.y;
        arrow('ArrowUp');

        expect(camera.position.y).toBeGreaterThan(lifted);
      });

      it('turns with a drag once the orbit has begun, and stops when the pointer lets go', async () => {
        const fixture = await mount();
        runToTheOrbit(onlyRenderer());
        buttonOf(fixture, 'Pause').click();
        await fixture.whenStable();
        const camera = cameraOf(onlyComposer());
        const canvas = canvasOf(fixture);
        const at = (type: string, x: number): void => {
          canvas.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: 100 }));
        };
        const before = camera.position.clone();

        at('pointerdown', 100);
        at('pointermove', 160);
        const turned = camera.position.clone();
        at('pointerup', 160);
        at('pointermove', 400);

        expect(turned.equals(before)).toBe(false);
        expect(camera.position.equals(turned)).toBe(true);
      });

      it('ignores a drag begun before the orbit', async () => {
        const fixture = await mount();
        settleAndRun(onlyRenderer(), 2_000);
        const camera = cameraOf(onlyComposer());
        const canvas = canvasOf(fixture);
        const before = camera.position.clone();
        canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: 0 }));
        canvas.dispatchEvent(new MouseEvent('pointermove', { clientX: 300 }));

        expect(camera.position.equals(before)).toBe(true);
      });
    });

    it('simulates nothing on a device that cannot render to float, and stands the stored land instead', async () => {
      rendererState.probeReads = 2400;
      await mount();
      await settle();
      const renderer = onlyRenderer();

      settleAndRun(renderer, 1_000);
      const land = landIn(onlyComposer());

      expect(simulated(renderer)).toBe(0);
      expect(renderer.readRenderTargetPixelsAsync).not.toHaveBeenCalled();
      // the stored land's own grid, not a tier's
      expect(land?.geometry.getAttribute('position').count).toBe(SPEC_GRID ** 2 + 8 * SPEC_GRID);
      expect((land?.material.uniforms['land'].value as THREE.DataTexture).image.data).toBe(
        SPEC_STORED.land
      );
      expect(lit(renderer)).toBeGreaterThan(0);
    });

    it('flies the pass over the stored land and then orbits, which can be paused and turned', async () => {
      rendererState.probeReads = 2400;
      const fixture = await mount();
      await settle();
      const camera = cameraOf(onlyComposer());
      const renderer = onlyRenderer();
      const loop = frameLoopOf(renderer);
      const until = 1_000 + (heroSeconds(DIRECTION) + 3) * 1_000;
      let now = 1_000;
      loop(now);
      const high = camera.position.y;
      for (; now <= until; now += 16) {
        loop(now);
      }
      await fixture.whenStable();
      const target = new THREE.Vector3(0, DIRECTION.heroTargetHeight, 0);

      expect(high).toBe(CAMERA_POSITION[1]);
      expect(camera.position.distanceTo(target)).toBeCloseTo(DIRECTION.heroDistance, 3);

      buttonOf(fixture, 'Pause').click();
      await fixture.whenStable();
      const held = camera.position.clone();
      loop(now + 1_000);

      expect(camera.position.equals(held)).toBe(true);
      expect(landLineOf(fixture)).toBe(landLine('stored', HERO_SEED, true));

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true }));

      expect(camera.position.equals(held)).toBe(false);
    });

    it('lets no key turn the still frame, which has no orbit to turn', async () => {
      stubReducedMotion(true);
      await mount();
      await settle();
      const event = new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true });
      document.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
    });

    it('frees the simulation and the land on destroy, and takes the land off the stage', async () => {
      const fixture = await mount();
      const renderer = onlyRenderer();
      settleAndRun(renderer, 200);
      const composer = onlyComposer();
      const land = landIn(composer) as Land;
      const material = vi.spyOn(land.material, 'dispose');
      const geometry = vi.spyOn(land.geometry, 'dispose');
      const targets = vi.spyOn(THREE.WebGLRenderTarget.prototype, 'dispose');

      fixture.destroy();

      expect(material).toHaveBeenCalledTimes(1);
      expect(geometry).toHaveBeenCalledTimes(1);
      expect(landIn(composer)).toBeUndefined();
      // two copies of each state texture and the light's one; the passes' own are freed with them, so at least these
      expect(targets.mock.calls.length).toBeGreaterThanOrEqual(SIM_STATES.length * 2 + 1);
    });

    it('waits for its land, starting the storm in the first frame after it is raised, and not before', async () => {
      const held = heldRaise();
      await mount({ raise: held.raise });
      const renderer = onlyRenderer();
      const loop = frameLoopOf(renderer);
      settleAndRun(renderer, 500);

      expect(landIn(onlyComposer())).toBeUndefined();
      expect(held.asked).toEqual([{ seed: expect.any(Number), size: SPEC_GRID, cancelled: false }]);

      held.release();
      loop(3_000);

      expect(landIn(onlyComposer())).toBeDefined();
      expect(held.asked).toHaveLength(1);
    });

    it('gives up a land still being raised on destroy', async () => {
      const held = heldRaise();
      const fixture = await mount({ raise: held.raise });
      settleAndRun(onlyRenderer(), 200);

      fixture.destroy();

      expect(held.asked[0].cancelled).toBe(true);
    });
  });

  describe('following the canvas size', () => {
    /** jsdom has no ResizeObserver; this one records what it watches and lets a test report a resize */
    class FakeResizeObserver {
      public static last?: FakeResizeObserver;
      public readonly observed: Element[] = [];
      public readonly disconnect = vi.fn();
      constructor(public readonly report: () => void) {
        FakeResizeObserver.last = this;
      }
      public observe(target: Element): void {
        this.observed.push(target);
      }
    }

    /** gives the canvas a layout size, which jsdom never computes */
    const sizeCanvas = (
      fixture: ComponentFixture<Watershed>,
      width: number,
      height: number
    ): void => {
      const canvas = canvasOf(fixture);
      Object.defineProperty(canvas, 'clientWidth', { value: width, configurable: true });
      Object.defineProperty(canvas, 'clientHeight', { value: height, configurable: true });
    };

    const watcher = (): FakeResizeObserver => {
      const observer = FakeResizeObserver.last;
      if (!observer) {
        throw new Error('nothing is watching the canvas');
      }
      return observer;
    };

    beforeEach(() => {
      FakeResizeObserver.last = undefined;
      vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    });

    it('watches the canvas it draws into', async () => {
      const fixture = await mount();

      expect(watcher().observed).toEqual([canvasOf(fixture)]);
    });

    it('resizes the renderer, the composer and the camera together', async () => {
      const fixture = await mount();
      const composer = onlyComposer();
      const camera = cameraOf(composer);

      sizeCanvas(fixture, 900, 1600);
      watcher().report();

      expect(onlyRenderer().setSize).toHaveBeenLastCalledWith(900, 1600, false);
      expect(composer.setSize).toHaveBeenLastCalledWith(900, 1600);
      expect(camera.aspect).toBeCloseTo(9 / 16, 10);
      expect(camera.fov).toBe(verticalFovFor(9 / 16));
    });

    it('ignores a report that changes nothing, and a canvas measuring zero', async () => {
      const fixture = await mount();
      const composer = onlyComposer();

      sizeCanvas(fixture, 1600, 900);
      watcher().report();
      watcher().report();
      sizeCanvas(fixture, 0, 900);
      watcher().report();
      sizeCanvas(fixture, 1600, 0);
      watcher().report();

      expect(composer.setSize).toHaveBeenCalledTimes(1);
    });

    it('redraws the still frame under reduced motion, which has no loop to pick the change up', async () => {
      stubReducedMotion(true);
      const fixture = await mount();
      await settle();

      sizeCanvas(fixture, 800, 1200);
      watcher().report();

      expect(onlyComposer().render).toHaveBeenCalledTimes(2);
    });

    it('leaves the drawing to the loop when there is one', async () => {
      const fixture = await mount();

      sizeCanvas(fixture, 800, 1200);
      watcher().report();

      expect(onlyComposer().render).not.toHaveBeenCalled();
    });

    it('stops watching on destroy', async () => {
      const fixture = await mount();

      fixture.destroy();

      expect(watcher().disconnect).toHaveBeenCalledTimes(1);
    });
  });

  it('draws without a ResizeObserver, where there is none to make', async () => {
    vi.stubGlobal('ResizeObserver', undefined);
    stubReducedMotion(true);
    const fixture = await mount();
    await settle();

    expect(onlyComposer().render).toHaveBeenCalledTimes(1);
    expect(() => fixture.destroy()).not.toThrow();
  });

  describe('on destroy', () => {
    it('stops the loop and releases the renderer', async () => {
      const fixture = await mount();
      const renderer = onlyRenderer();

      fixture.destroy();

      expect(renderer.setAnimationLoop).toHaveBeenLastCalledWith(null);
      expect(renderer.dispose).toHaveBeenCalledTimes(1);
    });

    it('releases every pass, once, and the composer', async () => {
      const fixture = await mount();
      const composer = onlyComposer();
      const passes = composer.passes.map((pass) => vi.spyOn(pass, 'dispose'));

      fixture.destroy();

      expect(passes).toHaveLength(6);
      for (const pass of passes) {
        expect(pass).toHaveBeenCalledTimes(1);
      }
      expect(composer.dispose).toHaveBeenCalledTimes(1);
    });

    it('releases the stored land and takes it off the stage', async () => {
      stubReducedMotion(true);
      const fixture = await mount();
      await settle();
      const composer = onlyComposer();
      const land = landIn(composer) as Land;
      const geometry = vi.spyOn(land.geometry, 'dispose');
      const material = vi.spyOn(land.material, 'dispose');
      const texture = vi.spyOn(land.material.uniforms['land'].value as THREE.Texture, 'dispose');

      fixture.destroy();

      expect(geometry).toHaveBeenCalledTimes(1);
      expect(material).toHaveBeenCalledTimes(1);
      expect(texture).toHaveBeenCalledTimes(1);
      expect(landIn(composer)).toBeUndefined();
    });

    it('stops listening for a lost context', async () => {
      const fixture = await mount();
      const renderer = onlyRenderer();
      const canvas = canvasOf(fixture);

      fixture.destroy();
      const stops = renderer.setAnimationLoop.mock.calls.length;
      canvas.dispatchEvent(new Event('webglcontextlost'));

      expect(renderer.setAnimationLoop).toHaveBeenCalledTimes(stops);
    });

    it('releases nothing it never made, when WebGL failed', async () => {
      rendererState.fail = true;
      const fixture = await mount();

      expect(() => fixture.destroy()).not.toThrow();
    });
  });
});
