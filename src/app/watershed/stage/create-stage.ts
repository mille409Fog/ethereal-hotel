/**
 * the stage while there is no land on it: a flat slab the size of the land, a sun and a sky light.
 *
 * a storm hides the slab and stands its land in the scene (`sim/storm.ts`); the land is lit by its own shader and
 * takes nothing from these two lights. so the slab is what a visitor sees while the quality meter is still
 * measuring, and all a device that cannot simulate sees until a land is stored for it. the phase that stores one
 * is where the slab and both lights go.
 */
import * as THREE from 'three';
import {
  BACKDROP_COLOUR,
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
}

export function createStage(): IStage {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKDROP_COLOUR);

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

  return { scene, placeholder };
}

/** frees what the stage holds on the GPU; lights hold nothing, and a land in the scene is its storm's to free */
export function disposeStage(stage: IStage): void {
  stage.placeholder.geometry.dispose();
  stage.placeholder.material.dispose();
}
