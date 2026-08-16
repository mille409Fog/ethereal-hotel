/**
 * A WebGL2 context that records what was asked of it.
 *
 * jsdom implements no WebGL at all, and a headless browser is a heavy thing to
 * boot for the question "did the renderer set the resolution uniform". So the
 * GL-facing code in `gl/` and `renderer.ts` is written against the
 * `WebGL2RenderingContext` interface and driven, under test, by this.
 *
 * What that does and does not buy is worth being honest about. It proves the
 * *protocol*: that shaders are compiled before they are linked, that a failed
 * compile deletes its shader instead of leaking it, that the drawing buffer is
 * only resized when its size changed, that every uniform the program declares is
 * written each frame. It proves nothing whatsoever about whether the image is
 * right — no stub can, because the thing being tested would be the driver. That
 * half is checked by `scripts/verify-shader.mjs`, which compiles the real source
 * in a real browser, and in the end by looking at it.
 *
 * Excluded from coverage by `coverageExclude` in angular.json: it is a test
 * double, and holding a test double to a coverage threshold produces tests
 * written to exercise the double rather than the code.
 */

/** Which calls should fail, for the paths that only exist to handle failure. */
export interface IStubFailures {
  createShader?: boolean;
  createProgram?: boolean;
  compile?: boolean;
  link?: boolean;
  contextLost?: boolean;
}

/** One recorded call: the method name and the arguments it was given. */
export interface IRecordedCall {
  readonly method: string;
  readonly args: readonly unknown[];
}

let nextHandle = 1;

/** An opaque GL object. Identity is all the code under test uses. */
function handle(kind: string): object {
  nextHandle += 1;
  return { kind, id: nextHandle };
}

/**
 * The uniforms the stub claims the program declares. Matches the real shader's
 * list so a renderer test that writes an undeclared uniform is visible as a
 * missing location rather than passing silently.
 */
export const STUB_UNIFORM_NAMES = [
  'uResolution',
  'uTime',
  'uEye',
  'uTarget',
  'uRoll',
  'uDepth',
  'uMarchSteps',
  'uShadowSteps',
  'uVolumetricSamples',
  // Every floor's light rig — see rooms/light-rig.ts and its three twins. This
  // half of the list is checked against the real program by `npm run
  // verify:shader`, which links the actual GLSL and reads its reflection back;
  // here it only has to stay in step, and a uniform missing from it presents as
  // "never written" in renderer.spec.ts.
  //
  // Everything below `uThreshold` was missing until Floor −3 landed, and the
  // consequence was quieter than it looks: `uniformLocations` never handed the
  // renderer a location for those names, so `at()` returned null, the writes went
  // to a no-op, and every assertion about them would have read as "never written"
  // whether the renderer wrote them or not. Two floors' worth of uniforms were
  // untestable rather than untested.
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
  'uSconceColour',
  'uSconceStrength',
  'uShaftDirection',
  'uShaftColour',
  'uShaftStrength',
  'uCorridorFloor',
  'uCorridorSky',
  'uCorridorDust',
  'uReadingColour',
  'uReadingStrength',
  'uInk',
  'uLibraryExposure',
  'uLibraryFloor',
  'uLibrarySky',
  'uLibraryDust',
  'uCandleColour',
  'uCandleStrength',
  'uAdaptation',
  'uCellarExposure',
  'uCellarFloor',
  'uCellarSky',
  'uCellarDust',
  // The visitor, not a rig — see cellar.ts. The only two uniforms in the piece
  // that are about the person rather than the building or the sun.
  'uStillness',
  'uBreath',
] as const;

export class StubWebGL2 {
  public readonly VERTEX_SHADER = 0x8b31;
  public readonly FRAGMENT_SHADER = 0x8b30;
  public readonly COMPILE_STATUS = 0x8b81;
  public readonly LINK_STATUS = 0x8b82;
  public readonly ACTIVE_UNIFORMS = 0x8b86;
  public readonly TRIANGLES = 0x0004;
  public readonly DEPTH_TEST = 0x0b71;
  public readonly CULL_FACE = 0x0b44;
  public readonly BLEND = 0x0be2;

  /** Every call, in order. The assertions are mostly about this. */
  public readonly calls: IRecordedCall[] = [];

  /** Shader sources by handle, so a test can check what was compiled. */
  public readonly sources = new Map<object, string>();

  /** Shader and program handles the code under test never deleted. */
  public readonly live = new Set<object>();

  /** Uniform locations, by name, so the same name resolves to the same object. */
  public readonly locations = new Map<string, { kind: string; name: string }>();

  public compileLog = 'ERROR: 0:3: undeclared identifier';
  public linkLog = 'ERROR: link failed';

  /** Set by `loseContext`, or up front through the failures object. */
  public contextLost: boolean;

  public readonly loseContextExtension = { loseContext: (): void => this.loseContext() };

  private readonly failures: IStubFailures;
  private readonly uniformNames: readonly string[];

  constructor(failures: IStubFailures = {}, uniformNames: readonly string[] = STUB_UNIFORM_NAMES) {
    this.failures = failures;
    this.uniformNames = uniformNames;
    this.contextLost = failures.contextLost === true;
  }

  /** Present the stub as the interface the production code is typed against. */
  public asContext(): WebGL2RenderingContext {
    return this as unknown as WebGL2RenderingContext;
  }

  /** Every call to `method`, in order. */
  public callsTo(method: string): readonly IRecordedCall[] {
    return this.calls.filter((call) => call.method === method);
  }

  /** Whether `method` was called at all. */
  public called(method: string): boolean {
    return this.calls.some((call) => call.method === method);
  }

  /** The index of the first call to `method`, or -1. Used for ordering assertions. */
  public firstIndexOf(method: string): number {
    return this.calls.findIndex((call) => call.method === method);
  }

  // -- shaders --------------------------------------------------------------

  public createShader(type: number): object | null {
    this.record('createShader', type);
    if (this.failures.createShader === true) {
      return null;
    }
    const shader = handle('shader');
    this.live.add(shader);
    return shader;
  }

  public shaderSource(shader: object, source: string): void {
    this.record('shaderSource', shader, source);
    this.sources.set(shader, source);
  }

  public compileShader(shader: object): void {
    this.record('compileShader', shader);
  }

  public getShaderParameter(shader: object, parameter: number): boolean {
    this.record('getShaderParameter', shader, parameter);
    return this.failures.compile !== true;
  }

  public getShaderInfoLog(shader: object): string {
    this.record('getShaderInfoLog', shader);
    return this.compileLog;
  }

  public deleteShader(shader: object): void {
    this.record('deleteShader', shader);
    this.live.delete(shader);
  }

  // -- programs -------------------------------------------------------------

  public createProgram(): object | null {
    this.record('createProgram');
    if (this.failures.createProgram === true) {
      return null;
    }
    const program = handle('program');
    this.live.add(program);
    return program;
  }

  public attachShader(program: object, shader: object): void {
    this.record('attachShader', program, shader);
  }

  public detachShader(program: object, shader: object): void {
    this.record('detachShader', program, shader);
  }

  public linkProgram(program: object): void {
    this.record('linkProgram', program);
  }

  public getProgramParameter(program: object, parameter: number): boolean | number {
    this.record('getProgramParameter', program, parameter);
    if (parameter === this.ACTIVE_UNIFORMS) {
      return this.uniformNames.length;
    }
    return this.failures.link !== true;
  }

  public getProgramInfoLog(program: object): string {
    this.record('getProgramInfoLog', program);
    return this.linkLog;
  }

  public deleteProgram(program: object): void {
    this.record('deleteProgram', program);
    this.live.delete(program);
  }

  public getActiveUniform(program: object, index: number): { name: string } | null {
    this.record('getActiveUniform', program, index);
    const name = this.uniformNames[index];
    return name === undefined ? null : { name };
  }

  public getUniformLocation(program: object, name: string): object {
    this.record('getUniformLocation', program, name);
    const existing = this.locations.get(name);
    if (existing !== undefined) {
      return existing;
    }
    const location = { kind: 'uniform', name };
    this.locations.set(name, location);
    return location;
  }

  /**
   * The arguments of the most recent `uniform*` call for a named uniform, or
   * `null` if it was never written. Reading uniforms back by name is the only
   * way a renderer test can assert what a frame actually said.
   */
  public uniformValue(name: string): readonly number[] | null {
    for (let index = this.calls.length - 1; index >= 0; index -= 1) {
      const call = this.calls[index];
      if (!call.method.startsWith('uniform')) {
        continue;
      }
      const location = call.args[0] as { name?: string } | null;
      if (location?.name === name) {
        return call.args.slice(1) as number[];
      }
    }
    return null;
  }

  public useProgram(program: object | null): void {
    this.record('useProgram', program);
  }

  // -- state and drawing ----------------------------------------------------

  public disable(capability: number): void {
    this.record('disable', capability);
  }

  public viewport(x: number, y: number, width: number, height: number): void {
    this.record('viewport', x, y, width, height);
  }

  public uniform1f(location: object | null, x: number): void {
    this.record('uniform1f', location, x);
  }

  public uniform1i(location: object | null, x: number): void {
    this.record('uniform1i', location, x);
  }

  public uniform2f(location: object | null, x: number, y: number): void {
    this.record('uniform2f', location, x, y);
  }

  public uniform3f(location: object | null, x: number, y: number, z: number): void {
    this.record('uniform3f', location, x, y, z);
  }

  public drawArrays(mode: number, first: number, count: number): void {
    this.record('drawArrays', mode, first, count);
  }

  // -- context lifetime -----------------------------------------------------

  public isContextLost(): boolean {
    return this.contextLost;
  }

  public loseContext(): void {
    this.record('loseContext');
    this.contextLost = true;
  }

  public getExtension(name: string): unknown {
    this.record('getExtension', name);
    return name === 'WEBGL_lose_context' ? this.loseContextExtension : null;
  }

  private record(method: string, ...args: unknown[]): void {
    this.calls.push({ method, args });
  }
}

/**
 * A canvas whose `getContext` returns `context`, or `null` for the
 * no-WebGL2 path. Real element, stubbed context: the size handling under test
 * is DOM behaviour and should stay so.
 */
export function stubCanvas(
  context: StubWebGL2 | null,
  size: { width: number; height: number } = { width: 1280, height: 720 }
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.getContext = (() =>
    context === null ? null : context.asContext()) as typeof canvas.getContext;
  canvas.getBoundingClientRect = () =>
    ({
      width: size.width,
      height: size.height,
      top: 0,
      left: 0,
      right: size.width,
      bottom: size.height,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  return canvas;
}
