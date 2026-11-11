/**
 * runs the model on the GPU: a loop over `SIM_PASSES`, drawing one triangle a pass into 32-bit float targets.
 *
 * everything the simulation *is* lives in `sim-shaders.ts`, and `scripts/verify-watershed.mjs` holds that to the
 * reference model through a harness of its own. so this file has two duties and no more: walk the table in its
 * order, and never hand a pass, as something to read, the copy of a texture it is writing. a GPU reading the
 * target it is drawing into returns whatever it likes, quietly, and differently on each driver. so each state
 * texture is two targets, `front` and `back`; a pass reads fronts, writes one back, and the two swap.
 *
 * the state starts at zero, which is a land raised, dry and uncut: WebGL clears a new texture, and that is the
 * state `createFields` describes. only the land's fixed parts are uploaded.
 *
 * there is no `GPUComputationRenderer` here on purpose. it is in `three/examples`, it would join the chunk the
 * two spectacle routes share, and what it does is this file.
 */
import * as THREE from 'three';
import { IErosionConstants } from '../model/erosion-calibration';
import { ILand } from '../model/land';
import { packStrata, packTerrain } from './sim-layout';
import {
  SIM_CONSTANTS,
  SIM_PASSES,
  SIM_STATES,
  SIM_STRENGTH,
  SIM_TRIANGLE,
  SIM_VERTEX,
  SimSource,
  SimState,
} from './sim-shaders';

export interface ISimDriver {
  /** cells along one side of the land */
  readonly size: number;
  /** one step of the model, with rain at `strength` in [0, 1] */
  step(strength: number): void;
  /** the texture a state is currently held in. it changes with every step, so ask each frame; do not keep it */
  current(state: SimState): THREE.Texture;
  /** the land as raised: uplift and strata warp. never changes */
  readonly terrain: THREE.Texture;
  /** the beds: colour and erodibility. never changes */
  readonly strata: THREE.Texture;
  dispose(): void;
}

interface IPair {
  front: THREE.WebGLRenderTarget;
  back: THREE.WebGLRenderTarget;
}

/** a float texture read one texel at a time, exactly as given */
function fixedTexture(data: Float32Array, width: number, height: number): THREE.DataTexture {
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

function stateTarget(size: number): THREE.WebGLRenderTarget {
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

export function createSimDriver(
  renderer: THREE.WebGLRenderer,
  land: ILand,
  constants: IErosionConstants
): ISimDriver {
  const { size } = land.terrain;
  const terrain = fixedTexture(packTerrain(land.terrain), size, size);
  const strata = fixedTexture(packStrata(land.strata), land.strata.erodibility.length, 1);
  const pairs = new Map<SimState, IPair>(
    SIM_STATES.map((state) => [state, { front: stateTarget(size), back: stateTarget(size) }])
  );
  const pairOf = (state: SimState): IPair => pairs.get(state) as IPair;
  const textureOf = (source: SimSource): THREE.Texture => {
    if (source === 'terrain') {
      return terrain;
    }
    return source === 'strata' ? strata : pairOf(source).front.texture;
  };

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([...SIM_TRIANGLE], 3));
  const materials = SIM_PASSES.map((pass) => {
    const uniforms: Record<string, THREE.IUniform> = { [SIM_STRENGTH]: { value: 0 } };
    for (const key of SIM_CONSTANTS) {
      uniforms[key] = { value: constants[key] };
    }
    for (const source of pass.reads) {
      uniforms[source] = { value: null };
    }
    return new THREE.RawShaderMaterial({
      name: pass.name,
      glslVersion: THREE.GLSL3,
      vertexShader: SIM_VERTEX,
      fragmentShader: pass.fragment,
      uniforms,
      depthTest: false,
      depthWrite: false,
    });
  });
  const triangle = new THREE.Mesh(geometry, materials[0]);
  triangle.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(triangle);
  const camera = new THREE.Camera();

  return {
    size,
    terrain,
    strata,
    current: (state) => pairOf(state).front.texture,
    step(strength: number): void {
      const bound = renderer.getRenderTarget();
      SIM_PASSES.forEach((pass, index) => {
        const material = materials[index];
        material.uniforms[SIM_STRENGTH].value = strength;
        for (const source of pass.reads) {
          material.uniforms[source].value = textureOf(source);
        }
        const pair = pairOf(pass.writes);
        triangle.material = material;
        renderer.setRenderTarget(pair.back);
        renderer.render(scene, camera);
        [pair.front, pair.back] = [pair.back, pair.front];
      });
      renderer.setRenderTarget(bound);
    },
    dispose(): void {
      terrain.dispose();
      strata.dispose();
      geometry.dispose();
      for (const material of materials) {
        material.dispose();
      }
      for (const pair of pairs.values()) {
        pair.front.dispose();
        pair.back.dispose();
      }
    },
  };
}
