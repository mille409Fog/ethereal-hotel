import * as THREE from 'three';
import {
  CAMERA_BREATH,
  CAMERA_LOOK_AT_POINT,
  CAMERA_MIN_HORIZONTAL_FOV,
  CAMERA_VERTICAL_FOV,
  CAMERA_ORBIT_PERIOD_SECONDS,
  CAMERA_POSITION,
} from './camera-calibration';
import { orbitCamera, verticalFovFor } from './camera-orbit';

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

describe('verticalFovFor', () => {
  /** the horizontal field of view a vertical one gives at this aspect, in degrees */
  const horizontalOf = (vertical: number, aspect: number): number =>
    (2 * Math.atan(Math.tan((vertical * Math.PI) / 360) * aspect) * 180) / Math.PI;

  it('keeps the calibrated lens on a landscape frame, which is wide enough already', () => {
    expect(verticalFovFor(16 / 9)).toBe(CAMERA_VERTICAL_FOV);
    expect(verticalFovFor(21 / 9)).toBe(CAMERA_VERTICAL_FOV);
  });

  it('opens on a portrait frame until the view is exactly the minimum across', () => {
    for (const aspect of [9 / 16, 0.5, 1]) {
      const vertical = verticalFovFor(aspect);

      expect(vertical).toBeGreaterThan(CAMERA_VERTICAL_FOV);
      expect(horizontalOf(vertical, aspect)).toBeCloseTo(CAMERA_MIN_HORIZONTAL_FOV, 10);
    }
  });

  it('is never narrower across than the minimum, at any shape', () => {
    for (const aspect of [0.3, 0.6, 1, 1.3, 2, 4]) {
      expect(horizontalOf(verticalFovFor(aspect), aspect)).toBeGreaterThanOrEqual(
        CAMERA_MIN_HORIZONTAL_FOV - 1e-9
      );
    }
  });

  it('falls back to the calibrated lens for a frame with no shape yet', () => {
    expect(verticalFovFor(0)).toBe(CAMERA_VERTICAL_FOV);
    expect(verticalFovFor(Number.NaN)).toBe(CAMERA_VERTICAL_FOV);
  });
});

describe('orbitCamera', () => {
  it('starts exactly where the camera is calibrated to stand', () => {
    expectVectorCloseTo(posedAt(0).position, start);
  });

  it('breathes within its calibrated reach and rise, and no further', () => {
    const near = axisDistance(start) * (1 - CAMERA_BREATH.reach);
    const far = axisDistance(start) * (1 + CAMERA_BREATH.reach);
    for (let seconds = 0; seconds < 600; seconds += 1.7) {
      const { position } = posedAt(seconds);

      expect(axisDistance(position)).toBeGreaterThanOrEqual(near - 1e-9);
      expect(axisDistance(position)).toBeLessThanOrEqual(far + 1e-9);
      expect(Math.abs(position.y - start.y)).toBeLessThanOrEqual(CAMERA_BREATH.rise + 1e-9);
    }
  });

  it('actually breathes: its distance and height both move off their starting values', () => {
    const quarterReach = posedAt(CAMERA_BREATH.reachPeriodSeconds / 4).position;
    const quarterRise = posedAt(CAMERA_BREATH.risePeriodSeconds / 4).position;

    expect(axisDistance(quarterReach)).not.toBeCloseTo(axisDistance(start), 3);
    expect(quarterRise.y).toBeCloseTo(start.y + CAMERA_BREATH.rise, DIGITS);
  });

  it('is on the far side of the cauldron after half a period, and home after a whole one', () => {
    // the breath moves the distance, not the bearing, so compare where the camera points from the axis
    const bearing = (seconds: number): number => {
      const { position } = posedAt(seconds);
      return Math.atan2(position.x - lookAt.x, position.z - lookAt.z);
    };
    const startBearing = bearing(0);

    expect(Math.abs(bearing(CAMERA_ORBIT_PERIOD_SECONDS / 2) - startBearing)).toBeCloseTo(
      Math.PI,
      DIGITS
    );
    expect(bearing(CAMERA_ORBIT_PERIOD_SECONDS)).toBeCloseTo(startBearing, DIGITS);
  });

  it('looks at the cauldron from wherever it stands', () => {
    for (const seconds of [0, 23, 90]) {
      const camera = posedAt(seconds);
      const toward = lookAt.clone().sub(camera.position).normalize();

      expectVectorCloseTo(camera.getWorldDirection(new THREE.Vector3()), toward);
    }
  });
});
