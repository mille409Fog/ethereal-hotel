/**
 * finds out whether this device can run the simulation, by doing the one thing the simulation needs and looking
 * at the result: draw a number into a 32-bit float texture and read it back.
 *
 * ## why a render and not an extension query
 *
 * the simulation keeps heights of a couple of thousand metres and moves them by millimetres a step, so its state
 * must be `RGBA32F` and must be renderable, which WebGL2 grants only through `EXT_color_buffer_float`. asking for
 * the extension is not the same as having it: a driver may advertise it and then refuse the framebuffer, or hand
 * back a half-float one. so the probe writes a value a half-float cannot hold. at 2400 a half-float's neighbours are
 * two apart, so `PROBE_VALUE` would come back as 2400 exactly; only a real 32-bit target returns the thirty-second.
 *
 * a device that fails is not shown a failure. it is shown the stored land, which the same model computed earlier,
 * and told so; sampling a float texture needs no extension, only rendering to one does.
 *
 * ## what has been measured
 *
 * recorded here rather than assumed, because every later phase stands on the answer.
 *
 * - **SwiftShader passes.** Playwright's headless Chromium 151 on the Windows box, 2026-11-11, renderer string
 *   "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)": the route read
 *   `simulating`. the same context reported `EXT_color_buffer_float` and `OES_texture_float_linear` present,
 *   `OES_texture_half_float_linear` absent, and a largest texture of 8192. CI runs the same rasteriser on Linux, so
 *   the simulation can be exercised there; that is an inference from the shared driver, not a reading of CI.
 * - **the Linux CI image itself has not been read**, and neither has **a real phone**. the route prints its state
 *   in the line at the bottom-left of the canvas, so reading a phone is opening `/watershed` on it. the sentence
 *   about float there is the one this probe decided.
 *
 * float linear filtering being present on SwiftShader changes nothing: phones are the devices that lack it, and
 * the simulation samples nearest everywhere for their sake.
 */
import * as THREE from 'three';

/** exactly representable in 32-bit float, and not in 16-bit: 2400 and one thirty-second */
export const PROBE_VALUE = 2400.03125;

/** the probe target's side, in texels. one would do; four is no dearer and is a size every driver accepts */
const PROBE_SIZE = 4;

const PROBE_VERTEX = /* glsl */ `
  void main() {
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }`;

const PROBE_FRAGMENT = /* glsl */ `
  uniform float probe;
  void main() {
    gl_FragColor = vec4(probe);
  }`;

/**
 * true when the renderer can draw into a 32-bit float target and read the same number back. leaves the renderer
 * bound to whatever target it had, and frees everything it made.
 */
export function supportsFloatTargets(renderer: THREE.WebGLRenderer): boolean {
  const target = new THREE.WebGLRenderTarget(PROBE_SIZE, PROBE_SIZE, {
    type: THREE.FloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: false,
  });
  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.ShaderMaterial({
    uniforms: { probe: { value: PROBE_VALUE } },
    vertexShader: PROBE_VERTEX,
    fragmentShader: PROBE_FRAGMENT,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(geometry, material);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const previous = renderer.getRenderTarget();
  const read = new Float32Array(4);
  try {
    renderer.setRenderTarget(target);
    renderer.render(scene, new THREE.Camera());
    // three leaves the buffer untouched, and says so on the console, when the framebuffer is incomplete or unreadable
    renderer.readRenderTargetPixels(target, 0, 0, 1, 1, read);
  } catch {
    return false;
  } finally {
    renderer.setRenderTarget(previous);
    target.dispose();
    geometry.dispose();
    material.dispose();
  }
  return read[0] === PROBE_VALUE;
}
