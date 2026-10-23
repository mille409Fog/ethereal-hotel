/** assembles the post-processing chain the composer draws the scene through */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { VignetteShader } from 'three/examples/jsm/shaders/VignetteShader.js';
import { GRADE } from '../grade/grade-calibration';
import { GradePass } from '../grade/grade-pass/grade-pass';
import { GRAIN_INTENSITY } from '../grain/grain-calibration';
import { GrainPass } from '../grain/grain-pass/grain-pass';
import { GodRaysPass } from '../light/god-rays/god-rays-pass';
import { GOD_RAYS, VIGNETTE_DARKNESS, VIGNETTE_OFFSET } from '../light/light-calibration';

/** adds every pass to the composer, in the order they draw */
export function orchestrateComposerPasses(
  composer: EffectComposer,
  bloomPass: UnrealBloomPass,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  sunDirection: THREE.Vector3
): void {
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new GodRaysPass(camera, sunDirection, GOD_RAYS));
  composer.addPass(bloomPass);
  composer.addPass(generateVignettePass());
  composer.addPass(new OutputPass());
  composer.addPass(new GradePass(GRADE));
  composer.addPass(new GrainPass(GRAIN_INTENSITY));
}

/** frees every pass orchestrateComposerPasses added, then the composer's own render targets */
export function disposeComposer(composer: EffectComposer): void {
  for (const pass of composer.passes) {
    pass.dispose();
  }
  composer.dispose();
}

function generateVignettePass(): ShaderPass {
  const vignettePass = new ShaderPass(VignetteShader);
  vignettePass.uniforms['offset'].value = VIGNETTE_OFFSET;
  vignettePass.uniforms['darkness'].value = VIGNETTE_DARKNESS;
  return vignettePass;
}
