/**
 * the grain is a shader pass that reseeds itself every time it draws, because grain that holds still is not
 * grain but dirt on the lens. it counts frames drawn rather than reading the clock, so a still frame under
 * reduced motion is simply the first pattern, and the pattern never depends on how fast the browser paints.
 */
import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GRAIN_SEED_STEP } from './grain-calibration';
import { GrainShader } from './grain-shader';

export class GrainPass extends ShaderPass {
  constructor(intensity: number) {
    super(GrainShader);
    this.uniforms['intensity'].value = intensity;
  }

  public override render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
    deltaTime: number,
    maskActive: boolean
  ): void {
    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
    // advanced after drawing, so the first frame is seed 0; kept in 0..1 so the shader's offset never loses precision
    const seed = this.uniforms['seed'] as { value: number };
    seed.value = (seed.value + GRAIN_SEED_STEP) % 1;
  }
}
