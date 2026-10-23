import * as THREE from 'three';
import { TRAIL_SECONDS } from './trail-calibration';
import { persistenceOver, TrailPass } from './trail-pass';

/**
 * a `FullScreenQuad` draws by calling `renderer.render(mesh, camera)`, so a renderer that records where it was
 * pointed, and what the pass's uniforms held at the time, follows the pass without WebGL. what the trails look
 * like is not visible here; that needs a browser.
 */
class FakeRenderer {
  public readonly draws: Array<THREE.WebGLRenderTarget | null> = [];
  private target: THREE.WebGLRenderTarget | null = null;
  public readonly setRenderTarget = vi.fn((target: THREE.WebGLRenderTarget | null) => {
    this.target = target;
  });
  public readonly render = vi.fn(() => {
    this.draws.push(this.target);
  });
}

const frame = (
  pass: TrailPass,
  renderer: FakeRenderer,
  write: THREE.WebGLRenderTarget,
  deltaTime: number
): void => {
  pass.render(
    renderer as unknown as THREE.WebGLRenderer,
    write,
    new THREE.WebGLRenderTarget(4, 4),
    deltaTime
  );
};

/** the shader's uniforms, read off the blend the pass draws first */
const blendUniforms = (pass: TrailPass): Record<string, THREE.IUniform> =>
  (pass as unknown as { blendQuad: { material: THREE.ShaderMaterial } }).blendQuad.material
    .uniforms;

describe('persistenceOver', () => {
  it('keeps all of the past when no time has passed', () => {
    expect(persistenceOver(0, TRAIL_SECONDS)).toBe(1);
  });

  it('keeps about a third after one time constant, and less the longer the frame', () => {
    expect(persistenceOver(TRAIL_SECONDS, TRAIL_SECONDS)).toBeCloseTo(Math.exp(-1));
    expect(persistenceOver(1 / 30, TRAIL_SECONDS)).toBeLessThan(
      persistenceOver(1 / 60, TRAIL_SECONDS)
    );
  });

  it('fades by the second, not the frame: two short frames leave what one long one does', () => {
    const twoShort = persistenceOver(1 / 120, TRAIL_SECONDS) ** 2;

    expect(twoShort).toBeCloseTo(persistenceOver(1 / 60, TRAIL_SECONDS), 10);
  });

  it('keeps nothing of a past it cannot time, and draws no trail without a time constant', () => {
    expect(persistenceOver(Number.NaN, TRAIL_SECONDS)).toBe(0);
    expect(persistenceOver(-1, TRAIL_SECONDS)).toBe(0);
    expect(persistenceOver(1 / 60, 0)).toBe(0);
  });
});

describe('TrailPass', () => {
  it('passes the first frame through untouched, since it has no past to blend', () => {
    const pass = new TrailPass(TRAIL_SECONDS);
    const renderer = new FakeRenderer();
    const persistences: number[] = [];
    renderer.render.mockImplementation(() => {
      persistences.push(pass.persistence.value);
    });

    frame(pass, renderer, new THREE.WebGLRenderTarget(4, 4), 1 / 60);

    expect(persistences[0]).toBe(0);
  });

  it('blends every later frame with the past, by the time since the last', () => {
    const pass = new TrailPass(TRAIL_SECONDS);
    const renderer = new FakeRenderer();
    const write = new THREE.WebGLRenderTarget(4, 4);

    frame(pass, renderer, write, 1 / 60);
    frame(pass, renderer, write, 1 / 60);

    expect(pass.persistence.value).toBeCloseTo(persistenceOver(1 / 60, TRAIL_SECONDS), 10);
  });

  it('never reads the target it writes: the past it blends is the blend it drew last frame', () => {
    const pass = new TrailPass(TRAIL_SECONDS);
    const renderer = new FakeRenderer();
    const write = new THREE.WebGLRenderTarget(4, 4);
    const uniforms = blendUniforms(pass);
    const pairs: Array<[THREE.Texture | null, THREE.WebGLRenderTarget | null]> = [];
    renderer.render.mockImplementation(() => {
      if (renderer.render.mock.calls.length % 2 === 1) {
        pairs.push([
          uniforms['tPast'].value as THREE.Texture,
          renderer.setRenderTarget.mock.lastCall?.[0] ?? null,
        ]);
      }
    });

    frame(pass, renderer, write, 1 / 60);
    frame(pass, renderer, write, 1 / 60);

    const [[, firstTarget], [secondPast, secondTarget]] = pairs;
    expect(secondPast).toBe(firstTarget?.texture);
    expect(secondTarget).not.toBe(firstTarget);
  });

  it('hands the next pass its frame, or the screen when it is last', () => {
    const write = new THREE.WebGLRenderTarget(4, 4);
    const inChain = new FakeRenderer();
    const last = new FakeRenderer();
    const pass = new TrailPass(TRAIL_SECONDS);
    const lastPass = new TrailPass(TRAIL_SECONDS);
    lastPass.renderToScreen = true;

    frame(pass, inChain, write, 1 / 60);
    frame(lastPass, last, write, 1 / 60);

    expect(inChain.draws.at(-1)).toBe(write);
    expect(last.draws.at(-1)).toBeNull();
  });

  it('forgets its past when the frame is resized, which no longer lines up with it', () => {
    const pass = new TrailPass(TRAIL_SECONDS);
    const renderer = new FakeRenderer();
    const write = new THREE.WebGLRenderTarget(4, 4);
    frame(pass, renderer, write, 1 / 60);

    pass.setSize(8, 6);
    frame(pass, renderer, write, 1 / 60);

    expect(pass.persistence.value).toBe(0);
  });

  it('releases both of its memories and both of its materials', () => {
    const pass = new TrailPass(TRAIL_SECONDS);
    const internals = pass as unknown as {
      past: THREE.WebGLRenderTarget;
      next: THREE.WebGLRenderTarget;
      blendQuad: { material: THREE.Material };
      copyQuad: { material: THREE.Material };
    };
    const disposals = [
      vi.spyOn(internals.past, 'dispose'),
      vi.spyOn(internals.next, 'dispose'),
      vi.spyOn(internals.blendQuad.material, 'dispose'),
      vi.spyOn(internals.copyQuad.material, 'dispose'),
    ];

    pass.dispose();

    for (const disposal of disposals) {
      expect(disposal).toHaveBeenCalledTimes(1);
    }
  });

  it('keeps the darker of past and present, judged by luma, so a silhouette leaves a wake and the sun none', () => {
    // jsdom cannot compile GLSL, so this reads the source
    const { fragmentShader } = (
      new TrailPass(TRAIL_SECONDS) as unknown as { blendQuad: { material: THREE.ShaderMaterial } }
    ).blendQuad.material;

    expect(fragmentShader).toContain('luma(faded) < luma(now.rgb)');
    expect(fragmentShader).not.toContain('max(');
  });
});
