/**
 * the camera circles the cauldron about a vertical axis through the point it looks at, keeping the height and the
 * distance it starts at, so second 0 is exactly `CAMERA_POSITION` and the still frame under reduced motion is unchanged.
 */
import * as THREE from 'three';
import {
  CAMERA_LOOK_AT_POINT,
  CAMERA_ORBIT_PERIOD_SECONDS,
  CAMERA_POSITION,
} from './camera-calibration';

const [lookX, lookY, lookZ] = CAMERA_LOOK_AT_POINT;
const [startX, startY, startZ] = CAMERA_POSITION;
const radius = Math.hypot(startX - lookX, startZ - lookZ);
const startAngle = Math.atan2(startX - lookX, startZ - lookZ);

export function orbitCamera(camera: THREE.PerspectiveCamera, seconds: number): void {
  const angle = startAngle + (2 * Math.PI * seconds) / CAMERA_ORBIT_PERIOD_SECONDS;
  camera.position.set(lookX + radius * Math.sin(angle), startY, lookZ + radius * Math.cos(angle));
  camera.lookAt(lookX, lookY, lookZ);
  // the god-rays pass reads the camera's world matrix, so it must not lag a frame behind the position
  camera.updateMatrixWorld();
}
