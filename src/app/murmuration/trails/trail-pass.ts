/**
 * motion trails, as a pass with a memory: each frame is blended with the last one it drew, then that blend is kept
 * for the next. it sits after the light shafts and before the bloom, in linear light, so a wake blooms and tone-maps
 * with everything else; it cannot come before the shafts, which read the depth the render pass left in the buffer.
 *
 * the fade is measured in seconds rather than frames, so a trail is the same length at 30fps and at 144fps. the
 * first frame after it is built or resized has no past to blend, so it passes the frame through untouched: the
 * still frame under reduced motion is exactly what the camera saw.
 */
import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { FULL_SCREEN_VERTEX } from '../light/god-rays/god-rays-shaders';
import { COPY_FRAGMENT, TRAIL_FRAGMENT } from './trail-shaders';

/** how much of the past survives deltaTime seconds of fading with this time constant: exp(-dt / τ).
 *  no time, or no clock, keeps nothing of a past that cannot be trusted; no time constant is no trail */
export function persistenceOver(deltaTime: number, seconds: number): number {
  if (!(deltaTime >= 0) || !(seconds > 0)) {
    return 0;
  }
  return Math.exp(-deltaTime / seconds);
}

/** half-float, because this sits before the tone mapping, where the sun runs well past 1.0 */
const createHistoryTarget = (): THREE.WebGLRenderTarget =>
  new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });

const createFullScreenMaterial = (
  fragmentShader: string,
  uniforms: Record<string, THREE.IUniform>
): THREE.ShaderMaterial =>
  new THREE.ShaderMaterial({
    uniforms,
    vertexShader: FULL_SCREEN_VERTEX,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
  });

export class TrailPass extends Pass {
  // the last blend and the next one, swapped every frame so the pass never reads the target it writes
  private past = createHistoryTarget();
  private next = createHistoryTarget();
  private primed = false;

  private readonly frame = { value: null as THREE.Texture | null };
  private readonly pastFrame = { value: null as THREE.Texture | null };
  private readonly blended = { value: null as THREE.Texture | null };
  public readonly persistence = { value: 0 };

  private readonly blendQuad = new FullScreenQuad(
    createFullScreenMaterial(TRAIL_FRAGMENT, {
      tDiffuse: this.frame,
      tPast: this.pastFrame,
      persistence: this.persistence,
    })
  );
  private readonly copyQuad = new FullScreenQuad(
    createFullScreenMaterial(COPY_FRAGMENT, { tDiffuse: this.blended })
  );

  constructor(private readonly seconds: number) {
    super();
    this.needsSwap = true;
  }

  public override render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
    deltaTime: number
  ): void {
    this.persistence.value = this.primed ? persistenceOver(deltaTime, this.seconds) : 0;
    this.frame.value = readBuffer.texture;
    this.pastFrame.value = this.past.texture;
    renderer.setRenderTarget(this.next);
    this.blendQuad.render(renderer);

    this.blended.value = this.next.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.copyQuad.render(renderer);

    [this.past, this.next] = [this.next, this.past];
    this.primed = true;
  }

  /** a resized frame no longer lines up with the one remembered, so the memory starts again */
  public override setSize(width: number, height: number): void {
    this.past.setSize(width, height);
    this.next.setSize(width, height);
    this.primed = false;
  }

  public override dispose(): void {
    this.past.dispose();
    this.next.dispose();
    // a FullScreenQuad disposes its geometry but not its material
    for (const quad of [this.blendQuad, this.copyQuad]) {
      quad.material.dispose();
      quad.dispose();
    }
  }
}
