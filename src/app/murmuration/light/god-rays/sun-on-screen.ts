/** where even is the sun, and if it is here, how much of the rays will it show? */
import * as THREE from 'three';
import { ISunFade } from '../light-calibration';

// scratch vectors: this runs every frame, and nothing it returns holds on to them
const forward = new THREE.Vector3();
const point = new THREE.Vector3();

/**
 * writes the sun's position into `out` as 0..1 across the frame, with (0.5, 0.5) at the centre
 * and y running up, then returns how visible the shafts should be, 0..1.
 *
 * a sun 90° or more from the view is refused before it is projected: behind the camera the
 * projection flips, and would place the sun in front of the viewer on the wrong side.
 */
export function sunOnScreen(
  sunDirection: THREE.Vector3,
  camera: THREE.Camera,
  fade: ISunFade,
  out: THREE.Vector2
): number {
  const facing = camera.getWorldDirection(forward).dot(sunDirection);
  if (facing <= 0) {
    return 0;
  }

  // the sun is a direction rather than a place, and under perspective any distance along it projects the same
  camera.getWorldPosition(point).add(sunDirection).project(camera);
  out.set(point.x * 0.5 + 0.5, point.y * 0.5 + 0.5);

  const overshoot = Math.max(0, -out.x, out.x - 1, -out.y, out.y - 1);
  const edge = 1 - THREE.MathUtils.smoothstep(overshoot, 0, fade.edgeMargin);
  return edge * THREE.MathUtils.smoothstep(facing, 0, fade.facingMargin);
}
