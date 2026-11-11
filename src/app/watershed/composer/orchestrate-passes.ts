/**
 * the chain every frame is drawn through: the scene in linear HDR, bloom on what exceeds white, then tone
 * mapping and encoding, then the grade and the grain on the finished picture.
 *
 * the grade and the grain are murmuration's passes, imported and not copied; only their numbers are this piece's.
 *
 * there is no dither pass, and that is a decision. the plan asked for one because the sky and the fog are smooth
 * gradients that band at eight bits. the grain already is one: it adds triangular noise to display values as the
 * last thing that happens to the frame, which is what a dither is, and `grain-shader.ts` says so. a second pass
 * doing the same job would cost a full-screen draw to add noise to noise. if the grain is ever turned off, the
 * banding comes back and this is where to look.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GradePass } from '../../murmuration/grade/grade-pass/grade-pass';
import { GrainPass } from '../../murmuration/grain/grain-pass/grain-pass';
import {
  BLOOM_RADIUS,
  BLOOM_STRENGTH,
  BLOOM_THRESHOLD,
  GRADE,
  GRAIN_INTENSITY,
} from './composer-calibration';

/** adds every pass to the composer, in the order they draw */
export function orchestratePasses(
  composer: EffectComposer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  resolution: THREE.Vector2
): void {
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(resolution, BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD));
  composer.addPass(new OutputPass());
  composer.addPass(new GradePass(GRADE));
  composer.addPass(new GrainPass(GRAIN_INTENSITY));
}
