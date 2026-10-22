import * as THREE from 'three';
import { GOD_RAYS } from '../light-calibration';
import { GodRaysPass } from './god-rays-pass';

/**
 * a `FullScreenQuad` draws by calling `renderer.render(mesh, camera)`, so a renderer that only
 * records where it was pointed and what it drew is enough to follow the pass without WebGL.
 * what the shaders make of it is not visible here; that needs a browser.
 */
class FakeRenderer {
  public readonly draws: Array<THREE.WebGLRenderTarget | null> = [];
  public readonly materials: THREE.Material[] = [];
  private target: THREE.WebGLRenderTarget | null = null;
  public readonly setRenderTarget = vi.fn((target: THREE.WebGLRenderTarget | null) => {
    this.target = target;
  });
  public readonly render = vi.fn((quad: THREE.Mesh) => {
    this.draws.push(this.target);
    this.materials.push(quad.material as THREE.Material);
  });
}

const camera = (): THREE.PerspectiveCamera => {
  const lens = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 100);
  lens.updateMatrixWorld();
  return lens;
};

const AHEAD = new THREE.Vector3(0, 0, -1);
const BEHIND = new THREE.Vector3(0, 0, 1);

const run = (pass: GodRaysPass, renderer: FakeRenderer, write: THREE.WebGLRenderTarget): void => {
  pass.render(
    renderer as unknown as THREE.WebGLRenderer,
    write,
    new THREE.WebGLRenderTarget(4, 4, { depthTexture: new THREE.DepthTexture(4, 4) })
  );
};

describe('GodRaysPass', () => {
  it('swaps buffers, so the bloom after it reads what it wrote', () => {
    expect(new GodRaysPass(camera(), AHEAD, GOD_RAYS).needsSwap).toBe(true);
  });

  it('draws the mask and the blur off-screen, then the frame into the write buffer', () => {
    const renderer = new FakeRenderer();
    const write = new THREE.WebGLRenderTarget(4, 4);
    run(new GodRaysPass(camera(), AHEAD, GOD_RAYS), renderer, write);

    expect(renderer.draws).toHaveLength(3);
    expect(renderer.draws[0]).not.toBe(write);
    expect(renderer.draws[1]).not.toBe(write);
    expect(renderer.draws[0]).not.toBe(renderer.draws[1]);
    expect(renderer.draws[2]).toBe(write);
  });

  it('skips both low-resolution steps when the sun is out of view, but still passes the frame on', () => {
    const renderer = new FakeRenderer();
    const write = new THREE.WebGLRenderTarget(4, 4);
    run(new GodRaysPass(camera(), BEHIND, GOD_RAYS), renderer, write);

    expect(renderer.draws).toEqual([write]);
  });

  it('draws to the screen when it is the last pass', () => {
    const renderer = new FakeRenderer();
    const pass = new GodRaysPass(camera(), AHEAD, GOD_RAYS);
    pass.renderToScreen = true;
    run(pass, renderer, new THREE.WebGLRenderTarget(4, 4));

    expect(renderer.draws.at(-1)).toBeNull();
  });

  it('builds the shafts at the calibrated fraction of the frame', () => {
    const renderer = new FakeRenderer();
    const pass = new GodRaysPass(camera(), AHEAD, GOD_RAYS);
    pass.setSize(800, 400);
    run(pass, renderer, new THREE.WebGLRenderTarget(800, 400));
    const [mask, rays] = renderer.draws;

    expect(mask?.width).toBe(800 * GOD_RAYS.maskScale);
    expect(mask?.height).toBe(400 * GOD_RAYS.maskScale);
    expect(rays?.width).toBe(mask?.width);
    expect(rays?.height).toBe(mask?.height);
  });

  it('releases both of its targets and all three materials', () => {
    const targetsDisposed = vi.fn();
    const materialsDisposed = vi.fn();
    const pass = new GodRaysPass(camera(), AHEAD, GOD_RAYS);
    const renderer = new FakeRenderer();
    run(pass, renderer, new THREE.WebGLRenderTarget(4, 4));
    const [mask, rays] = renderer.draws;
    mask?.addEventListener('dispose', targetsDisposed);
    rays?.addEventListener('dispose', targetsDisposed);
    for (const material of renderer.materials) {
      material.addEventListener('dispose', materialsDisposed);
    }
    pass.dispose();

    expect(new Set(renderer.materials).size).toBe(3);
    expect(targetsDisposed).toHaveBeenCalledTimes(2);
    expect(materialsDisposed).toHaveBeenCalledTimes(3);
  });
});
