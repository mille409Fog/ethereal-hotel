import * as THREE from 'three';
import { aspectOf, createStageCamera, frameCamera, verticalFovFor } from './stage-camera';
import {
  CAMERA_FAR,
  CAMERA_FOV,
  CAMERA_POSITION,
  CAMERA_REFERENCE_ASPECT,
  LAND_EXTENT,
} from './stage-calibration';

const RADIANS = Math.PI / 180;

/** the horizontal field of view a vertical one gives at an aspect, in degrees */
const horizontalFov = (vertical: number, aspect: number): number =>
  (2 * Math.atan(Math.tan((vertical * RADIANS) / 2) * aspect)) / RADIANS;

describe('stage camera', () => {
  it('keeps the calibrated lens at the reference aspect and on anything wider', () => {
    expect(verticalFovFor(CAMERA_REFERENCE_ASPECT)).toBe(CAMERA_FOV);
    expect(verticalFovFor(21 / 9)).toBe(CAMERA_FOV);
  });

  it('opens the lens on a narrower canvas so the same width of land stays in frame', () => {
    const portrait = 9 / 16;
    const atReference = horizontalFov(CAMERA_FOV, CAMERA_REFERENCE_ASPECT);

    expect(verticalFovFor(portrait)).toBeGreaterThan(CAMERA_FOV);
    expect(horizontalFov(verticalFovFor(portrait), portrait)).toBeCloseTo(atReference, 10);
  });

  it('gives a canvas with no layout the reference aspect, not a division by zero', () => {
    expect(aspectOf(0, 0)).toBe(CAMERA_REFERENCE_ASPECT);
    expect(aspectOf(1280, 0)).toBe(CAMERA_REFERENCE_ASPECT);
    expect(aspectOf(1600, 900)).toBeCloseTo(16 / 9, 12);
  });

  it('frames a camera for a new shape', () => {
    const camera = new THREE.PerspectiveCamera();
    frameCamera(camera, 0.5);

    expect(camera.aspect).toBe(0.5);
    expect(camera.fov).toBe(verticalFovFor(0.5));
  });

  it('stands at the calibrated vantage, looking down at the middle of the block', () => {
    const camera = createStageCamera(CAMERA_REFERENCE_ASPECT);
    const gaze = camera.getWorldDirection(new THREE.Vector3());
    const toCentre = new THREE.Vector3(...CAMERA_POSITION).negate().normalize();

    expect(camera.position.toArray()).toEqual([...CAMERA_POSITION]);
    expect(gaze.distanceTo(toCentre)).toBeCloseTo(0, 10);
    expect(gaze.y).toBeLessThan(0);
  });

  it('can see the far corner of the block', () => {
    const camera = createStageCamera(CAMERA_REFERENCE_ASPECT);
    const farCorner = new THREE.Vector3(-LAND_EXTENT / 2, 0, -LAND_EXTENT / 2);

    expect(camera.position.distanceTo(farCorner)).toBeLessThan(CAMERA_FAR);
  });
});
