/**
 * the land as something in the scene: `land-geometry.ts`'s arrays and `land-shaders.ts`'s material, as a mesh.
 *
 * it reads the simulation's own textures and nothing else. there is no height in the geometry: the vertex shader
 * lifts each vertex to wherever the simulation has the ground this frame, so the mesh never has to be rebuilt and
 * never has to be told the land changed. the one thing it does have to be told is *where* the land is. the
 * driver keeps two copies and swaps them at every pass that writes the land, so which copy a step ends in depends
 * on how many passes do: today that is six, an even number, and a step ends where it began. `follow` asks once a
 * frame anyway, so merging two passes cannot leave the mesh drawing the land of half a step ago.
 *
 * the water's mesh (`water/water-mesh.ts`) shades the bed under it with this material's own uniforms, the same
 * objects and not copies, so what `follow` sets here it sets for the water too. the air's uniforms
 * (`air/air.ts`) are taken the same way, so the land is lit and fogged under the weather the sky is drawn in.
 *
 * the mesh is never culled. its vertices carry a kind where a height would be, so the box three.js would cull
 * against is a sheet at the origin, and the block is the whole picture anyway.
 */
import * as THREE from 'three';
import { AIR_FRAGMENT } from '../air/air-shaders';
import { IErosionConstants } from '../model/erosion-calibration';
import { ISimDriver } from '../sim/sim-driver';
import { ILandLook, LAND_LOOK } from './land-calibration';
import { landGeometry } from './land-geometry';
import {
  GREENING,
  LAND_COLOURS,
  LAND_EROSION,
  LAND_FLOATS,
  LAND_VERTEX,
  landFragment,
  RAIN,
  SUN_DIRECTION,
} from './land-shaders';
import { ILightPass } from './light-pass';

export const LAND_MESH = 'WatershedLand';

export interface ILandMesh {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.RawShaderMaterial>;
  /** points the mesh at the texture the land is in now, and tells it how hard it is raining, in [0, 1] */
  follow(rain: number): void;
  dispose(): void;
}

/** `air` is `IAir.uniforms` from `air/air.ts`: the air's own objects, which this material shares */
export function createLandMesh(
  sim: ISimDriver,
  light: ILightPass,
  constants: IErosionConstants,
  air: Readonly<Record<string, THREE.IUniform>>,
  look: ILandLook = LAND_LOOK
): ILandMesh {
  const { positions, indices } = landGeometry(sim.size, constants.extent);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));

  const uniforms: Record<string, THREE.IUniform> = {
    ...air,
    land: { value: sim.current('land') },
    terrain: { value: sim.terrain },
    strata: { value: sim.strata },
    light: { value: light.texture },
    [SUN_DIRECTION]: { value: light.sun },
    // nothing grows until the storm has passed; the phase that directs the storm raises this
    [GREENING]: { value: 0 },
    [RAIN]: { value: 0 },
  };
  for (const key of LAND_EROSION) {
    uniforms[key] = { value: constants[key] };
  }
  for (const key of LAND_FLOATS) {
    uniforms[key] = { value: look[key] };
  }
  for (const key of LAND_COLOURS) {
    uniforms[key] = { value: new THREE.Vector3(...look[key]) };
  }
  const material = new THREE.RawShaderMaterial({
    name: LAND_MESH,
    glslVersion: THREE.GLSL3,
    vertexShader: LAND_VERTEX,
    fragmentShader: landFragment(AIR_FRAGMENT),
    uniforms,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = LAND_MESH;
  mesh.frustumCulled = false;

  return {
    mesh,
    follow(rain: number): void {
      material.uniforms['land'].value = sim.current('land');
      material.uniforms[RAIN].value = rain;
    },
    dispose(): void {
      geometry.dispose();
      material.dispose();
    },
  };
}
