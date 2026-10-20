import { ComponentFixture, TestBed } from '@angular/core/testing';
import * as THREE from 'three';
import * as CALIBRATION from './batoid-calibration';
import { Murmuration } from './murmuration';

/**
 * jsdom has no WebGL, so a real `WebGLRenderer` always throws here and only the
 * failure path would ever run. Everything else in `three` is real — the scene,
 * the mesh, the geometry — and only the renderer is swapped for one that
 * records what the component asked of it, and can be told to fail.
 */

type FrameCallback = (nowMs: number) => void;

interface IFakeRenderer {
  readonly render: ReturnType<typeof vi.fn<(scene: THREE.Scene, camera: THREE.Camera) => void>>;
  readonly setAnimationLoop: ReturnType<typeof vi.fn<(callback: FrameCallback | null) => void>>;
  readonly dispose: ReturnType<typeof vi.fn<() => void>>;
}

const rendererState = vi.hoisted(() => ({
  fail: false,
  instances: [] as IFakeRenderer[],
}));

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();

  class FakeRenderer {
    public readonly setPixelRatio = vi.fn();
    public readonly setSize = vi.fn();
    public readonly render = vi.fn();
    public readonly setAnimationLoop = vi.fn();
    public readonly dispose = vi.fn();

    constructor() {
      if (rendererState.fail) {
        throw new Error('Error creating WebGL context.');
      }
      rendererState.instances.push(this as unknown as IFakeRenderer);
    }
  }

  return { ...actual, WebGLRenderer: FakeRenderer };
});

const stubReducedMotion = (reduce: boolean): void => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query === '(prefers-reduced-motion: reduce)',
  }));
};

const mount = async (): Promise<ComponentFixture<Murmuration>> => {
  await TestBed.configureTestingModule({ imports: [Murmuration] }).compileComponents();
  const fixture = TestBed.createComponent(Murmuration);
  await fixture.whenStable();
  return fixture;
};

const onlyRenderer = (): IFakeRenderer => {
  expect(rendererState.instances).toHaveLength(1);
  return rendererState.instances[0];
};

/** The frame callback the component handed to `setAnimationLoop`. */
const frameLoopOf = (renderer: IFakeRenderer): FrameCallback => {
  const callback = renderer.setAnimationLoop.mock.calls[0][0];
  if (!callback) {
    throw new Error('no animation loop was started');
  }
  return callback;
};

const batoidIn = (renderer: IFakeRenderer): THREE.Mesh => {
  const [scene] = renderer.render.mock.lastCall ?? [];
  const mesh = scene?.children.find((child) => child instanceof THREE.Mesh);
  if (!(mesh instanceof THREE.Mesh)) {
    throw new Error('no batoid in the rendered scene');
  }
  return mesh;
};

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
    expect(batoidIn(renderer).rotation.y).toBe(CALIBRATION.INITIAL_HEADING);
  });

  it('does not turn the batoid on the first frame, whatever its timestamp', async () => {
    await mount();
    const renderer = onlyRenderer();

    frameLoopOf(renderer)(90_000);

    expect(batoidIn(renderer).rotation.y).toBe(CALIBRATION.INITIAL_HEADING);
  });

  it('clamps a long gap between frames rather than spinning to catch up', async () => {
    await mount();
    const renderer = onlyRenderer();
    const loop = frameLoopOf(renderer);

    loop(1_000);
    loop(61_000);

    const turned = batoidIn(renderer).rotation.y - CALIBRATION.INITIAL_HEADING;
    const perSecond = CALIBRATION.SPIN_RADIANS_PER_SECOND;
    expect(turned).toBeGreaterThanOrEqual(
      perSecond * (CALIBRATION.CLAMP_SECONDS - CALIBRATION.TICK_SECONDS)
    );
    expect(turned).toBeLessThanOrEqual(perSecond * CALIBRATION.CLAMP_SECONDS + 1e-9);
  });

  it('stops the loop and releases the GPU on destroy', async () => {
    const fixture = await mount();
    const renderer = onlyRenderer();

    fixture.destroy();

    expect(renderer.setAnimationLoop).toHaveBeenLastCalledWith(null);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
  });
});
