import * as THREE from 'three';
import * as CALIBRATION from '../batoid/batoid-calibration';
import { createBatoidGeometry } from '../batoid/batoid-geometry';
import { IFlight } from './cauldron-flight';
/** the clock each cauldron's wings beat to, kept beside its material rather than in userData so it stays typed */
const wingClocks = new WeakMap<THREE.Material, THREE.IUniform<number>>();

/** the wingbeat, spliced in after three has read the vertex and before it is transformed, so it happens in the
 *  bat's own frame: a wingtip rises and falls along local y by the square of its distance from the body, so the
 *  shoulders hold still and the tips do the travelling. each bat's phase is hashed from its instance id, or the
 *  whole cauldron would flap in unison like a drill team. flat shading takes its normals from screen-space
 *  derivatives, so the bent facets light correctly without any normal being rewritten here */
export function wingBeatChunk(halfSpan: number): string {
  return `#include <begin_vertex>
  float wingPhase = fract(sin(float(gl_InstanceID) * 12.9898) * 43758.5453) * ${(2 * Math.PI).toFixed(6)};
  float wingReach = abs(transformed.x) / ${halfSpan.toFixed(6)};
  transformed.y += ${CALIBRATION.WING_BEAT.tipLift.toFixed(6)} * wingReach * wingReach
    * sin(uWingSeconds * ${(2 * Math.PI * CALIBRATION.WING_BEAT.hertz).toFixed(6)} + wingPhase);`;
}

/** creates a new cauldron of bats in the form of an instanced mesh , no positioning or posing */
export function createCauldron(): THREE.InstancedMesh<
  THREE.BufferGeometry,
  THREE.MeshStandardMaterial
> {
  const geometry = createBatoidGeometry();
  geometry.computeBoundingBox();
  const halfSpan = geometry.boundingBox?.max.x ?? 1;
  const material = new THREE.MeshStandardMaterial({
    color: CALIBRATION.PALETTE.batoid,
    flatShading: true,
  });
  const clock: THREE.IUniform<number> = { value: 0 };
  wingClocks.set(material, clock);
  material.onBeforeCompile = (shader): void => {
    shader.uniforms['uWingSeconds'] = clock;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'uniform float uWingSeconds;\nvoid main() {')
      .replace('#include <begin_vertex>', wingBeatChunk(halfSpan));
  };
  const bats = new THREE.InstancedMesh(geometry, material, CALIBRATION.CAULDRON.count);
  return bats;
}

/** sets the cauldron's wings to the given second of their beat; the beat itself is drawn on the GPU */
export function beatWings(
  bats: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>,
  seconds: number
): void {
  const clock = wingClocks.get(bats.material);
  if (clock) {
    clock.value = seconds;
  }
}

/** this is our transposition function, each bat is teleported from one location to another depending upon their velocity.
 *  rolls, when given, bank bat i by rolls[i] about its own heading; without them every bat flies wings level */
export function poseCauldron(
  flight: IFlight,
  bats: THREE.InstancedMesh,
  pose: THREE.Object3D,
  rolls?: Float32Array
): void {
  pose.rotation.order = 'YXZ'; // this maintains wing axis, and applies the roll first, about the bat's own nose
  for (let i = 0; i < bats.count; i++) {
    const offset = i * 3;
    pose.position.fromArray(flight.positions, offset);
    pose.rotation.y = Math.atan2(flight.velocities[offset], flight.velocities[offset + 2]);
    pose.rotation.x = -Math.atan2(
      flight.velocities[offset + 1],
      Math.hypot(flight.velocities[offset], flight.velocities[offset + 2])
    );
    pose.rotation.z = rolls?.[i] ?? 0;
    pose.scale.setScalar(CALIBRATION.CAULDRON.batScale);
    pose.updateMatrix();
    bats.setMatrixAt(i, pose.matrix);
  }
  bats.instanceMatrix.needsUpdate = true;
}
