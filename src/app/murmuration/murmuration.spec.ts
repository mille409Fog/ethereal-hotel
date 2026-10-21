import { ComponentFixture, TestBed } from '@angular/core/testing';
import * as THREE from 'three';
import * as CALIBRATION from './batoid/batoid-calibration';
import { Random } from './batoid/batoid-types';
import { Murmuration, MURMURATION_RANDOM, MURMURATION_RENDERER } from './murmuration';

/**
 * jsdom has no WebGL, so a real `WebGLRenderer` always throws here and only the
 * failure path would ever run. Everything else in `three` is real — the scene,
 * the mesh, the geometry — and only the renderer is swapped, through
 * `MURMURATION_RENDERER`, for one that records what the component asked of it
 * and can be told to fail.
 */

type FrameCallback = (nowMs: number) => void;

class FakeRenderer {
  public readonly setPixelRatio = vi.fn();
  public readonly setSize = vi.fn();
  public readonly render = vi.fn<(scene: THREE.Scene, camera: THREE.Camera) => void>();
  public readonly setAnimationLoop = vi.fn<(callback: FrameCallback | null) => void>();
  public readonly dispose = vi.fn();
}

/** What the fake factory does this test, and every renderer it made. */
const rendererState = {
  fail: false,
  instances: [] as FakeRenderer[],
};

const fakeRendererFactory = (): THREE.WebGLRenderer => {
  if (rendererState.fail) {
    throw new Error('Error creating WebGL context.');
  }
  const renderer = new FakeRenderer();
  rendererState.instances.push(renderer);
  return renderer as unknown as THREE.WebGLRenderer;
};

const stubReducedMotion = (reduce: boolean): void => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query === '(prefers-reduced-motion: reduce)',
  }));
};

interface IMountOptions {
  readonly random?: Random;
  /** Leave the real `WebGLRenderer` in place, which jsdom cannot give a context. */
  readonly realRenderer?: boolean;
}

const mount = async (options: IMountOptions = {}): Promise<ComponentFixture<Murmuration>> => {
  const providers = [];
  if (options.random) {
    providers.push({ provide: MURMURATION_RANDOM, useValue: options.random });
  }
  if (!options.realRenderer) {
    providers.push({ provide: MURMURATION_RENDERER, useValue: fakeRendererFactory });
  }
  await TestBed.configureTestingModule({ imports: [Murmuration], providers }).compileComponents();
  const fixture = TestBed.createComponent(Murmuration);
  await fixture.whenStable();
  return fixture;
};

const onlyRenderer = (): FakeRenderer => {
  expect(rendererState.instances).toHaveLength(1);
  return rendererState.instances[0];
};

/** The frame callback the component handed to `setAnimationLoop`. */
const frameLoopOf = (renderer: FakeRenderer): FrameCallback => {
  const callback = renderer.setAnimationLoop.mock.calls[0][0];
  if (!callback) {
    throw new Error('no animation loop was started');
  }
  return callback;
};

/**
 * The flock in the last scene drawn. `InstancedMesh` rather than `Mesh`:
 * an instanced mesh *is* a mesh, so the looser test would also match any
 * single mesh added beside it, and which one it found would depend on the
 * order of `scene.add`.
 */
const flockIn = (renderer: FakeRenderer): THREE.InstancedMesh => {
  const [scene] = renderer.render.mock.lastCall ?? [];
  const flock = scene?.children.find((child) => child instanceof THREE.InstancedMesh);
  if (!(flock instanceof THREE.InstancedMesh)) {
    throw new Error('no flock in the rendered scene');
  }
  return flock;
};

/**
 * A draw of one half is the centre of every spread, a heading of 0 and no climb, so
 * every bat launches from the origin flying along +x at `FLIGHT_SPEED`, and
 * how far bat 0 has come along x is a direct count of the ticks spent.
 */
const LEVEL = (): number => 0.5;

/** Bat 0's x, read out of the instance buffer: element 12 of a column-major 4×4. */
const firstBatX = (renderer: FakeRenderer): number => flockIn(renderer).instanceMatrix.array[12];

/**
 * How far a bat flies in one tick. The exact tick counts behind each frame
 * are `cauldron-clock.spec.ts`'s to prove; this spec only checks that the
 * component spends whatever the clock hands it, at this rate.
 */
const STEP_PER_TICK = CALIBRATION.FLIGHT_SPEED * CALIBRATION.TICK_SECONDS;

/**
 * Positions live in a `Float32Array` and are rounded after every tick, so a
 * few dozen ticks drift in the seventh digit; five decimal places is well clear.
 */
const DIGITS = 5;

describe('Murmuration', () => {
  beforeEach(() => {
    rendererState.fail = false;
    rendererState.instances = [];
    stubReducedMotion(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('says so instead of drawing when WebGL is unavailable', async () => {
    rendererState.fail = true;
    const fixture = await mount();
    const host: HTMLElement = fixture.nativeElement;

    expect(host.querySelector('p')?.textContent).toContain('unable to operate webGL');
    expect(host.querySelector('canvas')?.hidden).toBe(true);
  });

  it('builds a real WebGLRenderer by default, and says so when the browser cannot', async () => {
    // jsdom is a browser without WebGL, so the default factory is exactly the
    // "very unfortunate people" path: three throws, and the page owns up.
    const fixture = await mount({ realRenderer: true });
    const host: HTMLElement = fixture.nativeElement;

    expect(host.querySelector('p')?.textContent).toContain('unable to operate webGL');
    expect(rendererState.instances).toHaveLength(0);
  });

  it('shows the canvas and no failure message when WebGL works', async () => {
    const fixture = await mount();
    const host: HTMLElement = fixture.nativeElement;

    expect(host.querySelector('p')).toBeNull();
    expect(host.querySelector('canvas')?.hidden).toBe(false);
  });

  it('draws one still frame under reduced motion and starts no loop', async () => {
    stubReducedMotion(true);
    await mount();
    const renderer = onlyRenderer();

    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(renderer.setAnimationLoop).not.toHaveBeenCalled();
  });

  it('poses the flock before the still frame, rather than drawing every bat at the identity', async () => {
    // An unposed instance is full size at the origin; a posed one is shrunk.
    stubReducedMotion(true);
    await mount();
    const m = flockIn(onlyRenderer()).instanceMatrix.array;

    expect(Math.hypot(m[8], m[9], m[10])).toBeCloseTo(CALIBRATION.CAULDRON.batScale, DIGITS);
  });

  it('builds its flock from the injected chance, not from Math.random', async () => {
    // Where each draw puts each bat is `batoid-transformation.spec.ts`'s to prove.
    // Here: every draw comes from the token, and a draw of 0 is visibly a
    // bat at the cauldron's near corner.
    const random = vi.fn(() => 0);
    stubReducedMotion(true);
    await mount({ random });
    const { count, halfWidth, halfHeight, halfDepth } = CALIBRATION.CAULDRON;
    // A 4×4 matrix is column-major; its translation is elements 12, 13, 14.
    const [x, y, z] = flockIn(onlyRenderer()).instanceMatrix.array.slice(12, 15);

    expect(random).toHaveBeenCalledTimes(5 * count);
    expect(x).toBeCloseTo(-halfWidth, 5);
    expect(y).toBeCloseTo(-halfHeight, 5);
    expect(z).toBeCloseTo(-halfDepth, 5);
  });

  it('draws every frame of the loop, including those worth no tick', async () => {
    await mount();
    const renderer = onlyRenderer();
    const loop = frameLoopOf(renderer);

    loop(1_000);
    loop(1_005);
    loop(1_100);

    expect(renderer.render).toHaveBeenCalledTimes(3);
  });

  it('does not move the flock on the first frame, whatever its timestamp', async () => {
    await mount({ random: LEVEL });
    const renderer = onlyRenderer();

    frameLoopOf(renderer)(90_000);

    expect(firstBatX(renderer)).toBe(0);
  });

  it('flies every bat one tick of its velocity for every tick the clock counts', async () => {
    await mount({ random: LEVEL });
    const renderer = onlyRenderer();
    const loop = frameLoopOf(renderer);

    loop(1_000);
    loop(1_100); // 100ms: six ticks

    expect(firstBatX(renderer)).toBeCloseTo(6 * STEP_PER_TICK, DIGITS);
  });

  it('keeps one clock across frames, so short frames add up to a tick', async () => {
    await mount({ random: LEVEL });
    const renderer = onlyRenderer();
    const loop = frameLoopOf(renderer);

    loop(1_000);
    loop(1_010); // 10ms: less than a tick, carried
    loop(1_020); // 20ms in all: one tick

    expect(firstBatX(renderer)).toBeCloseTo(STEP_PER_TICK, DIGITS);
  });

  it('clamps a long gap between frames rather than flying to catch up', async () => {
    await mount({ random: LEVEL });
    const renderer = onlyRenderer();
    const loop = frameLoopOf(renderer);

    loop(1_000);
    loop(61_000);

    const ticks = Math.floor(CALIBRATION.CLAMP_SECONDS / CALIBRATION.TICK_SECONDS);
    expect(firstBatX(renderer)).toBeCloseTo(ticks * STEP_PER_TICK, DIGITS);
  });

  it('leaves the instance buffer alone on a frame worth no tick, so nothing is re-uploaded', async () => {
    await mount({ random: LEVEL });
    const renderer = onlyRenderer();
    const loop = frameLoopOf(renderer);

    loop(1_000);
    const before = flockIn(renderer).instanceMatrix.version;
    loop(1_005); // 5ms: no tick

    expect(flockIn(renderer).instanceMatrix.version).toBe(before);
  });

  it('stops the loop and releases the GPU on destroy', async () => {
    const fixture = await mount();
    const renderer = onlyRenderer();

    fixture.destroy();

    expect(renderer.setAnimationLoop).toHaveBeenLastCalledWith(null);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
  });

  it('releases the flock: its geometry, its material and its instance buffer', async () => {
    stubReducedMotion(true);
    const fixture = await mount();
    const flock = flockIn(onlyRenderer());
    const geometry = vi.spyOn(flock.geometry, 'dispose');
    const material = vi.spyOn(flock.material as THREE.Material, 'dispose');
    const instances = vi.spyOn(flock, 'dispose');

    fixture.destroy();

    expect(geometry).toHaveBeenCalledTimes(1);
    expect(material).toHaveBeenCalledTimes(1);
    expect(instances).toHaveBeenCalledTimes(1);
  });
});
