/**
 * How many pixels to actually raymarch.
 *
 * A fullscreen fragment shader is the one kind of program whose cost is exactly
 * linear in its output resolution, which cuts both ways: it is the easiest thing
 * in graphics to make fast, by rendering fewer of them, and the easiest to make
 * unusable, by not thinking about it and letting a 4K display ask for four times
 * the work a 1080p one does at the same apparent size.
 *
 * So the drawing buffer is sized here, deliberately, rather than by the reflex
 * `canvas.width = clientWidth * devicePixelRatio`. Three clamps, in this order:
 *
 * 1. **Device pixel ratio**, capped at `MAX_PIXEL_RATIO`. Past 2× the returns on
 *    a soft-lit raymarched interior are close to nil — there are no thin
 *    high-contrast edges for the extra samples to resolve — and phones report 3
 *    and 4.
 * 2. **Render scale**, the quality ladder's lever. One number, in `(0, 1]`,
 *    applied to both axes.
 * 3. **A total pixel ceiling.** The last defence, and the one that makes the
 *    frame budget a property of the code rather than of the visitor's monitor:
 *    however large the window, the shader is never asked for more than
 *    `MAX_DRAWING_BUFFER_PIXELS`, and the result is stretched over the canvas by
 *    the compositor, which is free.
 *
 * The upscale is honest rather than hidden. The spec's fourth non-negotiable
 * asks for degradation the visitor is told about, and `IDrawingBufferSize.scale`
 * is what the renderer reports upwards so it can be said out loud.
 */

/** Everything above this buys nothing here and costs quadratically. */
export const MAX_PIXEL_RATIO = 2;

/**
 * The most pixels the lobby will ever be marched at: 1920×1080.
 *
 * Chosen against the frame budget rather than against a display size. At the
 * shader's step counts this is what an integrated GPU renders inside 16ms; a
 * 1440p window therefore marches about three quarters of its pixels and is
 * upscaled, which on a soft interior with no text in it is invisible at normal
 * viewing distance and is the difference between 60fps and 40.
 */
export const MAX_DRAWING_BUFFER_PIXELS = 1920 * 1080;

/** What to set `canvas.width`/`canvas.height` to, and what that cost. */
export interface IDrawingBufferSize {
  /** Drawing buffer width, whole pixels, at least 1. */
  readonly width: number;

  /** Drawing buffer height, whole pixels, at least 1. */
  readonly height: number;

  /**
   * Drawn pixels per CSS pixel along one axis, after every clamp. `1` is
   * one-to-one; below `1` the frame is upscaled by the compositor. Reported to
   * the visitor rather than kept quiet.
   */
  readonly scale: number;
}

/** Coerce a dimension that came from the DOM into something GL can be given. */
function usableLength(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

/**
 * Size the drawing buffer for a canvas of a given CSS size.
 *
 * @param cssWidth The canvas's laid-out width in CSS pixels, from
 *   `getBoundingClientRect`. Zero, negative and non-finite values are treated as
 *   1: a canvas can genuinely measure zero while its route is animating in, and
 *   a zero-sized drawing buffer is an INVALID_VALUE, not a small picture.
 * @param cssHeight As above, for height.
 * @param devicePixelRatio `window.devicePixelRatio`. Clamped to
 *   `[1, MAX_PIXEL_RATIO]`; a ratio below 1 exists (a zoomed-out desktop) but
 *   rendering below the CSS grid looks like a fault rather than a choice.
 * @param renderScale The quality ladder's lever, clamped to `(0, 1]`.
 * @returns Integer dimensions, at least 1×1, whose product never exceeds
 *   `MAX_DRAWING_BUFFER_PIXELS`.
 */
export function drawingBufferSize(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
  renderScale: number = 1
): IDrawingBufferSize {
  const width = usableLength(cssWidth);
  const height = usableLength(cssHeight);

  const ratio = Number.isFinite(devicePixelRatio)
    ? Math.min(Math.max(devicePixelRatio, 1), MAX_PIXEL_RATIO)
    : 1;
  const requested = Number.isFinite(renderScale) ? Math.min(Math.max(renderScale, 0.1), 1) : 1;

  let scale = ratio * requested;

  // The ceiling. Applied to the product, then square-rooted back onto each axis,
  // so the aspect ratio survives — scaling one axis to fit a pixel budget would
  // stretch the room.
  const pixels = width * height * scale * scale;
  if (pixels > MAX_DRAWING_BUFFER_PIXELS) {
    scale *= Math.sqrt(MAX_DRAWING_BUFFER_PIXELS / pixels);
  }

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  };
}

/**
 * Resize a canvas's drawing buffer if it is not already the right size.
 *
 * Guarded because assigning `canvas.width` reallocates and clears the drawing
 * buffer even when the value is unchanged, and this is called every frame:
 * resizing on a vsync tick that did not need it is a full-screen clear sixty
 * times a second.
 *
 * @returns Whether the buffer was actually resized, which the caller uses to
 *   decide whether to re-issue `gl.viewport`.
 */
export function resizeDrawingBuffer(canvas: HTMLCanvasElement, size: IDrawingBufferSize): boolean {
  if (canvas.width === size.width && canvas.height === size.height) {
    return false;
  }
  canvas.width = size.width;
  canvas.height = size.height;
  return true;
}
