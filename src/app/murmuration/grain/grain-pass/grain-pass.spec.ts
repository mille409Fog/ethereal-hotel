import * as THREE from 'three';
import { GRAIN_INTENSITY, GRAIN_SEED_STEP } from '../grain-calibration';
import { GrainPass } from './grain-pass';

/**
 * a `ShaderPass` draws by calling `renderer.render(quad, camera)`, so a renderer that only records
 * where it was pointed is enough to follow the pass without WebGL. what the grain looks like is not
 * visible here; that needs a browser.
 */
class FakeRenderer {
  public readonly draws: Array<THREE.WebGLRenderTarget | null> = [];
  private target: THREE.WebGLRenderTarget | null = null;
  public readonly setRenderTarget = vi.fn((target: THREE.WebGLRenderTarget | null) => {
    this.target = target;
  });
  public readonly clear = vi.fn();
  public readonly render = vi.fn(() => {
    this.draws.push(this.target);
  });
}

const run = (pass: GrainPass, renderer: FakeRenderer, write: THREE.WebGLRenderTarget): void => {
  pass.render(
    renderer as unknown as THREE.WebGLRenderer,
    write,
    new THREE.WebGLRenderTarget(4, 4),
    0,
    false
  );
};

const seedOf = (pass: GrainPass): number => pass.uniforms['seed'].value as number;

describe('GrainPass', () => {
  it('grains at the intensity it is given', () => {
    expect(new GrainPass(GRAIN_INTENSITY).uniforms['intensity'].value).toBe(GRAIN_INTENSITY);
  });

  it('draws its first frame at seed 0, so a still frame is always the same pattern', () => {
    const pass = new GrainPass(GRAIN_INTENSITY);
    const renderer = new FakeRenderer();
    const seeds: number[] = [];
    renderer.render.mockImplementation(() => {
      seeds.push(seedOf(pass));
    });
    run(pass, renderer, new THREE.WebGLRenderTarget(4, 4));

    expect(seeds).toEqual([0]);
  });

  it('reseeds after every frame, and keeps the seed inside 0..1', () => {
    const pass = new GrainPass(GRAIN_INTENSITY);
    const renderer = new FakeRenderer();
    const write = new THREE.WebGLRenderTarget(4, 4);
    const seeds = new Set<number>();
    for (let frame = 0; frame < 100; frame++) {
      run(pass, renderer, write);
      seeds.add(seedOf(pass));
    }

    expect(seeds.size).toBe(100);
    for (const seed of seeds) {
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThan(1);
    }
    expect(seedOf(pass)).toBeCloseTo((100 * GRAIN_SEED_STEP) % 1, 6);
  });

  it('draws to the screen when it is the last pass', () => {
    const renderer = new FakeRenderer();
    const pass = new GrainPass(GRAIN_INTENSITY);
    pass.renderToScreen = true;
    run(pass, renderer, new THREE.WebGLRenderTarget(4, 4));

    expect(renderer.draws).toEqual([null]);
  });

  it('adds to the finished picture, so it neither tone-maps nor encodes it a second time', () => {
    // jsdom cannot compile GLSL, so this reads the source: it runs after the output pass
    const { fragmentShader } = new GrainPass(GRAIN_INTENSITY).material;

    expect(fragmentShader).not.toContain('tonemapping_fragment');
    expect(fragmentShader).not.toContain('colorspace_fragment');
  });
});
