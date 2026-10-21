import * as THREE from 'three';
import * as CALIBRATION from '../batoid/batoid-calibration';
import { createBatoidGeometry } from '../batoid/batoid-geometry';
import { IFlight } from './cauldron-flight';
/** creates a new cauldron of bats in the form of an instanced mesh , no positioning or posing */
export function createCauldron(): THREE.InstancedMesh<
  THREE.BufferGeometry,
  THREE.MeshStandardMaterial
> {
  const material = new THREE.MeshStandardMaterial({
    color: CALIBRATION.PALETTE.batoid,
    flatShading: true,
  });
  const bats = new THREE.InstancedMesh(
    createBatoidGeometry(),
    material,
    CALIBRATION.CAULDRON.count
  );
  return bats;
}

/** this is our transposition function, each bat is teleported from one location to another depending upon their velocity */
export function poseCauldron(
  flight: IFlight,
  bats: THREE.InstancedMesh,
  pose: THREE.Object3D
): void {
  for (let i = 0; i < bats.count; i++) {
    const offset = i * 3;
    pose.position.fromArray(flight.positions, offset);
    pose.rotation.y = Math.atan2(flight.velocities[offset], flight.velocities[offset + 2]);
    pose.scale.setScalar(CALIBRATION.CAULDRON.batScale);
    pose.updateMatrix();
    bats.setMatrixAt(i, pose.matrix);
  }
  bats.instanceMatrix.needsUpdate = true;
}
