/**  creates the initial light sources used by the canvas and the scene */
import * as THREE from 'three';
import * as CALIBRATION from '../batoid/batoid-calibration';
import {
  HEMISPHERE_LIGHT_INTENSITY,
  KEY_LIGHT_INTENSITY,
  KEY_LIGHT_POSITION,
  RIM_LIGHT_INTENSITY,
  RIM_LIGHT_POSITION,
} from './light-calibration';
/** creates the light used to fill the atmosphere via a hemisphere light */
export function createHemisphereLight(): THREE.HemisphereLight {
  return new THREE.HemisphereLight(
    CALIBRATION.PALETTE.fill,
    CALIBRATION.PALETTE.ground,
    HEMISPHERE_LIGHT_INTENSITY
  );
}

/** creates the initial rim light, used to provide additional ambience */
export function createRimLight(): THREE.DirectionalLight {
  const rimLight = new THREE.DirectionalLight(CALIBRATION.PALETTE.sun, RIM_LIGHT_INTENSITY);
  rimLight.position.set(...RIM_LIGHT_POSITION);
  return rimLight;
}

/** creates the key light, uses a constant due to conceptual linkage with the sky-dome */
export function createKeyLight(): THREE.DirectionalLight {
  const key = new THREE.DirectionalLight(CALIBRATION.PALETTE.sun, KEY_LIGHT_INTENSITY);
  key.position.set(...KEY_LIGHT_POSITION);
  return key;
}
