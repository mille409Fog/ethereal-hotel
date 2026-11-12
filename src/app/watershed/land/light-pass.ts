/**
 * works the land's light out, and only when it has to.
 *
 * `LIGHT_FRAGMENT` in `land-shaders.ts` is the arithmetic. this file owns the one decision around it: when to
 * run it. the pass looks at the land some two hundred times for every cell, about as much as a whole step of the
 * simulation, and its answer changes only when the land or the sun does. so it keeps a flag. `landMoved` and
 * `sunTo` raise it, `update` runs the pass if it is raised and lowers it, and a frame in which the simulation
 * took no step, because it is paused, or over, or the tab was hidden, draws nothing here at all. the flag
 * starts raised: a land that has never been lit has changed since the last time it was.
 *
 * the target is ordinary eight-bit RGBA with linear filtering, which every device can render to and filter. see
 * the shader's header for why that is enough.
 */
import * as THREE from 'three';
import { IErosionConstants } from '../model/erosion-calibration';
import { ISimDriver } from '../sim/sim-driver';
import { SIM_TRIANGLE, SIM_VERTEX } from '../sim/sim-shaders';
import { ILandLook, LAND_LOOK, sunDirection } from './land-calibration';
import {
  LIGHT_COUNTS,
  LIGHT_EROSION,
  LIGHT_FLOATS,
  LIGHT_FRAGMENT,
  SUN_DIRECTION,
} from './land-shaders';

/** the pass's material, by name, so a recording renderer can tell its draws from the simulation's */
export const LIGHT_PASS = 'light';

export interface ILightPass {
  /** sun shadow in red, sky occlusion in green. one texture for the pass's whole life */
  readonly texture: THREE.Texture;
  /** toward the sun. the mesh reads this same vector, so the light and the shading cannot disagree about it */
  readonly sun: THREE.Vector3;
  /** true when the land or the sun has moved since the light was last worked out */
  readonly dirty: boolean;
  /** the simulation took a step */
  landMoved(): void;
  /** moves the sun; a sun put where it already is changes nothing */
  sunTo(x: number, y: number, z: number): void;
  /** works the light out if anything moved, and says whether it did */
  update(): boolean;
  dispose(): void;
}

export function createLightPass(
  renderer: THREE.WebGLRenderer,
  sim: ISimDriver,
  constants: IErosionConstants,
  look: ILandLook = LAND_LOOK
): ILightPass {
  const target = new THREE.WebGLRenderTarget(sim.size, sim.size, {
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
  });
  const sun = new THREE.Vector3(...sunDirection(look));

  const uniforms: Record<string, THREE.IUniform> = {
    land: { value: sim.current('land') },
    terrain: { value: sim.terrain },
    [SUN_DIRECTION]: { value: sun },
  };
  for (const key of LIGHT_EROSION) {
    uniforms[key] = { value: constants[key] };
  }
  for (const key of [...LIGHT_FLOATS, ...LIGHT_COUNTS]) {
    uniforms[key] = { value: look[key] };
  }
  const material = new THREE.RawShaderMaterial({
    name: LIGHT_PASS,
    glslVersion: THREE.GLSL3,
    vertexShader: SIM_VERTEX,
    fragmentShader: LIGHT_FRAGMENT,
    uniforms,
    depthTest: false,
    depthWrite: false,
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([...SIM_TRIANGLE], 3));
  const triangle = new THREE.Mesh(geometry, material);
  triangle.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(triangle);
  const camera = new THREE.Camera();
  let dirty = true;

  return {
    texture: target.texture,
    sun,
    get dirty(): boolean {
      return dirty;
    },
    landMoved(): void {
      dirty = true;
    },
    sunTo(x: number, y: number, z: number): void {
      if (sun.x !== x || sun.y !== y || sun.z !== z) {
        sun.set(x, y, z);
        dirty = true;
      }
    },
    update(): boolean {
      if (!dirty) {
        return false;
      }
      // the driver keeps two copies of the land and swaps them at every pass that writes it, so which one
      // a step ends in depends on how many passes do. asked for here, and never kept
      material.uniforms['land'].value = sim.current('land');
      const bound = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(bound);
      dirty = false;
      return true;
    },
    dispose(): void {
      target.dispose();
      material.dispose();
      geometry.dispose();
    },
  };
}
