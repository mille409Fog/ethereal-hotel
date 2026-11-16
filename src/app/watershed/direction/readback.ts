/**
 * the storm's two reads of the simulation's `land`, both through `readback-shaders.ts`'s one shader.
 *
 * - **the totals, once a second, without a stall.** the land is summed on the GPU down to one texel and that
 *   texel is read with three.js's asynchronous read, which fences the copy and hands it back a few frames later.
 *   a synchronous read waits for every draw queued before it, the whole storm's frame among them, which is a
 *   stalled frame every second. four floats come back: the cut, the regolith, the water and the suspended
 *   sediment, each summed over every cell.
 * - **the quarter copy, once, at the storm's end.** each texel is the mean of a four by four block, and it is read
 *   at once, synchronously. it is read one time in a visit, in the frame the last step ran, and the valley it is
 *   for is needed by the next one: waiting for it would put the camera's clock in the hands of a fence.
 *
 * both write to targets of their own, never to the driver's, which the driver swaps under them.
 */
import * as THREE from 'three';
import { ISimTextures } from '../sim/sim-driver';
import { SIM_TRIANGLE, SIM_VERTEX } from '../sim/sim-shaders';
import {
  BLOCK_MOST,
  BLOCK_SIDE,
  BLOCK_SOURCE,
  BLOCK_SUM_FRAGMENT,
  BLOCK_WEIGHT,
  QUARTER,
  reductionSizes,
} from './readback-shaders';

/** the shader's material, by name, so a recording renderer can tell its draws from the simulation's */
export const READBACK_PASS = 'readback';

export interface ILandReader {
  /** the side of the quarter copy, in texels */
  readonly quarterSize: number;
  /** the land summed over every cell: cut, regolith, water and suspended sediment, metres times cells */
  sums(): Promise<Float32Array>;
  /** the quarter copy, four channels a texel, row by row, read now */
  quarter(): Float32Array;
  dispose(): void;
}

function floatTarget(size: number): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(size, size, {
    type: THREE.FloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
  });
}

export function createLandReader(renderer: THREE.WebGLRenderer, sim: ISimTextures): ILandReader {
  const quarterSize = Math.max(1, Math.floor(sim.size / QUARTER));
  const quarterTarget = floatTarget(quarterSize);
  const sumTargets = reductionSizes(sim.size, BLOCK_MOST).map(floatTarget);

  const material = new THREE.RawShaderMaterial({
    name: READBACK_PASS,
    glslVersion: THREE.GLSL3,
    vertexShader: SIM_VERTEX,
    fragmentShader: BLOCK_SUM_FRAGMENT,
    uniforms: {
      [BLOCK_SOURCE]: { value: null },
      [BLOCK_SIDE]: { value: 1 },
      [BLOCK_WEIGHT]: { value: 1 },
    },
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

  const blockInto = (
    source: THREE.Texture,
    target: THREE.WebGLRenderTarget,
    side: number,
    weight: number
  ): void => {
    material.uniforms[BLOCK_SOURCE].value = source;
    material.uniforms[BLOCK_SIDE].value = side;
    material.uniforms[BLOCK_WEIGHT].value = weight;
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
  };

  return {
    quarterSize,
    sums(): Promise<Float32Array> {
      const bound = renderer.getRenderTarget();
      let source = sim.current('land');
      for (const target of sumTargets) {
        blockInto(source, target, BLOCK_MOST, 1);
        source = target.texture;
      }
      renderer.setRenderTarget(bound);
      // `reductionSizes` always ends at one texel, so the last target is the total
      const last = sumTargets[sumTargets.length - 1];
      return renderer.readRenderTargetPixelsAsync(
        last,
        0,
        0,
        1,
        1,
        new Float32Array(4)
      ) as Promise<Float32Array>;
    },
    quarter(): Float32Array {
      const bound = renderer.getRenderTarget();
      blockInto(sim.current('land'), quarterTarget, QUARTER, 1 / (QUARTER * QUARTER));
      renderer.setRenderTarget(bound);
      const read = new Float32Array(quarterSize * quarterSize * 4);
      renderer.readRenderTargetPixels(quarterTarget, 0, 0, quarterSize, quarterSize, read);
      return read;
    },
    dispose(): void {
      quarterTarget.dispose();
      for (const target of sumTargets) {
        target.dispose();
      }
      material.dispose();
      geometry.dispose();
    },
  };
}
