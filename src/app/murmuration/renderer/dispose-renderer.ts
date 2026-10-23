/** releases the renderer and its WebGL context */
import * as THREE from 'three';

/** stops the animation loop before disposing, so no frame is drawn with a released context */
export function disposeRenderer(renderer: THREE.WebGLRenderer): void {
  renderer.setAnimationLoop(null);
  renderer.dispose();
}
