/** the camera the stage is seen through, and how its lens follows the canvas's shape */
import * as THREE from 'three';
import {
  CAMERA_FAR,
  CAMERA_FOV,
  CAMERA_NEAR,
  CAMERA_POSITION,
  CAMERA_REFERENCE_ASPECT,
  CAMERA_TARGET,
} from './stage-calibration';

const DEGREES = 180 / Math.PI;

/**
 * the vertical field of view for a canvas of this aspect. at the reference aspect or wider it is the calibrated
 * one. narrower, it opens so the horizontal field stays what it was at the reference: a phone held upright sees
 * the whole width of the block, with more sky and more foreground, instead of its middle third.
 */
export function verticalFovFor(aspect: number): number {
  if (aspect >= CAMERA_REFERENCE_ASPECT) {
    return CAMERA_FOV;
  }
  const halfHorizontal = Math.atan(Math.tan(CAMERA_FOV / DEGREES / 2) * CAMERA_REFERENCE_ASPECT);
  return 2 * Math.atan(Math.tan(halfHorizontal) / aspect) * DEGREES;
}

/** the aspect of a canvas, or the reference aspect for one that has no layout yet and measures zero */
export function aspectOf(width: number, height: number): number {
  return width > 0 && height > 0 ? width / height : CAMERA_REFERENCE_ASPECT;
}

/** points the lens for a canvas of this shape */
export function frameCamera(camera: THREE.PerspectiveCamera, aspect: number): void {
  camera.aspect = aspect;
  camera.fov = verticalFovFor(aspect);
  camera.updateProjectionMatrix();
}

export function createStageCamera(aspect: number): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, aspect, CAMERA_NEAR, CAMERA_FAR);
  camera.position.set(...CAMERA_POSITION);
  camera.lookAt(...CAMERA_TARGET);
  frameCamera(camera, aspect);
  return camera;
}
