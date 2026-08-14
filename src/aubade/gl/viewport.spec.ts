import {
  drawingBufferSize,
  MAX_DRAWING_BUFFER_PIXELS,
  MAX_PIXEL_RATIO,
  resizeDrawingBuffer,
} from './viewport';

/**
 * Drawing-buffer sizing.
 *
 * This is the only place in the piece where the frame budget is a property of
 * the code rather than of the visitor's monitor, so the tests are mostly about
 * the ceiling holding under inputs nobody would type on purpose: a 6K display, a
 * phone reporting a pixel ratio of 4, a canvas measured mid-transition at zero.
 */

describe('drawing-buffer sizing', () => {
  describe('the ordinary case', () => {
    it('renders one drawing pixel per CSS pixel on a plain display', () => {
      const size = drawingBufferSize(1280, 720, 1);
      expect(size).toEqual({ width: 1280, height: 720, scale: 1 });
    });

    it('follows the device pixel ratio on a retina display', () => {
      const size = drawingBufferSize(800, 600, 2);
      expect(size.width).toBe(1600);
      expect(size.height).toBe(1200);
      expect(size.scale).toBe(2);
    });

    it('rounds to whole pixels', () => {
      // A canvas is very often laid out on a fractional boundary; the drawing
      // buffer cannot be.
      const size = drawingBufferSize(1279.6, 719.3, 1);
      expect(Number.isInteger(size.width)).toBe(true);
      expect(Number.isInteger(size.height)).toBe(true);
    });
  });

  describe('the pixel-ratio cap', () => {
    it('stops at MAX_PIXEL_RATIO however high the display goes', () => {
      // Phones report 3 and 4. Past 2 there is nothing on a soft-lit raymarched
      // interior for the extra samples to resolve, and the cost is quadratic.
      const capped = drawingBufferSize(400, 300, 4);
      const atCap = drawingBufferSize(400, 300, MAX_PIXEL_RATIO);
      expect(capped).toEqual(atCap);
    });

    it('never renders below the CSS grid, even on a zoomed-out desktop', () => {
      // A ratio under 1 is real, but rendering below the CSS grid reads as a
      // fault rather than as a choice.
      expect(drawingBufferSize(800, 600, 0.5).scale).toBe(1);
    });
  });

  describe('the total pixel ceiling', () => {
    it('marches a 1440p window at fewer pixels and upscales', () => {
      const size = drawingBufferSize(2560, 1440, 1);

      expect(size.width * size.height).toBeLessThanOrEqual(MAX_DRAWING_BUFFER_PIXELS + 2000);
      expect(size.scale).toBeLessThan(1);
      expect(size.scale).toBeGreaterThan(0.7);
    });

    it('holds the ceiling on a 6K display at 2× as well', () => {
      const size = drawingBufferSize(3072, 1728, 2);
      expect(size.width * size.height).toBeLessThanOrEqual(MAX_DRAWING_BUFFER_PIXELS + 2000);
    });

    it('keeps the aspect ratio when it scales down', () => {
      // Scaling one axis to fit a pixel budget would stretch the room, which is
      // why the ceiling is square-rooted back onto both.
      const size = drawingBufferSize(3840, 2160, 1);
      expect(size.width / size.height).toBeCloseTo(3840 / 2160, 2);
    });

    it('leaves a window already inside the ceiling alone', () => {
      const size = drawingBufferSize(1600, 900, 1);
      expect(size).toEqual({ width: 1600, height: 900, scale: 1 });
    });
  });

  describe('the quality ladder’s lever', () => {
    it('applies the render scale to both axes', () => {
      const size = drawingBufferSize(1000, 500, 1, 0.5);
      expect(size).toEqual({ width: 500, height: 250, scale: 0.5 });
    });

    it('compounds with the pixel ratio', () => {
      expect(drawingBufferSize(1000, 500, 2, 0.5).scale).toBe(1);
    });

    it.each([
      ['above 1', 4, 1],
      ['at zero', 0, 0.1],
      ['negative', -2, 0.1],
    ])('clamps a render scale %s', (_name, requested, expected) => {
      expect(drawingBufferSize(1000, 500, 1, requested).scale).toBeCloseTo(expected, 10);
    });

    it('defaults to full scale when none is given', () => {
      expect(drawingBufferSize(640, 480, 1).scale).toBe(1);
    });
  });

  describe('nonsense from the DOM', () => {
    /**
     * All of these are reachable. A canvas genuinely measures zero while its
     * route is animating in, `devicePixelRatio` is `undefined` in a headless
     * runtime, and a detached element measures NaN. A zero-sized drawing buffer
     * is an INVALID_VALUE rather than a small picture, so none of them may
     * produce one.
     */
    it.each([
      ['zero width', 0, 600],
      ['zero height', 800, 0],
      ['both zero', 0, 0],
      ['negative', -100, -50],
      ['NaN', Number.NaN, Number.NaN],
      ['infinite', Number.POSITIVE_INFINITY, 400],
    ])('never produces an empty buffer from a %s canvas', (_name, width, height) => {
      const size = drawingBufferSize(width, height, 1);
      expect(size.width).toBeGreaterThanOrEqual(1);
      expect(size.height).toBeGreaterThanOrEqual(1);
    });

    it('treats a non-finite pixel ratio as 1', () => {
      expect(drawingBufferSize(800, 600, Number.NaN)).toEqual(drawingBufferSize(800, 600, 1));
    });

    it('treats a non-finite render scale as full', () => {
      expect(drawingBufferSize(800, 600, 1, Number.NaN).scale).toBe(1);
    });

    it('never produces a buffer smaller than a pixel on either axis', () => {
      // A 1×1 canvas at the smallest permitted scale still has to be drawable.
      const size = drawingBufferSize(1, 1, 1, 0.1);
      expect(size.width).toBe(1);
      expect(size.height).toBe(1);
    });
  });
});

describe('resizing a canvas', () => {
  /** A canvas whose width/height are plain properties, which is all this needs. */
  const canvas = (width: number, height: number): HTMLCanvasElement => {
    const element = document.createElement('canvas');
    element.width = width;
    element.height = height;
    return element;
  };

  it('resizes when the size changed, and says so', () => {
    const element = canvas(100, 100);
    const resized = resizeDrawingBuffer(element, { width: 200, height: 150, scale: 1 });

    expect(resized).toBe(true);
    expect(element.width).toBe(200);
    expect(element.height).toBe(150);
  });

  it('does nothing when the size is unchanged', () => {
    // Assigning `canvas.width` reallocates and clears the drawing buffer even
    // when the value is identical, and this runs every frame — an unguarded
    // version is a full-screen clear sixty times a second.
    const element = canvas(200, 150);
    const resized = resizeDrawingBuffer(element, { width: 200, height: 150, scale: 1 });

    expect(resized).toBe(false);
  });

  it('resizes when only one axis moved', () => {
    const element = canvas(200, 150);
    expect(resizeDrawingBuffer(element, { width: 200, height: 151, scale: 1 })).toBe(true);
  });
});
