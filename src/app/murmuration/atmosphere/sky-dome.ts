/** creates the initial sky dome */
import * as THREE from 'three';
import * as CALIBRATION from '../batoid/batoid-calibration';
import {
  SKY_DOME_HEIGHT_SEGMENTS,
  SKY_DOME_RADIUS,
  SKY_DOME_WIDTH_SEGMENTS,
} from './atmospheric-calibration';
import { SKY_DOME_FRAGMENT, SKY_DOME_VERTEX } from './sky-dome-shaders';

export function createSkyDome(
  sunDirection: THREE.Vector3
): THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> {
  return new THREE.Mesh(
    new THREE.SphereGeometry(SKY_DOME_RADIUS, SKY_DOME_WIDTH_SEGMENTS, SKY_DOME_HEIGHT_SEGMENTS),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        horizon: { value: new THREE.Color(CALIBRATION.PALETTE.sky) },
        zenith: { value: new THREE.Color(CALIBRATION.PALETTE.zenith) },
        sunDirection: { value: sunDirection },
      },
      vertexShader: SKY_DOME_VERTEX,
      fragmentShader: SKY_DOME_FRAGMENT,
    })
  );
}
