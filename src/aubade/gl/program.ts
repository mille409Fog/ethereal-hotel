/**
 * Compiling and linking the one program this piece runs.
 *
 * Most of this file is error reporting, which is the right proportion. A shader
 * that fails to compile fails at runtime, on someone else's driver, in a
 * codebase where nothing else can go wrong that way — the TypeScript around it
 * is type-checked and the Python is `mypy --strict`. The GLSL is the only part
 * of the repository whose compiler runs after deployment, so the one thing that
 * cannot be skimped is what it says when it is unhappy.
 *
 * Drivers report errors as `ERROR: 0:214: 'foo' : undeclared identifier`. A log
 * line with a number in it and no source is close to useless when the source is
 * a template literal in another file, so `annotate` puts the offending line back
 * next to the complaint.
 */

/** A shader that would not compile, or a program that would not link. */
export class ShaderError extends Error {
  constructor(
    message: string,
    /** The driver's raw log, kept for the console even when the message is tidy. */
    public readonly log: string = ''
  ) {
    super(message);
    this.name = 'ShaderError';
  }
}

/** How drivers point at a line: `ERROR: 0:214:` — the second number is the line. */
const LOG_LINE_REFERENCE = /\b\d+:(\d+)\b/;

/**
 * Put the source line a driver complained about next to its complaint.
 *
 * @param source The shader source that was compiled.
 * @param log The driver's info log.
 * @returns The log, followed by the referenced line with its number, when one
 *   could be found; the log unchanged when it could not. Never throws — this
 *   runs on the failure path and must not have a failure path of its own.
 */
export function annotate(source: string, log: string): string {
  const reference = LOG_LINE_REFERENCE.exec(log);
  if (reference === null) {
    return log;
  }

  const lineNumber = Number(reference[1]);
  const lines = source.split('\n');
  const line = lines[lineNumber - 1];

  return line === undefined ? log : `${log}\n  ${lineNumber} | ${line.trim()}`;
}

/**
 * Compile one shader stage.
 *
 * @param gl The context.
 * @param type `gl.VERTEX_SHADER` or `gl.FRAGMENT_SHADER`.
 * @param source GLSL ES 3.00 source, `#version 300 es` on its first line.
 * @returns The compiled shader; the caller owns it and must delete it.
 * @throws ShaderError when the driver rejects the source, with the offending
 *   line quoted.
 */
export function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string
): WebGLShader {
  const shader = gl.createShader(type);
  if (shader === null) {
    throw new ShaderError('The driver would not allocate a shader object.');
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  // Deliberately not guarded by an `isContextLost` check first. `COMPILE_STATUS`
  // reports false on a lost context anyway, and the extra call costs a
  // synchronous round trip on every successful compile to save nothing.
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) !== true) {
    const log = gl.getShaderInfoLog(shader) ?? '';
    gl.deleteShader(shader);
    const stage = type === gl.VERTEX_SHADER ? 'vertex' : 'fragment';
    throw new ShaderError(`The ${stage} shader did not compile.\n${annotate(source, log)}`, log);
  }

  return shader;
}

/**
 * Compile both stages and link them.
 *
 * The two shader objects are detached and deleted whether or not the link
 * succeeded. They are reference-counted by the driver, so deleting them after
 * attachment frees their source and IR while leaving the linked program intact —
 * the standard hygiene, and worth doing here because the fragment source is a
 * large string this piece has no further use for once it is a program.
 *
 * @throws ShaderError when either stage fails to compile, or the link fails.
 */
export function linkProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string
): WebGLProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);

  let fragment: WebGLShader;
  try {
    fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  } catch (error) {
    // The vertex shader compiled and would otherwise leak on the way out.
    gl.deleteShader(vertex);
    throw error;
  }

  const program = gl.createProgram();
  if (program === null) {
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    throw new ShaderError('The driver would not allocate a program object.');
  }

  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);

  gl.detachShader(program, vertex);
  gl.detachShader(program, fragment);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);

  if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) {
    const log = gl.getProgramInfoLog(program) ?? '';
    gl.deleteProgram(program);
    throw new ShaderError(`The program did not link.\n${log}`, log);
  }

  return program;
}

/**
 * Look up every uniform the program declares, by name.
 *
 * Reflected out of the program rather than listed here, because a uniform the
 * compiler optimised away has no location and a hand-written list would either
 * carry a `null` nobody checked or drift from the shader. `gl.uniform*` with a
 * `null` location is a documented no-op, so a uniform that got optimised out
 * costs nothing at draw time and needs no branch at the call site.
 */
export function uniformLocations(
  gl: WebGL2RenderingContext,
  program: WebGLProgram
): Map<string, WebGLUniformLocation | null> {
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
  const locations = new Map<string, WebGLUniformLocation | null>();

  for (let index = 0; index < count; index += 1) {
    const info = gl.getActiveUniform(program, index);
    if (info === null) {
      continue;
    }
    // Array uniforms are reported as `uThing[0]`; both spellings resolve, and
    // the bare name is the one call sites want to write.
    const name = info.name.replace(/\[0\]$/, '');
    locations.set(name, gl.getUniformLocation(program, name));
  }

  return locations;
}
