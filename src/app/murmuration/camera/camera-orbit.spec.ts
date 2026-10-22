import * as THREE from 'three';
import {
  CAMERA_LOOK_AT_POINT,
  CAMERA_ORBIT_PERIOD_SECONDS,
  CAMERA_POSITION,
} from './camera-calibration';
import { orbitCamera } from './camera-orbit';

const DIGITS = 10;
const lookAt = new THREE.Vector3(...CAMERA_LOOK_AT_POINT);
const start = new THREE.Vector3(...CAMERA_POSITION);

const posedAt = (seconds: number): THREE.PerspectiveCamera => {
  const camera = new THREE.PerspectiveCamera();
  orbitCamera(camera, seconds);
  return camera;
};

/** distance from the vertical axis through the look-at point */
const axisDistance = (position: THREE.Vector3): number =>
  Math.hypot(position.x - lookAt.x, position.z - lookAt.z);

const expectVectorCloseTo = (actual: THREE.Vector3, expected: THREE.Vector3): void => {
  expect(actual.x).toBeCloseTo(expected.x, DIGITS);
  expect(actual.y).toBeCloseTo(expected.y, DIGITS);
  expect(actual.z).toBeCloseTo(expected.z, DIGITS);
};

describe('orbitCamera', () => {
  it('starts exactly where the camera is calibrated to stand', () => {
    expectVectorCloseTo(posedAt(0).position, start);
  });

  it('keeps its height and its distance from the cauldron at every second', () => {
    for (const seconds of [7, 31, 64, 119]) {
      const { position } = posedAt(seconds);

      expect(position.y).toBe(start.y);
      expect(axisDistance(position)).toBeCloseTo(axisDistance(start), DIGITS);
    }
  });

  it('is on the far side of the cauldron after half a period, and home after a whole one', () => {
    const opposite = new THREE.Vector3(2 * lookAt.x - start.x, start.y, 2 * lookAt.z - start.z);

    expectVectorCloseTo(posedAt(CAMERA_ORBIT_PERIOD_SECONDS / 2).position, opposite);
    expectVectorCloseTo(posedAt(CAMERA_ORBIT_PERIOD_SECONDS).position, start);
  });

  it('looks at the cauldron from wherever it stands', () => {
    for (const seconds of [0, 23, 90]) {
      const camera = posedAt(seconds);
      const toward = lookAt.clone().sub(camera.position).normalize();

      expectVectorCloseTo(camera.getWorldDirection(new THREE.Vector3()), toward);
    }
  });
});
