/**
 * The renderer: about two hundred lines between a canvas and a hotel.
 *
 * AUBADE's placement note budgets "about 400 lines of TypeScript for context,
 * resize, timing and hot-swap" and rules out three.js — not on principle, but
 * because a fully raymarched interior needs no scene graph, no loader and no
 * material system, so a 600KB dependency would buy nothing. This file, plus `gl/`,
 * is what that sentence costs to keep.
 *
 * Three things here are worth reading before changing anything.
 *
 * **Nothing measures the DOM on a frame.** `getBoundingClientRect` forces a layout
 * flush, and doing that sixty times a second to discover that the window is the
 * same size it was is the classic way a WebGL page ends up spending more time in
 * the compositor than in the shader. The CSS size is cached and only re-read when
 * `measure()` is called, which the component does from a `ResizeObserver` — an
 * event that fires when the answer has actually changed.
 *
 * **Sub-tick interpolation is real.** The loop runs at a fixed 120Hz and hands back
 * an `alpha` for the leftover; the camera is evaluated at
 * `simulatedSeconds + alpha × step` rather than at the tick boundary. Without it, a
 * 100Hz display would show the camera stepping between two positions in a pattern
 * that beats against the refresh rate, which looks like a dropped frame and is not
 * one.
 *
 * **There is still exactly one program.** Five floors, a lift between them, and
 * one compile — see the file comment on `rooms/hotel.frag.ts`. The depth is a
 * uniform, all five floors' rigs are uploaded every frame, and the shader's own
 * branches decide what to spend anything on. Uploading four rigs nobody is looking
 * at costs a couple of dozen uniform writes, which is nothing next to a single
 * `mapScene` call; compiling a second program at the moment the lift doors close
 * would cost a stalled driver in the middle of the piece's one transition.
 *
 * **One floor's clock is not the room's clock, and this file is where that
 * happens.** Floor −4 runs on a projector, and `render` quantises the second it
 * poses the camera at by the same arithmetic that decides which frame is in the gate
 * — see `projection.ts`, which explains why that has to be on this side of the
 * uniform upload rather than in the shader. It is the only place in this renderer
 * where a floor reaches out and changes something above it.
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
import { benchMask, filmFrameAt, type IBench, type IFilmFrame } from './projection';
import { migrationAt, SENTENCE_ATLAS_PATH } from './sentence';
import { FULLSCREEN_VERTEX_SHADER } from './rooms/fullscreen.vert';
import type { ICellarRig } from './rooms/cellar-rig';
import type { ICorridorRig } from './rooms/corridor-rig';
import { HOTEL_FRAGMENT_SHADER } from './rooms/hotel.frag';
import type { ILibraryRig } from './rooms/library-rig';
import type { ILightRig } from './rooms/light-rig';
import type { IProjectionRig } from './rooms/projection-rig';

/** What the renderer will say about itself, for the caption under the canvas. */
export interface IRenderReport {
  /** The rung of the detail ladder currently in use. */
  readonly tier: IQualityTier;

  /** Drawn pixels per CSS pixel along one axis. Below 1 means an upscale. */
  readonly scale: number;
}

/**
 * Where the hotel is, for one frame.
 *
 * All five floors' rigs travel together whether or not the lift is moving, because
 * during the ride two rooms are lit at once and afterwards the cost of the ones
 * nobody is in is a couple of dozen uniform writes.
 */
export interface IHotelFrame {
  /** Floor 0's rig — see `rooms/light-rig.ts`. */
  readonly lobby: ILightRig;

  /** Floor −1's rig — see `rooms/corridor-rig.ts`. */
  readonly corridor: ICorridorRig;

  /** Floor −2's rig — see `rooms/library-rig.ts`. */
  readonly library: ILibraryRig;

  /** Floor −3's rig — see `rooms/cellar-rig.ts`. */
  readonly cellar: ICellarRig;

  /** Floor −4's rig — see `rooms/projection-rig.ts`. */
  readonly projection: IProjectionRig;

  /**
   * The lift, as floors below the lobby: 0 is the lobby's distance field exactly,
   * 1 the corridor's, 2 the library's, 3 the cellar's, 4 the projection box's, and
   * between any adjacent pair the shader mixes them. From `descent.ts`, where the
   * requirement that the endpoints be exact is spelled out.
   */
  readonly depth: number;

  /**
   * Which of the projectionist's six switches are down — see `projection.ts`.
   *
   * Like `stillness`, this is not a fact about the hotel or about the sun, and it is
   * here rather than in a rig for that reason. Unlike `stillness` it is not a fact
   * about the visitor either: it is the state of a machine they have been given the
   * controls to. Read by Floor −4 and by nothing else.
   */
  readonly bench: IBench;

  /**
   * How long the visitor has kept still, in [0, 1] — see `cellar.ts`.
   *
   * The only quantity in this interface that is about the person rather than the
   * building or the sun, and it is here rather than in a rig for exactly that
   * reason: a rig is what an hour looks like, and no hour knows how anybody is
   * behaving. Read by Floor −3 and by nothing else.
   */
  readonly stillness: number;

  /** Where the 4-7-8 cycle has got to, in [0, 1] — see `cellar.ts`. */
  readonly breath: number;
}

export class HotelRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly uniforms: Map<string, WebGLUniformLocation | null>;

  private readonly sentence: WebGLTexture | null;

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

    this.sentence = this.createSentenceTexture();
    void this.loadSentence();

    this.measure();
  }

  /**
   * The atlas's texture, bound immediately and empty.
   *
   * One byte of zero, which the shader reads as "a long way outside every stroke" —
   * so between the first frame and the atlas arriving over the network, Floor −2 is
   * a fully lit library with a bare stone band above the shelving. That is not a
   * loading state dressed up: it is *exactly* the picture the room shows at noon,
   * when `uInk` is zero and there is nothing written anywhere in it. So a visitor on
   * a slow connection sees the room in one of its real states rather than a hole,
   * and if the fetch fails outright they keep it.
   *
   * @returns The texture, or `null` where there is no context to make one on.
   */
  private createSentenceTexture(): WebGLTexture | null {
    const gl = this.gl;
    const texture = gl.createTexture();
    if (texture === null) {
      return null;
    }

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    // A 1024-wide R8 row is a multiple of four and would not need this; the 1×1
    // placeholder below is not, and an alignment fault here is a diagonal smear
    // rather than an error.
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([0]));

    // Linear, and no mip chain. The shader's fetches are all `textureLod` at level
    // zero — see `sentenceAt` — because it samples from non-uniform control flow,
    // where implicit derivatives are undefined. The level of detail is done in the
    // shader by widening the contour with distance instead.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    // Repeating across, because the inscription repeats along the run and the seam
    // between one cutting of it and the next has to filter across correctly. Clamped
    // up and down, because the stack of lines has no wrap: a fetch off the top of
    // the first script must not return the bottom of the last.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.uniform1i(this.at('uSentence'), 0);
    return texture;
  }

  /**
   * Fetch the built atlas and upload it, if this browser and this page can.
   *
   * Deliberately not awaited by anything and deliberately unable to fail loudly. The
   * route's second non-negotiable is that the piece never blocks, and a sentence is
   * not a precondition for a hotel: every failure below leaves the placeholder in
   * place and the library rendering the picture described on `createSentenceTexture`.
   *
   * `colorSpaceConversion: 'none'` is the line that matters. The atlas is a sampled
   * distance function that happens to be shaped like a greyscale image, and a browser
   * that helpfully colour-manages it moves every contour in the room.
   */
  private async loadSentence(): Promise<void> {
    // Reached through `window` for the same reason `pixelRatio` is: this file is
    // linted with no assumed globals, and a bare `fetch` is an undeclared identifier
    // rather than a browser API.
    if (this.sentence === null || typeof window.createImageBitmap !== 'function') {
      return;
    }

    try {
      const response = await window.fetch(SENTENCE_ATLAS_PATH);
      if (!response.ok) {
        return;
      }

      const bitmap = await window.createImageBitmap(await response.blob(), {
        colorSpaceConversion: 'none',
        premultiplyAlpha: 'none',
      });

      if (this.disposed || this.gl.isContextLost()) {
        bitmap.close();
        return;
      }

      const gl = this.gl;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.sentence);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, bitmap);
      bitmap.close();
    } catch {
      // An offline visitor, a blocked request, a decoder that will not take the
      // file: all of them are the shuttered library, which is a real room.
    }
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
  public static create(canvas: HTMLCanvasElement): HotelRenderer | null {
    const gl = createRenderingContext(canvas);
    if (gl === null) {
      return null;
    }

    try {
      const program = linkProgram(gl, FULLSCREEN_VERTEX_SHADER, HOTEL_FRAGMENT_SHADER);
      return new HotelRenderer(canvas, gl, program);
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
      HotelRenderer.pixelRatio(),
      tier.renderScale
    );
    return { tier, scale: size.scale };
  }

  /**
   * Draw one frame.
   *
   * @param frame Timing from the fixed-step loop.
   * @param hotel The hour's four rigs, where the lift is, and how still the
   *   visitor has been. Passed per frame rather than held, because the renderer has
   *   no business knowing when the sun moved, when somebody pressed the lift call
   *   button, or whether they have stopped fidgeting.
   * @returns Whether anything was drawn. `false` means the context was lost or the
   *   renderer disposed — the caller stops the loop rather than spinning on a dead
   *   context, which otherwise burns a core for as long as the tab is open.
   */
  public render(frame: IFrame, hotel: IHotelFrame): boolean {
    if (this.disposed || this.gl.isContextLost()) {
      return false;
    }

    const gl = this.gl;

    // The governor sees the frame *before* the tier is read, so a machine that
    // just missed the budget is helped on the next frame rather than the one
    // after it. That matters more now than it did with one room: the ride
    // evaluates both distance fields, so the frame the lift starts on is the most
    // expensive frame the piece ever draws.
    this.governor = observeFrame(this.governor, frame.frameMs);
    const tier = tierFor(this.governor);

    const size = drawingBufferSize(
      this.cssWidth,
      this.cssHeight,
      HotelRenderer.pixelRatio(),
      tier.renderScale
    );
    if (resizeDrawingBuffer(this.canvas, size)) {
      gl.viewport(0, 0, size.width, size.height);
    }

    // Interpolated across the leftover of the fixed step — see the file comment.
    const seconds = frame.simulatedSeconds + (frame.alpha * FIXED_STEP_MS) / 1000;

    // Which frame of film is in the gate, and how much of the frame is Floor −4.
    //
    // `held` is `floorWeight(4.0)` written in TypeScript, deliberately and to the
    // character, so the camera changes clock over exactly the stretch of the shaft in
    // which the room it is changing clock for is being drawn. `camera/drift.ts` does
    // the same thing for the cellar's gait one floor up.
    const struck = filmFrameAt(seconds, hotel.projection.rate);
    const held = Math.max(0, 1 - Math.abs(hotel.depth - 4));

    // The judder switch, and it is the only one of the six that is thrown here rather
    // than in the shader — because it is the only one that is not an effect. The
    // other five are things done to a picture; this one is the *clock the picture is
    // drawn on*, and the clock is upstream of the uniform upload.
    //
    // Note which half of the frame it releases. Turning judder off makes the motion
    // continuous and leaves the index where it was, so the room glides while its
    // grain, its splices and its cue dots go on counting frames of film. That is
    // exactly the right answer, because judder is when the picture is replaced and
    // the index is which piece of film it is — and it is also the more interesting
    // one to look at, since what a visitor gets is not "the effect off" but a print
    // that has been transferred to something that does not judder.
    const film =
      hotel.bench.judder || hotel.projection.rate <= 0
        ? struck
        : { time: seconds, index: struck.index };

    // The camera's clock, blended towards the projector's.
    //
    // This is the line that makes the judder a room rather than a filter. A picture
    // that steps while the viewpoint glides reads as an effect laid over a continuous
    // world — the eye takes the smooth motion as the truth — so on Floor −4 the eye
    // and the frame are evaluated at the same quantised second and step together.
    //
    // Written as `(1 − t)·a + t·b` for the reason `between` in `camera/drift.ts`
    // gives at length: it is exact at both ends. At every depth but the last it is
    // exactly `seconds`, so no other floor pays a rounding error for this floor's
    // idea, and at a settled depth of 4 it is exactly the film's own second.
    const cameraSeconds = seconds * (1 - held) + film.time * held;

    // The breath goes to the camera and to the shader from the same variable, so
    // the pose and `uBreath` cannot disagree about where in the cycle they are.
    const camera = breathe(cameraSeconds, hotel.depth, hotel.breath);

    gl.useProgram(this.program);
    gl.uniform2f(this.at('uResolution'), size.width, size.height);
    gl.uniform1f(this.at('uTime'), seconds);
    gl.uniform3f(this.at('uEye'), camera.eye.x, camera.eye.y, camera.eye.z);
    gl.uniform3f(this.at('uTarget'), camera.target.x, camera.target.y, camera.target.z);
    gl.uniform1f(this.at('uRoll'), camera.roll);
    gl.uniform1f(this.at('uDepth'), hotel.depth);
    gl.uniform1i(this.at('uMarchSteps'), tier.marchSteps);
    gl.uniform1i(this.at('uShadowSteps'), tier.shadowSteps);
    gl.uniform1i(this.at('uVolumetricSamples'), tier.volumetricSamples);

    const lobby = hotel.lobby;
    gl.uniform3f(
      this.at('uKeyDirection'),
      lobby.keyDirection.x,
      lobby.keyDirection.y,
      lobby.keyDirection.z
    );
    gl.uniform3f(this.at('uKeyColour'), ...lobby.keyColour);
    gl.uniform1f(this.at('uKeyStrength'), lobby.keyStrength);
    gl.uniform3f(this.at('uPaneColour'), ...lobby.paneColour);
    gl.uniform1f(this.at('uPaneStrength'), lobby.paneStrength);
    gl.uniform1f(this.at('uLampStrength'), lobby.lampStrength);
    gl.uniform3f(this.at('uAmbientFloor'), ...lobby.ambientFloor);
    gl.uniform3f(this.at('uAmbientSky'), ...lobby.ambientSky);
    gl.uniform1f(this.at('uDust'), lobby.dust);
    gl.uniform1f(this.at('uShutter'), lobby.shutter);
    gl.uniform1f(this.at('uBleach'), lobby.bleach);
    gl.uniform1f(this.at('uExposure'), lobby.exposure);
    gl.uniform1f(this.at('uThreshold'), lobby.threshold);

    const corridor = hotel.corridor;
    gl.uniform3f(this.at('uSconceColour'), ...corridor.sconceColour);
    gl.uniform1f(this.at('uSconceStrength'), corridor.sconceStrength);
    gl.uniform3f(
      this.at('uShaftDirection'),
      corridor.shaftDirection.x,
      corridor.shaftDirection.y,
      corridor.shaftDirection.z
    );
    gl.uniform3f(this.at('uShaftColour'), ...corridor.shaftColour);
    gl.uniform1f(this.at('uShaftStrength'), corridor.shaftStrength);
    gl.uniform3f(this.at('uCorridorFloor'), ...corridor.ambientFloor);
    gl.uniform3f(this.at('uCorridorSky'), ...corridor.ambientSky);
    gl.uniform1f(this.at('uCorridorDust'), corridor.dust);

    const library = hotel.library;
    gl.uniform3f(this.at('uReadingColour'), ...library.readingColour);
    gl.uniform1f(this.at('uReadingStrength'), library.readingStrength);
    gl.uniform1f(this.at('uInk'), library.inkStrength);
    gl.uniform1f(this.at('uLibraryExposure'), library.exposure);
    gl.uniform3f(this.at('uLibraryFloor'), ...library.ambientFloor);
    gl.uniform3f(this.at('uLibrarySky'), ...library.ambientSky);
    gl.uniform1f(this.at('uLibraryDust'), library.dust);

    // Which two writing systems the sentence is between, and how far. Evaluated at
    // the room's own clock rather than at the camera's: `cameraSeconds` is bent
    // towards the projector's quantised time near Floor −4, and the library is two
    // floors above the nearest place that is true.
    const migration = migrationAt(seconds);
    gl.uniform1f(this.at('uScriptFrom'), migration.from);
    gl.uniform1f(this.at('uScriptTo'), migration.to);
    gl.uniform1f(this.at('uMigration'), migration.across);

    const cellar = hotel.cellar;
    gl.uniform3f(this.at('uCandleColour'), ...cellar.candleColour);
    gl.uniform1f(this.at('uCandleStrength'), cellar.candleStrength);
    gl.uniform1f(this.at('uAdaptation'), cellar.adaptation);
    gl.uniform1f(this.at('uCellarExposure'), cellar.exposure);
    gl.uniform3f(this.at('uCellarFloor'), ...cellar.ambientFloor);
    gl.uniform3f(this.at('uCellarSky'), ...cellar.ambientSky);
    gl.uniform1f(this.at('uCellarDust'), cellar.dust);

    this.uploadProjection(hotel.projection, film, hotel.bench);

    // The visitor. Not from a rig, because neither is a fact about the hotel.
    gl.uniform1f(this.at('uStillness'), hotel.stillness);
    gl.uniform1f(this.at('uBreath'), hotel.breath);

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
      this.gl.deleteTexture(this.sentence);
      this.gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  }

  /**
   * Floor −4's rig, its projector and its bench.
   *
   * The one floor whose uniforms are lifted out of `render` into a method of their
   * own, and that is a line count rather than an architecture: this floor uploads
   * eleven names where the others upload seven or eight, and eleven more inline put
   * `render` over the lint config's cap. Extracting the one that broke the budget
   * rather than all five keeps the other four where a reader expects them, next to
   * the camera and the depth they are lit by.
   *
   * @param projection The hour's rig.
   * @param film Which frame of the show is in the gate — the same value the camera
   *   above was posed at, so the eye and the picture cannot disagree about which
   *   frame they are showing.
   * @param bench Which of the projectionist's six switches are down.
   */
  private uploadProjection(projection: IProjectionRig, film: IFilmFrame, bench: IBench): void {
    const gl = this.gl;

    gl.uniform3f(this.at('uArcColour'), ...projection.arcColour);
    gl.uniform1f(this.at('uArcStrength'), projection.arcStrength);
    gl.uniform1f(this.at('uBurn'), projection.burn);
    gl.uniform1f(this.at('uProjectionExposure'), projection.exposure);
    gl.uniform3f(this.at('uProjectionFloor'), ...projection.ambientFloor);
    gl.uniform3f(this.at('uProjectionSky'), ...projection.ambientSky);
    gl.uniform1f(this.at('uProjectionDust'), projection.dust);

    gl.uniform1f(this.at('uProjectorRate'), projection.rate);
    gl.uniform1f(this.at('uFilmTime'), film.time);
    gl.uniform1f(this.at('uFilmFrame'), film.index);
    gl.uniform1i(this.at('uStack'), benchMask(bench));
  }

  /** A uniform's location, or `null` — which `gl.uniform*` treats as a no-op. */
  private at(name: string): WebGLUniformLocation | null {
    return this.uniforms.get(name) ?? null;
  }

  /**
   * Read fresh rather than cached: a window dragged between a laptop screen and an
   * external monitor changes this without changing its own size, and
   * `drawingBufferSize` clamps whatever comes back — including the `undefined` a
   * very old browser might hand over.
   */
  private static pixelRatio(): number {
    return window.devicePixelRatio;
  }
}
