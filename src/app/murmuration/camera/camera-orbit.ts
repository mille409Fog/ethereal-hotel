/**
 * the camera circles the cauldron about a vertical axis through the point it looks at, breathing in and out and up
 * and down as it goes. every swing is a sine that is 0 at second 0, so second 0 is exactly `CAMERA_POSITION` and the
 * still frame under reduced motion is unchanged.
 */
import * as THREE from 'three';
import {
  CAMERA_BREATH,
  CAMERA_LOOK_AT_POINT,
  CAMERA_ORBIT_PERIOD_SECONDS,
  CAMERA_POSITION,
} from './camera-calibration';

const [lookX, lookY, lookZ] = CAMERA_LOOK_AT_POINT;
const [startX, startY, startZ] = CAMERA_POSITION;
const radius = Math.hypot(startX - lookX, startZ - lookZ);
const startAngle = Math.atan2(startX - lookX, startZ - lookZ);

/** a sine with the given period, 0 at second 0 */
const swing = (seconds: number, period: number): number =>
  Math.sin((2 * Math.PI * seconds) / period);

export function orbitCamera(camera: THREE.PerspectiveCamera, seconds: number): void {
  const angle = startAngle + (2 * Math.PI * seconds) / CAMERA_ORBIT_PERIOD_SECONDS;
  const reach =
    radius * (1 + CAMERA_BREATH.reach * swing(seconds, CAMERA_BREATH.reachPeriodSeconds));
  const height = startY + CAMERA_BREATH.rise * swing(seconds, CAMERA_BREATH.risePeriodSeconds);
  camera.position.set(lookX + reach * Math.sin(angle), height, lookZ + reach * Math.cos(angle));
  camera.lookAt(lookX, lookY, lookZ);
  // the god-rays pass reads the camera's world matrix, so it must not lag a frame behind the position
  camera.updateMatrixWorld();
}
