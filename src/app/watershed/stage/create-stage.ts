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

/** the slab. its material is whatever is being shown on it: plain rock, or the map of a land */
export type Placeholder = THREE.Mesh<THREE.PlaneGeometry, THREE.Material>;

export interface IStage {
  readonly scene: THREE.Scene;
  readonly placeholder: Placeholder;
  /** the slab's own material, kept so it can be put back and so it is freed whatever the slab is wearing */
  readonly plain: THREE.MeshStandardMaterial;
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
  const plain = new THREE.MeshStandardMaterial({ color: PLACEHOLDER_COLOUR, roughness: 0.95 });
  const placeholder: Placeholder = new THREE.Mesh<THREE.PlaneGeometry, THREE.Material>(
    geometry,
    plain
  );
  scene.add(placeholder);

  return { scene, placeholder, plain };
}

/** frees what the stage holds on the GPU; lights hold nothing, and a map on the slab is its storm's to free */
export function disposeStage(stage: IStage): void {
  stage.placeholder.geometry.dispose();
  stage.plain.dispose();
}
