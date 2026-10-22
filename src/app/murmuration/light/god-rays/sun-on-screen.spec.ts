import * as THREE from 'three';
import {
  CAMERA_FAR,
  CAMERA_LOOK_AT_POINT,
  CAMERA_NEAR,
  CAMERA_POSITION,
  CAMERA_VERTICAL_FOV,
} from '../../camera/camera-calibration';
import { GOD_RAYS, KEY_LIGHT_POSITION } from '../light-calibration';
import { sunOnScreen } from './sun-on-screen';

const LANDSCAPE = 16 / 9;

/** a camera at the origin looking down -z, which is where three points one by default */
const cameraAtOrigin = (aspect: number = LANDSCAPE): THREE.PerspectiveCamera => {
  const camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 100);
  camera.updateMatrixWorld();
  return camera;
};

/** the camera `murmuration.ts` draws through */
const murmurationCamera = (aspect: number): THREE.PerspectiveCamera => {
  const camera = new THREE.PerspectiveCamera(CAMERA_VERTICAL_FOV, aspect, CAMERA_NEAR, CAMERA_FAR);
  camera.position.set(...CAMERA_POSITION);
  camera.lookAt(...CAMERA_LOOK_AT_POINT);
  camera.updateMatrixWorld();
  return camera;
};

const towards = (x: number, y: number, z: number): THREE.Vector3 =>
  new THREE.Vector3(x, y, z).normalize();

/** the frame's right edge, as a direction's x per unit of -z, for `cameraAtOrigin` */
const HALF_WIDTH = Math.tan(THREE.MathUtils.degToRad(25)) * LANDSCAPE;

describe('sunOnScreen', () => {
  it('puts a sun dead ahead in the centre, fully visible', () => {
    const uv = new THREE.Vector2();
    const visibility = sunOnScreen(towards(0, 0, -1), cameraAtOrigin(), GOD_RAYS, uv);

    expect(uv.x).toBeCloseTo(0.5, 10);
    expect(uv.y).toBeCloseTo(0.5, 10);
    expect(visibility).toBe(1);
  });

  it('refuses a sun behind the camera, where the projection would flip it in front', () => {
    expect(sunOnScreen(towards(0, 0, 1), cameraAtOrigin(), GOD_RAYS, new THREE.Vector2())).toBe(0);
  });

  it('refuses a sun exactly at the side', () => {
    expect(sunOnScreen(towards(1, 0, 0), cameraAtOrigin(), GOD_RAYS, new THREE.Vector2())).toBe(0);
  });

  it('keeps the shader axes: left is below 0.5 in x, up is above 0.5 in y', () => {
    const left = new THREE.Vector2();
    const up = new THREE.Vector2();
    sunOnScreen(towards(-0.2, 0, -1), cameraAtOrigin(), GOD_RAYS, left);
    sunOnScreen(towards(0, 0.2, -1), cameraAtOrigin(), GOD_RAYS, up);

    expect(left.x).toBeLessThan(0.5);
    expect(left.y).toBeCloseTo(0.5, 10);
    expect(up.y).toBeGreaterThan(0.5);
    expect(up.x).toBeCloseTo(0.5, 10);
  });

  it('fades a sun just past the edge, and drops one well past it', () => {
    const justPast = towards(-HALF_WIDTH * 1.1, 0, -1);
    const wellPast = towards(-HALF_WIDTH * 2, 0, -1);
    const fading = sunOnScreen(justPast, cameraAtOrigin(), GOD_RAYS, new THREE.Vector2());

    expect(fading).toBeGreaterThan(0);
    expect(fading).toBeLessThan(1);
    expect(sunOnScreen(wellPast, cameraAtOrigin(), GOD_RAYS, new THREE.Vector2())).toBe(0);
  });

  it('depends on where the camera looks, not where it stands', () => {
    const camera = cameraAtOrigin();
    camera.position.set(5, -2, 7);
    camera.updateMatrixWorld();
    const uv = new THREE.Vector2();
    sunOnScreen(towards(0, 0, -1), camera, GOD_RAYS, uv);

    expect(uv.x).toBeCloseTo(0.5, 10);
    expect(uv.y).toBeCloseTo(0.5, 10);
  });

  it('sees the real key light through the real camera on a landscape screen', () => {
    // the test that stops the light being moved out of frame and the shafts silently switching off
    const sun = towards(...KEY_LIGHT_POSITION);
    const visibility = sunOnScreen(
      sun,
      murmurationCamera(LANDSCAPE),
      GOD_RAYS,
      new THREE.Vector2()
    );

    expect(visibility).toBeGreaterThan(0);
  });
});
