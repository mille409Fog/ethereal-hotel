/**  creates the initial light sources used by the canvas and the scene */
import * as THREE from 'three';
import * as CALIBRATION from '../batoid/batoid-calibration';
import { KEY_LIGHT_POSITION } from './light-calibration';
/** creates the light used to fill the atmosphere via a hemisphere light */
export function createHemisphereLight(): THREE.HemisphereLight {
  return new THREE.HemisphereLight(CALIBRATION.PALETTE.fill, CALIBRATION.PALETTE.ground, 0.3);
}

/** creates the initial rim light, used to provide additional ambience */
export function createRimLight(): THREE.DirectionalLight {
  const rimLight = new THREE.DirectionalLight(CALIBRATION.PALETTE.sun, 1);
  rimLight.position.set(3, 1, -3);
  return rimLight;
}

/** creates the key light, uses a constant due to conceptual linkage with the sky-dome */
export function createKeyLight(): THREE.DirectionalLight {
  const key = new THREE.DirectionalLight(CALIBRATION.PALETTE.sun, 4);
  key.position.set(...KEY_LIGHT_POSITION);
  return key;
}

/** creates the initial fog conditions */
export function createFog(): THREE.Fog {
  return new THREE.Fog(CALIBRATION.PALETTE.sky, 2, 5);
}
