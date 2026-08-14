/**
 * Getting a WebGL2 context, and deciding what to do when there isn't one.
 *
 * The context attributes are the interesting part of this file. Every one of
 * them is off, and each is off for a reason that only holds because the whole
 * room is a single fullscreen fragment shader:
 *
 * - `depth` and `stencil` — there is no rasterised geometry to sort. The room is
 *   a distance field; occlusion happens inside the march. Allocating the buffers
 *   would cost bandwidth on every frame to store values nothing reads.
 * - `antialias` — multisampling antialiases *primitive edges*, and this draw call
 *   has three, all off-screen. It would cost a full multisample resolve to
 *   smooth nothing. Edge quality inside the image is the shader's job.
 * - `alpha` — an opaque backbuffer lets the compositor skip blending the canvas
 *   against the page. The room is a closed interior; there is nothing to see
 *   through it to.
 * - `preserveDrawingBuffer` — keeping the previous frame forces the driver to
 *   copy rather than swap.
 *
 * `powerPreference` is the one judgement call. `high-performance` asks a laptop
 * with two GPUs to wake the discrete one, which on battery is both slower to
 * start and rude; the piece is built to make budget on the integrated part, so
 * it asks for that and means it.
 */

/** Why there is no context, in a form the component can act on. */
export type ContextFailure = 'unsupported' | 'lost';

/** See the module comment — every one of these is load-bearing. */
export const CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
  alpha: false,
  antialias: false,
  depth: false,
  stencil: false,
  desynchronized: false,
  failIfMajorPerformanceCaveat: false,
  powerPreference: 'low-power',
  preserveDrawingBuffer: false,
  premultipliedAlpha: false,
};

/**
 * Ask a canvas for a WebGL2 context.
 *
 * No WebGL1 fallback, and that is a decision rather than an omission. The lobby
 * shader is GLSL ES 3.00 throughout and leans on `gl_VertexID` for the
 * attribute-free fullscreen triangle and on integer loop bounds driven by a
 * uniform for the quality ladder — both of which WebGL1 forbids. A WebGL1 path
 * would be a second shader maintained in parallel for an audience that, on the
 * numbers, no longer exists, and AUBADE's fourth non-negotiable explicitly
 * allows going straight to the Reader's Edition instead.
 *
 * @param canvas The canvas to bind to.
 * @returns The context, or `null` when this browser has no WebGL2 at all — a
 *   hardened privacy setting, a blocklisted driver, a headless runtime. `null`
 *   is a route the piece has a real answer for, not an error.
 */
export function createRenderingContext(canvas: HTMLCanvasElement): WebGL2RenderingContext | null {
  // Wrapped, because `getContext` throws rather than returning null in at least
  // one shipping configuration (Firefox with webgl.disabled), and a throw here
  // would take out the whole route rather than falling through to the text.
  try {
    return canvas.getContext('webgl2', CONTEXT_ATTRIBUTES);
  } catch {
    return null;
  }
}
