import { breathe } from './camera/drift';
import { FIXED_STEP_MS, type IFrame } from './gl/loop';
import { DEMOTE_ABOVE_MS, QUALITY_TIERS, WINDOW_FRAMES } from './gl/quality';
import { StubWebGL2, stubCanvas } from './gl/webgl.testing';
import { MAX_DRAWING_BUFFER_PIXELS } from './gl/viewport';
import { HotelRenderer, type IHotelFrame } from './renderer';
import { CORRIDOR_RIGS } from './rooms/corridor-rig';
import { LIBRARY_RIGS } from './rooms/library-rig';
import { INVITED_THRESHOLD, LIGHT_RIGS, rigFor } from './rooms/light-rig';

/**
 * The renderer, driven against a recording context.
 *
 * What this can prove: that a frame writes every uniform the shader declares,
 * that the drawing buffer is only reallocated when its size actually changed,
 * that the quality governor's decisions reach the GPU, and that nothing leaks
 * when the route is left. What it cannot prove is that the picture is right —
 * see the note at the top of `gl/webgl.testing.ts`.
 *
 * The uniform assertions are worth more than they look. There is no compiler
 * between this code and the shader: a renamed uniform, a `uniform1f` where the
 * shader declares an `int`, or a value simply never written, all fail silently
 * and present as a black screen or a room frozen at time zero.
 */

const frame = (overrides: Partial<IFrame> = {}): IFrame => ({
  simulatedSeconds: 0,
  alpha: 0,
  frameMs: 16.7,
  ...overrides,
});

/** The hour most of these tests are indifferent to. */
const NIGHT = LIGHT_RIGS.open;

/**
 * One frame's worth of hotel: a rig per floor, and where the lift is.
 *
 * Most of these tests are about the renderer's plumbing rather than about any one
 * room, so they settle on the lobby and pass whichever lobby rig they are
 * interested in. The other two rigs still travel on every frame, because they do
 * in the real thing — see the note on IHotelFrame.
 */
const at = (lobby = NIGHT, depth = 0): IHotelFrame => ({
  lobby,
  corridor: CORRIDOR_RIGS.open,
  library: LIBRARY_RIGS.open,
  depth,
});

/** A renderer over a stub, with the canvas laid out at a known size. */
function build(size = { width: 1280, height: 720 }): {
  gl: StubWebGL2;
  canvas: HTMLCanvasElement;
  renderer: HotelRenderer;
} {
  const gl = new StubWebGL2();
  const canvas = stubCanvas(gl, size);
  const renderer = HotelRenderer.create(canvas);
  if (renderer === null) {
    throw new Error('the stub context should have produced a renderer');
  }
  return { gl, canvas, renderer };
}

describe('creating the renderer', () => {
  it('builds one when the browser has WebGL2', () => {
    expect(build().renderer).toBeInstanceOf(HotelRenderer);
  });

  it('returns null when the browser has none', () => {
    expect(HotelRenderer.create(stubCanvas(null))).toBeNull();
  });

  it('returns null, having said what was wrong, when the driver rejects the shader', () => {
    // Unlike a missing context this usually *is* something to fix, so it goes to
    // the console — but it must not throw, because the route has a real answer
    // for it and a thrown error would take the whole page instead.
    const complaint = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const gl = new StubWebGL2({ compile: true });

    expect(HotelRenderer.create(stubCanvas(gl))).toBeNull();
    expect(complaint).toHaveBeenCalledOnce();
    expect(complaint.mock.calls[0][0]).toContain('[aubade]');

    complaint.mockRestore();
  });

  it('turns off the fixed-function state a raymarcher does not use', () => {
    const { gl } = build();
    const disabled = gl.callsTo('disable').map((call) => call.args[0]);

    expect(disabled).toContain(gl.DEPTH_TEST);
    expect(disabled).toContain(gl.CULL_FACE);
    expect(disabled).toContain(gl.BLEND);
  });

  it('binds no buffers and no vertex array', () => {
    // The triangle comes out of gl_VertexID. If this ever starts failing,
    // something has reintroduced a vertex buffer that nothing needs.
    const { gl } = build();
    const methods = gl.calls.map((call) => call.method);

    expect(methods.some((method) => method.includes('Buffer'))).toBe(false);
    expect(methods.some((method) => method.includes('VertexArray'))).toBe(false);
    expect(methods.some((method) => method.includes('Attrib'))).toBe(false);
  });

  it('measures the canvas once at construction', () => {
    const { gl } = build({ width: 800, height: 600 });
    gl.calls.length = 0;
    // Nothing further should touch layout until something asks it to.
    expect(gl.called('viewport')).toBe(false);
  });
});

describe('rendering a frame', () => {
  it('draws exactly one triangle, with no indices and no instancing', () => {
    const { gl, renderer } = build();
    renderer.render(frame(), at(NIGHT));

    const draws = gl.callsTo('drawArrays');
    expect(draws).toHaveLength(1);
    expect(draws[0].args).toEqual([gl.TRIANGLES, 0, 3]);
  });

  it('writes every uniform the shader declares', () => {
    // A uniform never written holds whatever the driver initialised it to,
    // which for the camera is the origin and for the step counts is zero — a
    // black screen, with nothing in the console.
    const { gl, renderer } = build();
    renderer.render(frame({ simulatedSeconds: 3 }), at(NIGHT));

    for (const name of [
      'uResolution',
      'uTime',
      'uEye',
      'uTarget',
      'uRoll',
      'uMarchSteps',
      'uShadowSteps',
      'uVolumetricSamples',
    ]) {
      expect(gl.uniformValue(name), `${name} was never written`).not.toBeNull();
    }
  });

  it('sends the drawing-buffer size as the resolution, not the CSS size', () => {
    // The shader divides by this to build its rays. Handing it CSS pixels while
    // the buffer is a different size skews the aspect ratio, which reads as the
    // room being subtly the wrong shape and is very hard to see directly.
    const { gl, renderer, canvas } = build({ width: 1000, height: 500 });
    renderer.render(frame(), at(NIGHT));

    expect(gl.uniformValue('uResolution')).toEqual([canvas.width, canvas.height]);
  });

  it('sends the camera pose the drift function produced', () => {
    const { gl, renderer } = build();
    renderer.render(frame({ simulatedSeconds: 12.5 }), at(NIGHT));

    const pose = breathe(12.5);
    expect(gl.uniformValue('uEye')).toEqual([pose.eye.x, pose.eye.y, pose.eye.z]);
    expect(gl.uniformValue('uTarget')).toEqual([pose.target.x, pose.target.y, pose.target.z]);
    expect(gl.uniformValue('uRoll')).toEqual([pose.roll]);
  });

  it('interpolates across the leftover of the fixed step', () => {
    // Without this a display that does not divide evenly into 120Hz shows the
    // camera stepping between two positions in a pattern that beats against the
    // refresh rate — which looks like a dropped frame and is not one.
    const { gl, renderer } = build();

    renderer.render(frame({ simulatedSeconds: 4, alpha: 0 }), at(NIGHT));
    const atTick = gl.uniformValue('uTime')?.[0];

    renderer.render(frame({ simulatedSeconds: 4, alpha: 0.5 }), at(NIGHT));
    const between = gl.uniformValue('uTime')?.[0];

    expect(atTick).toBe(4);
    expect(between).toBeCloseTo(4 + (0.5 * FIXED_STEP_MS) / 1000, 10);
  });

  it('sends the step counts as integers', () => {
    // `uniform1f` into an `int` uniform is a GL_INVALID_OPERATION that shows up
    // as nothing at all in production.
    const { gl, renderer } = build();
    renderer.render(frame(), at(NIGHT));

    const integerCalls = gl
      .callsTo('uniform1i')
      .map((call) => (call.args[0] as { name: string }).name);
    expect(integerCalls).toEqual(
      expect.arrayContaining(['uMarchSteps', 'uShadowSteps', 'uVolumetricSamples'])
    );
  });

  it('starts at full detail', () => {
    const { gl, renderer } = build();
    renderer.render(frame(), at(NIGHT));

    expect(gl.uniformValue('uMarchSteps')).toEqual([QUALITY_TIERS[0].marchSteps]);
  });

  it('reports having drawn', () => {
    expect(build().renderer.render(frame(), at(NIGHT))).toBe(true);
  });
});

describe('the light rig', () => {
  it('writes every uniform the rig carries', () => {
    // Same argument as the camera uniforms above, and with a sharper edge: a rig
    // field added here and forgotten in `render` leaves that uniform holding
    // whatever the last state set it to, so the room is lit for one hour and
    // dressed for another. `npm run verify:shader` catches the other half — a
    // uniform written here that the shader does not declare.
    const { gl, renderer } = build();
    renderer.render(frame(), at(NIGHT));

    for (const name of [
      'uKeyDirection',
      'uKeyColour',
      'uKeyStrength',
      'uPaneColour',
      'uPaneStrength',
      'uLampStrength',
      'uAmbientFloor',
      'uAmbientSky',
      'uDust',
      'uShutter',
      'uBleach',
      'uExposure',
      'uThreshold',
    ]) {
      expect(gl.uniformValue(name), `${name} was never written`).not.toBeNull();
    }
  });

  it('sends the hour it was handed, not a remembered one', () => {
    // The rig is a per-frame argument precisely so that the sun moving needs no
    // state anywhere in the renderer. If this ever fails, something has started
    // caching it.
    const { gl, renderer } = build();

    renderer.render(frame(), at(LIGHT_RIGS.open));
    expect(gl.uniformValue('uShutter')).toEqual([0]);
    expect(gl.uniformValue('uLampStrength')).toEqual([LIGHT_RIGS.open.lampStrength]);

    renderer.render(frame(), at(LIGHT_RIGS.shuttered));
    expect(gl.uniformValue('uShutter')).toEqual([1]);
    expect(gl.uniformValue('uLampStrength')).toEqual([0]);
  });

  it('puts the daylight under the door only for a visitor who let themselves in', () => {
    // The invitation's whole effect on the render. Everything else about the
    // frame is the night piece exactly as it stands.
    const { gl, renderer } = build();

    renderer.render(frame(), at(rigFor('shuttered', false)));
    expect(gl.uniformValue('uThreshold')).toEqual([0]);

    renderer.render(frame(), at(rigFor('shuttered', true)));
    expect(gl.uniformValue('uThreshold')).toEqual([INVITED_THRESHOLD]);
    // …and the room around it is the night room, not a lit one.
    expect(gl.uniformValue('uShutter')).toEqual([0]);
  });
});

describe('sizing', () => {
  it('sets the drawing buffer from the measured size and the pixel ratio', () => {
    const { canvas, renderer } = build({ width: 640, height: 480 });
    renderer.render(frame(), at(NIGHT));

    // jsdom reports a device pixel ratio of 1.
    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(480);
  });

  it('issues a viewport only when the buffer actually changed', () => {
    // Assigning `canvas.width` reallocates and clears the buffer even when the
    // value is identical; doing it per frame is a full-screen clear at 60Hz.
    const { gl, renderer } = build();

    renderer.render(frame(), at(NIGHT));
    expect(gl.callsTo('viewport')).toHaveLength(1);

    renderer.render(frame(), at(NIGHT));
    renderer.render(frame(), at(NIGHT));
    expect(gl.callsTo('viewport')).toHaveLength(1);
  });

  it('resizes after the canvas is re-measured', () => {
    const gl = new StubWebGL2();
    const canvas = stubCanvas(gl, { width: 800, height: 600 });
    const renderer = HotelRenderer.create(canvas) as HotelRenderer;

    renderer.render(frame(), at(NIGHT));
    expect(canvas.width).toBe(800);

    canvas.getBoundingClientRect = () => ({ width: 400, height: 300 }) as DOMRect;
    renderer.measure();
    renderer.render(frame(), at(NIGHT));

    expect(canvas.width).toBe(400);
    expect(gl.callsTo('viewport')).toHaveLength(2);
  });

  it('holds the pixel ceiling on a very large canvas', () => {
    const { canvas, renderer } = build({ width: 3840, height: 2160 });
    renderer.render(frame(), at(NIGHT));

    expect(canvas.width * canvas.height).toBeLessThanOrEqual(MAX_DRAWING_BUFFER_PIXELS + 2000);
  });
});

describe('the quality governor, end to end', () => {
  /** Push enough slow frames through to force one judgement. */
  const struggle = (renderer: HotelRenderer, frames = WINDOW_FRAMES): void => {
    for (let index = 0; index < frames; index += 1) {
      renderer.render(frame({ frameMs: DEMOTE_ABOVE_MS + 8 }), at(NIGHT));
    }
  };

  it('drops the march steps it sends once the machine misses the budget', () => {
    const { gl, renderer } = build();
    struggle(renderer);

    expect(gl.uniformValue('uMarchSteps')).toEqual([QUALITY_TIERS[1].marchSteps]);
    expect(gl.uniformValue('uVolumetricSamples')).toEqual([QUALITY_TIERS[1].volumetricSamples]);
  });

  it('reports the rung it is on, and what it has to say about it', () => {
    const { renderer } = build();
    expect(renderer.report.tier.id).toBe(0);
    expect(renderer.report.tier.note).toBeNull();

    struggle(renderer);

    expect(renderer.report.tier.id).toBe(1);
    expect(renderer.report.tier.note).not.toBeNull();
  });

  it('reports the upscale factor when there is one', () => {
    const { renderer } = build({ width: 2560, height: 1440 });
    expect(renderer.report.scale).toBeLessThan(1);
  });

  it('reports one-to-one when there is not', () => {
    expect(build({ width: 1280, height: 720 }).renderer.report.scale).toBe(1);
  });
});

describe('a context that goes away', () => {
  it('draws nothing and says so when the context is lost', () => {
    const gl = new StubWebGL2();
    const renderer = HotelRenderer.create(stubCanvas(gl)) as HotelRenderer;

    gl.contextLost = true;
    gl.calls.length = 0;

    expect(renderer.render(frame(), at(NIGHT))).toBe(false);
    expect(gl.called('drawArrays')).toBe(false);
  });

  it('cannot be built on a context that is already gone', () => {
    // The renderer reports false rather than throwing, and the component stops
    // the loop on it — a loop calling into a dead context burns a core for as
    // long as the tab is open.
    const gl = new StubWebGL2({ contextLost: true });
    const renderer = HotelRenderer.create(stubCanvas(gl)) as HotelRenderer;

    expect(renderer.render(frame(), at(NIGHT))).toBe(false);
  });
});

describe('disposal', () => {
  it('deletes the program and releases the context', () => {
    // The important half. This is a lazily routed page: navigating away destroys
    // the component but not the GPU allocation, and a visitor wandering between
    // routes can accumulate contexts until the browser evicts somebody else's.
    const { gl, renderer } = build();
    renderer.dispose();

    expect(gl.called('deleteProgram')).toBe(true);
    expect(gl.callsTo('getExtension').map((call) => call.args[0])).toContain('WEBGL_lose_context');
    expect(gl.contextLost).toBe(true);
  });

  it('refuses to draw afterwards', () => {
    const { renderer } = build();
    renderer.dispose();

    expect(renderer.render(frame(), at(NIGHT))).toBe(false);
  });

  it('is idempotent', () => {
    const { gl, renderer } = build();
    renderer.dispose();
    renderer.dispose();

    expect(gl.callsTo('deleteProgram')).toHaveLength(1);
  });

  it('does not try to delete anything on an already-lost context', () => {
    // Every GL object belonging to a lost context is already gone; calling
    // delete on one is at best a no-op and at worst an error nobody sees.
    const gl = new StubWebGL2();
    const renderer = HotelRenderer.create(stubCanvas(gl)) as HotelRenderer;

    gl.contextLost = true;
    renderer.dispose();

    expect(gl.called('deleteProgram')).toBe(false);
  });
});
