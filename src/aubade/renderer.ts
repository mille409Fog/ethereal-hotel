/**
 * The renderer: about a hundred and fifty lines between a canvas and a room.
 *
 * AUBADE's placement note budgets "about 400 lines of TypeScript for context,
 * resize, timing and hot-swap" and rules out three.js — not on principle, but
 * because a fully raymarched interior needs no scene graph, no loader and no
 * material system, so a 600KB dependency would buy nothing. This file, plus
 * `gl/`, is what that sentence costs to keep.
 *
 * Two things here are worth reading before changing anything.
 *
 * **Nothing measures the DOM on a frame.** `getBoundingClientRect` forces a
 * layout flush, and doing that sixty times a second to discover that the window
 * is the same size it was is the classic way a WebGL page ends up spending more
 * time in the compositor than in the shader. The CSS size is cached and only
 * re-read when `measure()` is called, which the component does from a
 * `ResizeObserver` — an event that fires when the answer has actually changed.
 *
 * **Sub-tick interpolation is real.** The loop runs at a fixed 120Hz and hands
 * back an `alpha` for the leftover; the camera is evaluated at
 * `simulatedSeconds + alpha × step` rather than at the tick boundary. Without
 * it, a 100Hz display would show the camera stepping between two positions in a
 * pattern that beats against the refresh rate, which looks like a dropped frame
 * and is not one.
 */

import { breathe } from './camera/drift';
import { createRenderingContext } from './gl/context';
import { FIXED_STEP_MS, type IFrame } from './gl/loop';
import { linkProgram, ShaderError, uniformLocations } from './gl/program';
import {
  INITIAL_GOVERNOR,
  observeFrame,
  tierFor,
  type IGovernorState,
  type IQualityTier,
} from './gl/quality';
import { drawingBufferSize, resizeDrawingBuffer } from './gl/viewport';
import { FULLSCREEN_VERTEX_SHADER } from './rooms/fullscreen.vert';
import { LOBBY_FRAGMENT_SHADER } from './rooms/lobby.frag';

/** What the renderer will say about itself, for the caption under the canvas. */
export interface IRenderReport {
  /** The rung of the detail ladder currently in use. */
  readonly tier: IQualityTier;

  /** Drawn pixels per CSS pixel along one axis. Below 1 means an upscale. */
  readonly scale: number;
}

export class LobbyRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly uniforms: Map<string, WebGLUniformLocation | null>;

  private governor: IGovernorState = INITIAL_GOVERNOR;
  private cssWidth = 1;
  private cssHeight = 1;
  private disposed = false;

  private constructor(
    canvas: HTMLCanvasElement,
    gl: WebGL2RenderingContext,
    program: WebGLProgram
  ) {
    this.canvas = canvas;
    this.gl = gl;
    this.program = program;
    this.uniforms = uniformLocations(gl, program);

    gl.useProgram(program);
    // The one piece of fixed state this renderer has. There are no buffers to
    // bind, no vertex array to configure and no attributes to enable — the
    // triangle comes out of `gl_VertexID`. See `rooms/fullscreen.vert.ts`.
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);

    this.measure();
  }

  /**
   * Build a renderer for a canvas, or fail in one of the two ways that are not
   * bugs.
   *
   * @returns `null` when this browser has no WebGL2, or when the driver rejects
   *   the shader. Both are routes the piece has a real answer for — the caller
   *   shows the text version — so neither throws. A rejected shader is warned
   *   about on the console with the offending line, because unlike a missing
   *   context it usually *is* something to fix.
   */
  public static create(canvas: HTMLCanvasElement): LobbyRenderer | null {
    const gl = createRenderingContext(canvas);
    if (gl === null) {
      return null;
    }

    try {
      const program = linkProgram(gl, FULLSCREEN_VERTEX_SHADER, LOBBY_FRAGMENT_SHADER);
      return new LobbyRenderer(canvas, gl, program);
    } catch (error) {
      if (error instanceof ShaderError) {
        console.error(`[aubade] ${error.message}`);
        return null;
      }
      throw error;
    }
  }

  /**
   * Re-read the canvas's laid-out size.
   *
   * Called once at construction and thereafter only from the component's
   * `ResizeObserver`. See the file comment for why this is not done per frame.
   */
  public measure(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.cssWidth = rect.width;
    this.cssHeight = rect.height;
  }

  /** The tier and scale in force, for the caption. */
  public get report(): IRenderReport {
    const tier = tierFor(this.governor);
    const size = drawingBufferSize(
      this.cssWidth,
      this.cssHeight,
      LobbyRenderer.pixelRatio(),
      tier.renderScale
    );
    return { tier, scale: size.scale };
  }

  /**
   * Draw one frame.
   *
   * @returns Whether anything was drawn. `false` means the context was lost or
   *   the renderer disposed — the caller stops the loop rather than spinning on
   *   a dead context, which otherwise burns a core for as long as the tab is
   *   open.
   */
  public render(frame: IFrame): boolean {
    if (this.disposed || this.gl.isContextLost()) {
      return false;
    }

    const gl = this.gl;

    // The governor sees the frame *before* the tier is read, so a machine that
    // just missed the budget is helped on the next frame rather than the one
    // after it.
    this.governor = observeFrame(this.governor, frame.frameMs);
    const tier = tierFor(this.governor);

    const size = drawingBufferSize(
      this.cssWidth,
      this.cssHeight,
      LobbyRenderer.pixelRatio(),
      tier.renderScale
    );
    if (resizeDrawingBuffer(this.canvas, size)) {
      gl.viewport(0, 0, size.width, size.height);
    }

    // Interpolated across the leftover of the fixed step — see the file comment.
    const seconds = frame.simulatedSeconds + (frame.alpha * FIXED_STEP_MS) / 1000;
    const camera = breathe(seconds);

    gl.useProgram(this.program);
    gl.uniform2f(this.at('uResolution'), size.width, size.height);
    gl.uniform1f(this.at('uTime'), seconds);
    gl.uniform3f(this.at('uEye'), camera.eye.x, camera.eye.y, camera.eye.z);
    gl.uniform3f(this.at('uTarget'), camera.target.x, camera.target.y, camera.target.z);
    gl.uniform1f(this.at('uRoll'), camera.roll);
    gl.uniform1i(this.at('uMarchSteps'), tier.marchSteps);
    gl.uniform1i(this.at('uShadowSteps'), tier.shadowSteps);
    gl.uniform1i(this.at('uVolumetricSamples'), tier.volumetricSamples);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return true;
  }

  /**
   * Give everything back.
   *
   * The `WEBGL_lose_context` call is the part that matters. This is a lazily
   * routed page in a single-page app: navigating away destroys the component but
   * not the GPU allocation behind the canvas, and a visitor who wanders between
   * `/aubade` and `/dashboard` a few times can accumulate contexts until the
   * browser starts evicting the oldest — at which point some *other* tab's WebGL
   * goes black. Releasing it explicitly is a courtesy to the rest of the machine.
   */
  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    if (!this.gl.isContextLost()) {
      this.gl.deleteProgram(this.program);
      this.gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  }

  /** A uniform's location, or `null` — which `gl.uniform*` treats as a no-op. */
  private at(name: string): WebGLUniformLocation | null {
    return this.uniforms.get(name) ?? null;
  }

  /**
   * Read fresh rather than cached: a window dragged between a laptop screen and
   * an external monitor changes this without changing its own size, and
   * `drawingBufferSize` clamps whatever comes back — including the `undefined`
   * a very old browser might hand over.
   */
  private static pixelRatio(): number {
    return window.devicePixelRatio;
  }
}
