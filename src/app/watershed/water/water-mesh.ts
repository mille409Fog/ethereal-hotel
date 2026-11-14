/**
 * the water as something in the scene: the land's ground vertices and `water-shaders.ts`'s material, as a mesh.
 *
 * like the land's mesh it has no height in its geometry and is never rebuilt: the vertex shader lifts each vertex
 * to the water's level this frame. where there is no water every fragment is thrown away, so on a dry land this
 * mesh is in the scene and draws nothing.
 *
 * - **the bed is shaded with the land's own uniforms.** the fragment shader calls the land's `ground()`, and
 *   the uniforms that function reads are taken from the land's material as the same objects, not as copies.
 *   so the land texture `ILandMesh.follow` points at, the sun, the rain and every colour are one value read by
 *   two materials, and the bed under the water cannot be lit differently from the bank beside it. the air's
 *   uniforms are among them, since the land's material holds the air's own.
 * - **it is opaque, and drawn after the land.** the shader fades the water in from the land's exact colour, so
 *   nothing is blended. `renderOrder` puts it after the land so that the sheet under a bank, and every dry
 *   triangle hidden behind a ridge, fails the depth test before its fragment shader runs.
 * - **it is drawn a little nearer than it is.** see `offsetFactor` in the calibration.
 *
 * `follow` is told the time, and that is the only thing here that moves when the simulation does not: a river
 * the storm has left behind still runs.
 */
import * as THREE from 'three';
import { AIR_FRAGMENT } from '../air/air-shaders';
import { IErosionConstants } from '../model/erosion-calibration';
import { surfaceGeometry } from '../land/land-geometry';
import { ILandMesh } from '../land/land-mesh';
import { GROUND_VERTEX, groundFragment } from '../land/land-shaders';
import { ISimDriver } from '../sim/sim-driver';
import { IWaterLook, ripplePhase, WATER_LOOK } from './water-calibration';
import { RIPPLE, WATER_COLOURS, WATER_FLOATS, waterFragment, waterVertex } from './water-shaders';

export const WATER_MESH = 'WatershedWater';

export interface IWaterMesh {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.RawShaderMaterial>;
  /** points the mesh at the texture the flow is in now, and carries the ripples to where they are at `seconds` */
  follow(seconds: number): void;
  dispose(): void;
}

export function createWaterMesh(
  sim: ISimDriver,
  land: ILandMesh,
  constants: IErosionConstants,
  look: IWaterLook = WATER_LOOK
): IWaterMesh {
  const { positions, indices } = surfaceGeometry(sim.size, constants.extent);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));

  const uniforms: Record<string, THREE.IUniform> = {
    // the same objects the land's material holds
    ...land.mesh.material.uniforms,
    flow: { value: sim.current('flow') },
    [RIPPLE]: { value: 0 },
  };
  for (const key of WATER_FLOATS) {
    uniforms[key] = { value: look[key] };
  }
  for (const key of WATER_COLOURS) {
    uniforms[key] = { value: new THREE.Vector3(...look[key]) };
  }
  const material = new THREE.RawShaderMaterial({
    name: WATER_MESH,
    glslVersion: THREE.GLSL3,
    vertexShader: waterVertex(GROUND_VERTEX),
    fragmentShader: waterFragment(groundFragment(AIR_FRAGMENT)),
    uniforms,
    polygonOffset: true,
    polygonOffsetFactor: look.offsetFactor,
    polygonOffsetUnits: look.offsetUnits,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = WATER_MESH;
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;

  return {
    mesh,
    follow(seconds: number): void {
      material.uniforms['flow'].value = sim.current('flow');
      material.uniforms[RIPPLE].value = ripplePhase(seconds, look);
    },
    dispose(): void {
      geometry.dispose();
      material.dispose();
    },
  };
}
