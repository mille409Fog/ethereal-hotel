/** keeps the renderer, the composer and the camera the same shape as the canvas */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { verticalFovFor } from '../camera/camera-orbit/camera-orbit';

/** the canvas fills the viewport, so it changes size whenever the window does, a phone turns, or its address bar
 *  slides away; without this the first frame's buffers are stretched over the new shape. the composer hands the
 *  size on to every pass. a still frame under reduced motion has no loop to pick the change up, so it is redrawn.
 *  returns the observer so its owner can disconnect it, or undefined where there is no ResizeObserver */
export function followCanvasSize(
  canvas: HTMLCanvasElement,
  renderer: THREE.WebGLRenderer,
  composer: EffectComposer,
  camera: THREE.PerspectiveCamera,
  redraw: boolean
): ResizeObserver | undefined {
  if (typeof ResizeObserver === 'undefined') {
    return undefined;
  }
  let width = canvas.clientWidth;
  let height = canvas.clientHeight;
  const resizeObserver = new ResizeObserver(() => {
    // an observer reports once on observe, and a hidden canvas measures zero; neither is a new shape
    if (
      canvas.clientWidth === 0 ||
      canvas.clientHeight === 0 ||
      (canvas.clientWidth === width && canvas.clientHeight === height)
    ) {
      return;
    }
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
    camera.aspect = width / height;
    camera.fov = verticalFovFor(camera.aspect);
    camera.updateProjectionMatrix();
    if (redraw) {
      composer.render();
    }
  });
  resizeObserver.observe(canvas);
  return resizeObserver;
}
