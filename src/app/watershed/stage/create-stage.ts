/**
 * the stage: the air, and while there is no land on it a flat slab the size of the land, a sun and a sky light.
 *
 * the air (`air/air.ts`) is the sky behind the block and the deck of cloud below its rim. it is the stage's
 * from the first frame, so the sky is there while the quality meter measures and before any land is.
 *
 * a storm hides the slab and stands its land in the scene (`sim/storm.ts`); the land is lit by its own shader and
 * takes nothing from the slab's two lights. so the slab is what a visitor sees while the quality meter is still
 * measuring, and all a device that cannot simulate sees until a land is stored for it. the phase that stores one
 * is where the slab and both lights go.
 */
import * as THREE from 'three';
import { createAir, IAir } from '../air/air';
import {
  GROUND_LIGHT_COLOUR,
  LAND_EXTENT,
  PLACEHOLDER_COLOUR,
  SKY_LIGHT_COLOUR,
  SKY_LIGHT_INTENSITY,
  SUN_COLOUR,
  SUN_INTENSITY,
  SUN_POSITION,
} from './stage-calibration';

/** the slab: plain rock, hidden while a land stands in its place */
export type Placeholder = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;

export interface IStage {
  readonly scene: THREE.Scene;
  readonly placeholder: Placeholder;
  readonly air: IAir;
}

export function createStage(): IStage {
  const scene = new THREE.Scene();

  const sun = new THREE.DirectionalLight(SUN_COLOUR, SUN_INTENSITY);
  sun.position.set(...SUN_POSITION);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(SKY_LIGHT_COLOUR, GROUND_LIGHT_COLOUR, SKY_LIGHT_INTENSITY));

  const geometry = new THREE.PlaneGeometry(LAND_EXTENT, LAND_EXTENT);
  // a plane is built facing +z; the land lies in x and z with y up
  geometry.rotateX(-Math.PI / 2);
  const placeholder: Placeholder = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: PLACEHOLDER_COLOUR, roughness: 0.95 })
  );
  scene.add(placeholder);

  const air = createAir();
  scene.add(air.deck, air.dome);

  return { scene, placeholder, air };
}

/** frees what the stage holds on the GPU; lights hold nothing, and a land in the scene is its storm's to free */
export function disposeStage(stage: IStage): void {
  stage.placeholder.geometry.dispose();
  stage.placeholder.material.dispose();
  stage.air.dispose();
}
