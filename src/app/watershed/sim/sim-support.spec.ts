import * as THREE from 'three';
import { PROBE_VALUE, supportsFloatTargets } from './sim-support';

/**
 * jsdom has no WebGL, so the renderer here is a recorder that can be told what the read-back returns. what a real
 * driver returns is the one thing this spec cannot say; `sim-support.ts` records that from a real browser.
 */
class FakeRenderer {
  public bound: THREE.WebGLRenderTarget | null = null;
  public readonly drawnInto: Array<THREE.WebGLRenderTarget | null> = [];
  public readonly targets: THREE.WebGLRenderTarget[] = [];
  public readBack: number | 'untouched' | 'throws' = PROBE_VALUE;

  public getRenderTarget(): THREE.WebGLRenderTarget | null {
    return this.bound;
  }

  public setRenderTarget(target: THREE.WebGLRenderTarget | null): void {
    this.bound = target;
  }

  public render(): void {
    this.drawnInto.push(this.bound);
  }

  public readRenderTargetPixels(
    target: THREE.WebGLRenderTarget,
    _x: number,
    _y: number,
    _width: number,
    _height: number,
    buffer: Float32Array
  ): void {
    this.targets.push(target);
    if (this.readBack === 'throws') {
      throw new Error('framebuffer incomplete');
    }
    if (this.readBack !== 'untouched') {
      buffer.fill(this.readBack);
    }
  }
}

const probe = (renderer: FakeRenderer): boolean =>
  supportsFloatTargets(renderer as unknown as THREE.WebGLRenderer);

describe('supportsFloatTargets', () => {
  it('is true when the value drawn comes back exactly', () => {
    expect(probe(new FakeRenderer())).toBe(true);
  });

  it('asks with a value that 32-bit float holds exactly and 16-bit cannot', () => {
    expect(Math.fround(PROBE_VALUE)).toBe(PROBE_VALUE);
    // a half-float has ten bits after its leading one; at 2^11..2^12 that is a step of two
    const halfFloatStep = 2 ** (Math.floor(Math.log2(PROBE_VALUE)) - 10);
    expect(PROBE_VALUE % halfFloatStep).not.toBe(0);
  });

  it('is false when a half-float target rounds the value', () => {
    const renderer = new FakeRenderer();
    renderer.readBack = 2400;

    expect(probe(renderer)).toBe(false);
  });

  it('is false when the read leaves the buffer untouched, as three does for an incomplete framebuffer', () => {
    const renderer = new FakeRenderer();
    renderer.readBack = 'untouched';

    expect(probe(renderer)).toBe(false);
  });

  it('is false, not an exception, when the driver throws', () => {
    const renderer = new FakeRenderer();
    renderer.readBack = 'throws';

    expect(probe(renderer)).toBe(false);
  });

  it('draws into a 32-bit float target sampled nearest, and reads that same target', () => {
    const renderer = new FakeRenderer();
    probe(renderer);
    const [target] = renderer.targets;

    expect(renderer.drawnInto).toEqual([target]);
    expect(target.texture.type).toBe(THREE.FloatType);
    expect(target.texture.format).toBe(THREE.RGBAFormat);
    expect(target.texture.minFilter).toBe(THREE.NearestFilter);
  });

  it('hands the renderer back bound to what it had, whether or not the probe passed', () => {
    const before = new THREE.WebGLRenderTarget(1, 1);
    for (const readBack of [PROBE_VALUE, 'throws'] as const) {
      const renderer = new FakeRenderer();
      renderer.bound = before;
      renderer.readBack = readBack;
      probe(renderer);

      expect(renderer.bound).toBe(before);
    }
    before.dispose();
  });

  it('frees the target it made', () => {
    const renderer = new FakeRenderer();
    const dispose = vi.spyOn(THREE.WebGLRenderTarget.prototype, 'dispose');
    probe(renderer);

    expect(dispose).toHaveBeenCalledTimes(1);
    dispose.mockRestore();
  });
});
