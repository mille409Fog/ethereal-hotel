/** creates an initial camera with attributes given by the calibration settings */
import * as THREE from 'three';
import { CAMERA_FAR, CAMERA_NEAR } from './camera-calibration';
import { verticalFovFor } from './camera-orbit/camera-orbit';

export function createCamera(widthToHeightRatio: number): THREE.PerspectiveCamera {
  return new THREE.PerspectiveCamera(
    verticalFovFor(widthToHeightRatio),
    widthToHeightRatio,
    CAMERA_NEAR,
    CAMERA_FAR
  );
}
