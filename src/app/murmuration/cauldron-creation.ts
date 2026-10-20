import * as THREE from 'three';
import * as CALIBRATION from './batoid-calibration';
import { createBatoidGeometry } from './batoid-geometry';
import { spread } from './batoid-transformation';
import { Random } from './batoid-types';
export function createCauldron(
  random: Random
): THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> {
  const material = new THREE.MeshStandardMaterial({
    color: CALIBRATION.PALETTE.batoid,
    flatShading: true,
  });

  const bats = new THREE.InstancedMesh(
    createBatoidGeometry(),
    material,
    CALIBRATION.CAULDRON.count
  );
  const pose = new THREE.Object3D();
  for (let i = 0; i < CALIBRATION.CAULDRON.count; i++) {
    pose.position.set(
      spread(random, CALIBRATION.CAULDRON.halfWidth),
      spread(random, CALIBRATION.CAULDRON.halfHeight),
      spread(random, CALIBRATION.CAULDRON.halfDepth)
    );
    pose.rotation.y = random() * Math.PI * 2;
    pose.scale.setScalar(CALIBRATION.CAULDRON.batScale);
    pose.updateMatrix();
    bats.setMatrixAt(i, pose.matrix);
  }
  bats.instanceMatrix.needsUpdate = true;
  return bats;
}
