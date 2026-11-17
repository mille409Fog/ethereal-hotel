import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { drawWithSamples } from './composer-samples';

const composerOf = (): EffectComposer => {
  const renderer = {
    getPixelRatio: (): number => 1,
    getSize: (target: THREE.Vector2): THREE.Vector2 => target.set(4, 3),
  };
  return new EffectComposer(
    renderer as unknown as THREE.WebGLRenderer,
    new THREE.WebGLRenderTarget(4, 3, { depthTexture: new THREE.DepthTexture(4, 3) })
  );
};

describe('drawing with samples', () => {
  it('gives both of the buffers the scene can land in the samples, and releases each to be made again', () => {
    const composer = composerOf();
    const first = vi.spyOn(composer.renderTarget1, 'dispose');
    const second = vi.spyOn(composer.renderTarget2, 'dispose');

    drawWithSamples(composer, 4);

    expect(composer.renderTarget1.samples).toBe(4);
    expect(composer.renderTarget2.samples).toBe(4);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('releases nothing when the samples are what they were, as on a step down that keeps them', () => {
    const composer = composerOf();
    drawWithSamples(composer, 4);
    const first = vi.spyOn(composer.renderTarget1, 'dispose');

    drawWithSamples(composer, 4);

    expect(first).not.toHaveBeenCalled();
  });
});
