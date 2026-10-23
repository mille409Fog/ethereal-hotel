/**
 * the camera circles the cauldron about a vertical axis through the point it looks at, breathing in and out and up
 * and down as it goes. every swing is a sine that is 0 at second 0, so second 0 is exactly `CAMERA_POSITION` and the
 * still frame under reduced motion is unchanged.
 */
import * as THREE from 'three';
import {
  CAMERA_BREATH,
  CAMERA_LOOK_AT_POINT,
  CAMERA_MIN_HORIZONTAL_FOV,
  CAMERA_ORBIT_PERIOD_SECONDS,
  CAMERA_POSITION,
  CAMERA_VERTICAL_FOV,
} from '../camera-calibration';

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
const toDegrees = (radians: number): number => (radians * 180) / Math.PI;

/** the vertical field of view, in degrees, for a frame of this width over height: CAMERA_VERTICAL_FOV, opened just
 *  enough that the view is never narrower across than CAMERA_MIN_HORIZONTAL_FOV */
export function verticalFovFor(aspect: number): number {
  if (!(aspect > 0)) {
    return CAMERA_VERTICAL_FOV;
  }
  const needed = 2 * Math.atan(Math.tan(toRadians(CAMERA_MIN_HORIZONTAL_FOV) / 2) / aspect);
  return Math.max(CAMERA_VERTICAL_FOV, toDegrees(needed));
}

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
