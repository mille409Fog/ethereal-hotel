/** constants used to calibrate the renderer behavior as well as a function to apply calibration */
import * as THREE from 'three';

export const PIXEL_RATIO_FLOOR = 2;
export const TONE_MAPPING_EXPOSURE = 1.0;
/** when it matches, the scene is drawn once as a still frame instead of animated */
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** applies the calibration setting to the web graphics renderer */
export function calibrateRenderer(
  renderer: THREE.WebGLRenderer,
  width: number,
  height: number
): void {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, PIXEL_RATIO_FLOOR));
  renderer.setSize(width, height, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = TONE_MAPPING_EXPOSURE;
}
