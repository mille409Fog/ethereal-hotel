/**
 * screen-space light shafts: masks the sun with the frame's own depth, blurs the mask toward the sun, and adds it
 * back over the frame. it sits after the render pass and before the bloom, so the shafts bloom and tone-map with
 * everything else.
 *
 * it reads `readBuffer.depthTexture`, which exists only because `MURMURATION_COMPOSER` builds the composer on a
 * target with one. without it the mask samples as all-occluded and the pass adds nothing, rather than failing.
 */
import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { IGodRaysCalibration } from '../light-calibration';
import {
  BLUR_FRAGMENT,
  COMPOSITE_FRAGMENT,
  FULL_SCREEN_VERTEX,
  MASK_FRAGMENT,
} from './god-rays-shaders';
import { sunOnScreen } from './sun-on-screen';

/** half-float, because the shafts run past 1.0 before the bloom and the tone mapping see them */
const createLowResolutionTarget = (): THREE.WebGLRenderTarget =>
  new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });

const createFullScreenMaterial = (
  fragmentShader: string,
  uniforms: Record<string, THREE.IUniform>,
  defines: Record<string, number> = {}
): THREE.ShaderMaterial =>
  new THREE.ShaderMaterial({
    uniforms,
    defines,
    vertexShader: FULL_SCREEN_VERTEX,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
  });

export class GodRaysPass extends Pass {
  private readonly maskTarget = createLowResolutionTarget();
  private readonly raysTarget = createLowResolutionTarget();

  // the uniforms the pass changes after construction, held directly rather than looked up by name every frame
  private readonly sunUv = new THREE.Vector2(0.5, 0.5);
  private readonly aspect = { value: 1 };
  private readonly depth = { value: null as THREE.Texture | null };
  private readonly cameraNear = { value: 0 };
  private readonly cameraFar = { value: 1 };
  private readonly frame = { value: null as THREE.Texture | null };
  private readonly visibility = { value: 0 };

  private readonly maskQuad: FullScreenQuad;
  private readonly blurQuad: FullScreenQuad;
  private readonly compositeQuad: FullScreenQuad;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly sunDirection: THREE.Vector3,
    private readonly calibration: IGodRaysCalibration
  ) {
    super();
    this.needsSwap = true;

    // the mask and the blur share one Vector2, so both always aim at the same sun
    this.maskQuad = new FullScreenQuad(
      createFullScreenMaterial(MASK_FRAGMENT, {
        tDepth: this.depth,
        sunUv: { value: this.sunUv },
        aspect: this.aspect,
        sunRadius: { value: calibration.sunRadius },
        sunSoftness: { value: calibration.sunSoftness },
        cameraNear: this.cameraNear,
        cameraFar: this.cameraFar,
        occlusionNear: { value: calibration.occlusionNear },
        occlusionFar: { value: calibration.occlusionFar },
      })
    );
    this.blurQuad = new FullScreenQuad(
      createFullScreenMaterial(
        BLUR_FRAGMENT,
        {
          tMask: { value: this.maskTarget.texture },
          sunUv: { value: this.sunUv },
          density: { value: calibration.density },
          decay: { value: calibration.decay },
          weight: { value: calibration.weight },
          exposure: { value: calibration.exposure },
        },
        { SAMPLES: calibration.samples }
      )
    );
    this.compositeQuad = new FullScreenQuad(
      createFullScreenMaterial(COMPOSITE_FRAGMENT, {
        tDiffuse: this.frame,
        tRays: { value: this.raysTarget.texture },
        colour: { value: new THREE.Color(calibration.colour) },
        visibility: this.visibility,
      })
    );
  }

  public override render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget
  ): void {
    this.visibility.value = sunOnScreen(
      this.sunDirection,
      this.camera,
      this.calibration,
      this.sunUv
    );

    // with no sun in view the old shafts are multiplied by zero, so neither low-resolution step is worth drawing
    if (this.visibility.value > 0) {
      this.depth.value = readBuffer.depthTexture;
      this.cameraNear.value = this.camera.near;
      this.cameraFar.value = this.camera.far;
      renderer.setRenderTarget(this.maskTarget);
      this.maskQuad.render(renderer);
      renderer.setRenderTarget(this.raysTarget);
      this.blurQuad.render(renderer);
    }

    this.frame.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.compositeQuad.render(renderer);
  }

  public override setSize(width: number, height: number): void {
    const scaledWidth = Math.max(1, Math.round(width * this.calibration.maskScale));
    const scaledHeight = Math.max(1, Math.round(height * this.calibration.maskScale));
    this.maskTarget.setSize(scaledWidth, scaledHeight);
    this.raysTarget.setSize(scaledWidth, scaledHeight);
    this.aspect.value = height > 0 ? width / height : 1;
  }

  public override dispose(): void {
    this.maskTarget.dispose();
    this.raysTarget.dispose();
    // a FullScreenQuad disposes its geometry but not its material
    for (const quad of [this.maskQuad, this.blurQuad, this.compositeQuad]) {
      quad.material.dispose();
      quad.dispose();
    }
  }
}
