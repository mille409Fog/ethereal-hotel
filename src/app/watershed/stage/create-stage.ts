/**
 * the stage before there is anything on it: a flat slab the size of the land, a sun and a sky light. it exists so
 * the renderer, the post-processing chain and the route can be proved end to end before the first shader of the
 * simulation is written; the land replaces the slab, and the sky and the light pass replace the two lights.
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
  const material = new THREE.MeshStandardMaterial({ color: PLACEHOLDER_COLOUR, roughness: 0.95 });
  const placeholder: Placeholder = new THREE.Mesh(geometry, material);
  scene.add(placeholder);

  return { scene, placeholder };
}

/** frees what the stage holds on the GPU; lights hold nothing */
export function disposeStage(stage: IStage): void {
  stage.placeholder.geometry.dispose();
  stage.placeholder.material.dispose();
}
