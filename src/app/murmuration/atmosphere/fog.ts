/** creates the fog used in the atmosphere */
import * as THREE from 'three';
import * as CALIBRATION from '../batoid/batoid-calibration';

/** creates the initial fog conditions */
export function createFog(): THREE.Fog {
  return new THREE.Fog(CALIBRATION.PALETTE.sky, 2, 5);
}
