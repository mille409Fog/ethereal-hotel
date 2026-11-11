/**
 * the land drawn as a map on the stage's flat slab: relief shaded in grey, standing water in blue.
 *
 * a stand-in, and meant to look like one. it exists so the simulation can be watched before the land has a mesh,
 * a material or a sky; the phase that builds the land replaces the slab and this file with it. what it must
 * already do, because everything after it must, is draw from the simulation's own textures and from nothing
 * else: the grey is the model's surface, and the blue is where the model has water.
 *
 * it writes linear colour and no more. the scene is drawn into the composer's buffer and the output pass does the
 * tone mapping and the encoding, so including either here would finish the picture twice.
 */
import * as THREE from 'three';
import { IErosionConstants } from '../model/erosion-calibration';
import { ISimDriver } from '../sim/sim-driver';

export type MapMaterial = THREE.ShaderMaterial;

/** water this deep or deeper is drawn fully blue, metres */
const DEEP_WATER = 0.5;

const MAP_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const MAP_FRAGMENT = /* glsl */ `
  uniform sampler2D land;
  uniform sampler2D terrain;
  uniform float relief, baseLevel, cell, texel, deepWater;
  varying vec2 vUv;

  // uplift less what was cut, plus what lies on it
  float surfaceAt(vec2 at) {
    vec4 state = texture2D(land, at);
    return texture2D(terrain, at).r - state.r + state.g;
  }

  void main() {
    float height = surfaceAt(vUv);
    float slopeX =
      (surfaceAt(vUv + vec2(texel, 0.0)) - surfaceAt(vUv - vec2(texel, 0.0))) / (2.0 * cell);
    float slopeY =
      (surfaceAt(vUv + vec2(0.0, texel)) - surfaceAt(vUv - vec2(0.0, texel))) / (2.0 * cell);
    vec3 normal = normalize(vec3(-slopeX, 1.0, -slopeY));
    float lit = 0.3 + 0.7 * max(0.0, dot(normal, normalize(vec3(-0.6, 0.55, -0.6))));
    float grey = lit * (0.2 + 0.6 * clamp((height - baseLevel) / relief, 0.0, 1.0));
    float wet = clamp(texture2D(land, vUv).b / deepWater, 0.0, 1.0);
    gl_FragColor = vec4(mix(vec3(grey), vec3(0.04, 0.16, 0.42), wet), 1.0);
  }`;

/** the map of a driver's land */
export function createMapMaterial(driver: ISimDriver, constants: IErosionConstants): MapMaterial {
  return new THREE.ShaderMaterial({
    name: 'WatershedMap',
    vertexShader: MAP_VERTEX,
    fragmentShader: MAP_FRAGMENT,
    uniforms: {
      land: { value: driver.current('land') },
      terrain: { value: driver.terrain },
      relief: { value: constants.relief },
      baseLevel: { value: constants.baseLevel },
      cell: { value: constants.extent / driver.size },
      texel: { value: 1 / driver.size },
      deepWater: { value: DEEP_WATER },
    },
  });
}

/** points the map at the texture the land is in now; the driver swaps it every step */
export function followLand(material: MapMaterial, driver: ISimDriver): void {
  material.uniforms['land'].value = driver.current('land');
}
