/** an auxiliary file used to create the initial scene without cluttering the primary murmuration file */
import * as THREE from 'three';
import { createFog } from '../atmosphere/fog';
import { createHemisphereLight, createKeyLight, createRimLight } from '../light/light-initiation';

/** adds lights and fog */
export function initializeScene(scene: THREE.Scene): void {
  scene.add(createHemisphereLight());
  scene.add(createKeyLight());
  scene.add(createRimLight());
  scene.fog = createFog();
}
