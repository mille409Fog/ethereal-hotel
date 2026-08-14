import { CONTEXT_ATTRIBUTES, createRenderingContext } from './context';
import { StubWebGL2, stubCanvas } from './webgl.testing';

/**
 * Getting a context.
 *
 * Short file, and most of it is about the attributes, because those are the one
 * thing here that is a decision rather than a call. Each is off for a reason
 * that holds only because the entire room is a single fullscreen fragment
 * shader, so each is worth asserting: turning `depth` back on later would be a
 * one-word change that quietly costs bandwidth on every frame to store values
 * nothing reads, and nothing else in the repository would notice.
 */

describe('the context attributes', () => {
  it('asks for no depth or stencil buffer', () => {
    // There is no rasterised geometry to sort. Occlusion happens inside the
    // march, and the buffers would be allocated and written and never read.
    expect(CONTEXT_ATTRIBUTES.depth).toBe(false);
    expect(CONTEXT_ATTRIBUTES.stencil).toBe(false);
  });

  it('asks for no multisampling', () => {
    // MSAA antialiases primitive edges. This draw call has three, all of them
    // off-screen; it would cost a full resolve to smooth nothing.
    expect(CONTEXT_ATTRIBUTES.antialias).toBe(false);
  });

  it('asks for an opaque backbuffer', () => {
    // Lets the compositor skip blending the canvas against the page. The room
    // is a closed interior; there is nothing to see through it to.
    expect(CONTEXT_ATTRIBUTES.alpha).toBe(false);
  });

  it('does not ask to keep the previous frame', () => {
    // Forces the driver to copy rather than swap.
    expect(CONTEXT_ATTRIBUTES.preserveDrawingBuffer).toBe(false);
  });

  it('asks for the integrated GPU', () => {
    // The piece is built to make budget on the integrated part. Asking a
    // dual-GPU laptop to wake the discrete one is slower to start and rude on
    // battery.
    expect(CONTEXT_ATTRIBUTES.powerPreference).toBe('low-power');
  });
});

describe('creating a context', () => {
  it('returns the context the canvas gives it', () => {
    const gl = new StubWebGL2();
    expect(createRenderingContext(stubCanvas(gl))).toBe(gl.asContext());
  });

  it('asks for webgl2 with those attributes', () => {
    const canvas = document.createElement('canvas');
    const asked: unknown[] = [];
    canvas.getContext = ((...args: unknown[]) => {
      asked.push(args);
      return null;
    }) as typeof canvas.getContext;

    createRenderingContext(canvas);

    expect(asked[0]).toEqual(['webgl2', CONTEXT_ATTRIBUTES]);
  });

  it('returns null when the browser has no WebGL2', () => {
    // Not an error. A hardened privacy setting, a blocklisted driver or a
    // headless runtime all land here, and the piece has a real answer for it.
    expect(createRenderingContext(stubCanvas(null))).toBeNull();
  });

  it('returns null rather than throwing when getContext itself throws', () => {
    // Firefox with webgl.disabled throws here instead of returning null, and an
    // uncaught throw would take out the whole route rather than falling through
    // to the text version.
    const canvas = document.createElement('canvas');
    canvas.getContext = (() => {
      throw new Error('WebGL is disabled');
    }) as typeof canvas.getContext;

    expect(createRenderingContext(canvas)).toBeNull();
  });
});
