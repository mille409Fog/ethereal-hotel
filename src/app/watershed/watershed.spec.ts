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
import { landLine } from './land-state';
import { EROSION } from './model/erosion-calibration';
import { IQualityTier, MEASURE_WINDOW_MS, QUALITY_TIERS } from './quality/quality-calibration';
import { HERO_SEED, Random, SEED_SPAN } from './seed/seed';
import { REPORT_EVERY, STORM_SECONDS } from './sim/sim-calibration';
import { SIM_PASSES, SIM_STATES } from './sim/sim-shaders';
import { PROBE_VALUE } from './sim/sim-support';
import { verticalFovFor } from './stage/stage-camera';
import { CAMERA_POSITION, LAND_EXTENT } from './stage/stage-calibration';
import { Watershed } from './watershed';
import {
  WATERSHED_COMPOSER,
  WATERSHED_RANDOM,
  WATERSHED_RENDERER,
  WATERSHED_SEARCH,
  WATERSHED_TIERS,
} from './watershed.tokens';

/** The calibrated tiers on a grid of a few cells: what these tests prove holds at any size. */
const SPEC_GRID = 8;
const SPEC_TIERS: readonly IQualityTier[] = QUALITY_TIERS.map((tier) => ({
  ...tier,
  grid: SPEC_GRID,
}));

const NO_PROGRESS = { steps: 0, total: EROSION.stormSteps };

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
}

const mount = async (options: IMountOptions = {}): Promise<ComponentFixture<Watershed>> => {
  const providers: object[] = [{ provide: WATERSHED_TIERS, useValue: SPEC_TIERS }];
  if (options.random) {
    providers.push({ provide: WATERSHED_RANDOM, useValue: options.random });
  }
  if (options.search !== undefined) {
    providers.push({ provide: WATERSHED_SEARCH, useValue: options.search });
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

/** The slab in the scene drawn. */
const placeholderIn = (composer: FakeComposer): THREE.Mesh<THREE.PlaneGeometry> => {
  const slab = passOf(composer, RenderPass).scene.children.find(
    (child) => child instanceof THREE.Mesh
  );
  if (!(slab instanceof THREE.Mesh)) {
    throw new Error('no placeholder in the rendered scene');
  }
  return slab as THREE.Mesh<THREE.PlaneGeometry>;
};

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
      composer.dispose();
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
  });

  describe('the land it says it shows', () => {
    it('can simulate when the float target reads back exactly', async () => {
      const fixture = await mount({ search: '?seed=77' });

      expect(canvasOf(fixture).hidden).toBe(false);
      expect(canvasOf(fixture).dataset['land']).toBe('simulating');
      expect(landLineOf(fixture)).toBe(landLine('simulating', 77, NO_PROGRESS));
    });

    it('draws a seed from chance when the address names none', async () => {
      const fixture = await mount({ search: '', random: () => 0.5 });

      expect(landLineOf(fixture)).toContain(`Seed ${SEED_SPAN / 2}.`);
    });

    it('draws a seed from chance when the address names something that is not one', async () => {
      const fixture = await mount({ search: '?seed=12abc', random: () => 0 });

      expect(landLineOf(fixture)).toContain('Seed 0.');
    });

    it('shows the stored land, under its own seed, when the float target rounds', async () => {
      rendererState.probeReads = 2400;
      const fixture = await mount({ search: '?seed=77' });

      expect(canvasOf(fixture).dataset['land']).toBe('stored');
      expect(landLineOf(fixture)).toBe(landLine('stored', HERO_SEED, NO_PROGRESS));
    });

    it('holds still under reduced motion, under the stored seed, even on a device that could simulate', async () => {
      stubReducedMotion(true);
      const fixture = await mount({ search: '?seed=77' });

      expect(canvasOf(fixture).dataset['land']).toBe('still');
      expect(landLineOf(fixture)).toBe(landLine('still', HERO_SEED, NO_PROGRESS));
    });

    it('probes the device before building the chain on its renderer', async () => {
      await mount();

      expect(onlyComposer().builtAfterProbe).toBe(true);
    });
  });

  describe('post-processing', () => {
    it('draws the scene, blooms it, tone-maps it, grades it, and only then grains it', async () => {
      // the grain is last because it is also the dither: see orchestrate-passes.ts
      await mount();
      const kinds = onlyComposer().passes.map((pass) => pass.constructor);

      expect(kinds).toEqual([RenderPass, UnrealBloomPass, OutputPass, GradePass, GrainPass]);
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
    it('lays a slab the size of the land flat under the camera', async () => {
      await mount();
      const slab = placeholderIn(onlyComposer());
      slab.geometry.computeBoundingBox();
      const size = slab.geometry.boundingBox?.getSize(new THREE.Vector3());

      expect(size?.x).toBeCloseTo(LAND_EXTENT, 6);
      expect(size?.z).toBeCloseTo(LAND_EXTENT, 6);
      expect(size?.y).toBeCloseTo(0, 6);
    });

    it('is seen from the calibrated vantage', async () => {
      await mount();

      expect(cameraOf(onlyComposer()).position.toArray()).toEqual([...CAMERA_POSITION]);
    });
  });

  describe('drawing', () => {
    it('draws one still frame under reduced motion and starts no loop', async () => {
      stubReducedMotion(true);
      await mount();
      const renderer = onlyRenderer();

      expect(onlyComposer().render).toHaveBeenCalledTimes(1);
      expect(renderer.setAnimationLoop).not.toHaveBeenCalled();
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
    });
  });

  describe('the storm', () => {
    /** Draws made by the simulation: every `render` after the one the float-target probe makes. */
    const simulated = (renderer: FakeRenderer): number => renderer.render.mock.calls.length - 1;

    /** Frames fast enough that the meter settles on the first window, then `afterMs` more. */
    const settleAndRun = (renderer: FakeRenderer, afterMs: number): void => {
      runFrames(frameLoopOf(renderer), 16, MEASURE_WINDOW_MS + 16 + afterMs);
    };

    it('does not start until the quality meter has settled on a tier', async () => {
      await mount();
      const renderer = onlyRenderer();

      runFrames(frameLoopOf(renderer), 16, MEASURE_WINDOW_MS / 2);

      expect(simulated(renderer)).toBe(0);
      expect(placeholderIn(onlyComposer()).material).toBeInstanceOf(THREE.MeshStandardMaterial);
    });

    it('starts on the settled tier’s grid, and puts the map of its land on the slab', async () => {
      await mount();
      const renderer = onlyRenderer();

      settleAndRun(renderer, 200);
      const map = placeholderIn(onlyComposer()).material as THREE.ShaderMaterial;

      expect(map).toBeInstanceOf(THREE.ShaderMaterial);
      expect(map.name).toBe('WatershedMap');
      expect(map.uniforms['texel'].value).toBe(1 / SPEC_GRID);
      expect(map.uniforms['land'].value).toBeInstanceOf(THREE.Texture);
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

    it('keeps the map on the texture the land is in now, which changes every step', async () => {
      await mount();
      const renderer = onlyRenderer();
      settleAndRun(renderer, 200);
      const map = placeholderIn(onlyComposer()).material as THREE.ShaderMaterial;
      const written = renderer.setRenderTarget.mock.calls
        .map(([target]) => target as THREE.WebGLRenderTarget | null)
        .filter((target): target is THREE.WebGLRenderTarget => target !== null);

      // the last pass of a step writes the land, so the land is in the last target drawn into
      expect(map.uniforms['land'].value).toBe(written[written.length - 1].texture);
    });

    it('tells the state line how far it has got, in round numbers', async () => {
      const fixture = await mount({ search: '?seed=77' });
      const renderer = onlyRenderer();

      settleAndRun(renderer, 2_000);
      await fixture.whenStable();
      const steps = simulated(renderer) / SIM_PASSES.length;
      const said = steps - (steps % REPORT_EVERY);

      expect(said).toBeGreaterThan(0);
      expect(landLineOf(fixture)).toBe(
        landLine('simulating', 77, { steps: said, total: EROSION.stormSteps })
      );
    });

    it('simulates nothing on a device that cannot render to float', async () => {
      rendererState.probeReads = 2400;
      await mount();
      const renderer = onlyRenderer();

      settleAndRun(renderer, 1_000);

      expect(simulated(renderer)).toBe(0);
      expect(placeholderIn(onlyComposer()).material).toBeInstanceOf(THREE.MeshStandardMaterial);
    });

    it('frees the simulation on destroy and gives the slab its own material back', async () => {
      const fixture = await mount();
      const renderer = onlyRenderer();
      settleAndRun(renderer, 200);
      const slab = placeholderIn(onlyComposer());
      const map = vi.spyOn(slab.material as THREE.Material, 'dispose');
      const targets = vi.spyOn(THREE.WebGLRenderTarget.prototype, 'dispose');

      fixture.destroy();

      expect(map).toHaveBeenCalledTimes(1);
      expect(slab.material).toBeInstanceOf(THREE.MeshStandardMaterial);
      // two copies of each state texture; the passes' own targets are freed with them, so at least these
      expect(targets.mock.calls.length).toBeGreaterThanOrEqual(SIM_STATES.length * 2);
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

      expect(passes).toHaveLength(5);
      for (const pass of passes) {
        expect(pass).toHaveBeenCalledTimes(1);
      }
      expect(composer.dispose).toHaveBeenCalledTimes(1);
    });

    it('releases the slab: its geometry and its material', async () => {
      const fixture = await mount();
      const slab = placeholderIn(onlyComposer());
      const geometry = vi.spyOn(slab.geometry, 'dispose');
      const material = vi.spyOn(slab.material as THREE.Material, 'dispose');

      fixture.destroy();

      expect(geometry).toHaveBeenCalledTimes(1);
      expect(material).toHaveBeenCalledTimes(1);
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
