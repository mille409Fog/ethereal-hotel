/** creates the bloom used in the atmosphere */
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { BLOOM_RADIUS, BLOOM_STRENGTH, BLOOM_THRESHOLD } from './atmospheric-calibration';

/** creates the bloom pass at the canvas's resolution */
export function createBloomPass(canvasResolution: THREE.Vector2): UnrealBloomPass {
  return new UnrealBloomPass(canvasResolution, BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD);
}
