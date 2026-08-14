import { annotate, compileShader, linkProgram, ShaderError, uniformLocations } from './program';
import { STUB_UNIFORM_NAMES, StubWebGL2 } from './webgl.testing';

/**
 * Compiling and linking.
 *
 * These tests are about the *protocol* — the order calls are made in, and what
 * is cleaned up when one of them fails. They can say nothing at all about
 * whether the shader is correct, because the thing that decides that is the
 * driver. `scripts/verify-shader.mjs` compiles the real source in a real
 * browser; this checks that the code around it behaves when the driver says no.
 *
 * The leak cases are the reason this file is as long as it is. A shader object
 * that is never deleted is invisible: nothing fails, nothing warns, and the
 * driver holds the source and its intermediate representation for the lifetime
 * of the context. It is exactly the class of bug a stub is good at catching and
 * a human is not.
 */

const VERTEX = '#version 300 es\nvoid main() { gl_Position = vec4(0.0); }\n';
const FRAGMENT =
  '#version 300 es\nprecision highp float;\nout vec4 c;\nvoid main() { c = vec4(1.0); }\n';

describe('annotating a driver log', () => {
  it('quotes the line the driver pointed at', () => {
    const source = 'line one\nline two\nline three';
    const annotated = annotate(source, "ERROR: 0:2: 'foo' : undeclared identifier");

    expect(annotated).toContain('undeclared identifier');
    expect(annotated).toContain('2 | line two');
  });

  it('trims the quoted line, which is usually indented', () => {
    const annotated = annotate('a\n      indented();', 'ERROR: 0:2: bad');
    expect(annotated).toContain('2 | indented();');
  });

  it('returns the log unchanged when there is no line reference', () => {
    expect(annotate('a\nb', 'out of memory')).toBe('out of memory');
  });

  it('returns the log unchanged when the line is past the end of the source', () => {
    // A concatenated or preprocessed source can genuinely produce this, and the
    // failure path is the last place that should throw.
    expect(annotate('a\nb', 'ERROR: 0:900: bad')).toBe('ERROR: 0:900: bad');
  });

  it('survives an empty log', () => {
    expect(annotate('a', '')).toBe('');
  });
});

describe('compiling a shader', () => {
  it('sources, compiles and returns the shader', () => {
    const gl = new StubWebGL2();
    const shader = compileShader(gl.asContext(), gl.VERTEX_SHADER, VERTEX);

    expect(shader).not.toBeNull();
    expect(gl.sources.get(shader as object)).toBe(VERTEX);
    expect(gl.called('compileShader')).toBe(true);
  });

  it('sets the source before compiling it', () => {
    const gl = new StubWebGL2();
    compileShader(gl.asContext(), gl.VERTEX_SHADER, VERTEX);

    expect(gl.firstIndexOf('shaderSource')).toBeLessThan(gl.firstIndexOf('compileShader'));
  });

  it('throws with the offending line when the driver rejects the source', () => {
    const gl = new StubWebGL2({ compile: true });
    gl.compileLog = "ERROR: 0:2: 'q' : undeclared identifier";

    expect(() => compileShader(gl.asContext(), gl.FRAGMENT_SHADER, FRAGMENT)).toThrow(ShaderError);

    try {
      compileShader(gl.asContext(), gl.FRAGMENT_SHADER, FRAGMENT);
    } catch (error) {
      const shaderError = error as ShaderError;
      expect(shaderError.message).toContain('fragment shader did not compile');
      expect(shaderError.message).toContain('precision highp float;');
      expect(shaderError.log).toBe(gl.compileLog);
    }
  });

  it('names the stage that failed', () => {
    const gl = new StubWebGL2({ compile: true });
    expect(() => compileShader(gl.asContext(), gl.VERTEX_SHADER, VERTEX)).toThrow(/vertex shader/);
  });

  it('deletes the shader it could not compile', () => {
    const gl = new StubWebGL2({ compile: true });

    expect(() => compileShader(gl.asContext(), gl.VERTEX_SHADER, VERTEX)).toThrow();
    expect(gl.live.size).toBe(0);
  });

  it('reports a driver that will not allocate at all', () => {
    const gl = new StubWebGL2({ createShader: true });
    expect(() => compileShader(gl.asContext(), gl.VERTEX_SHADER, VERTEX)).toThrow(
      /would not allocate a shader/
    );
  });
});

describe('linking a program', () => {
  it('compiles both stages, attaches them and links', () => {
    const gl = new StubWebGL2();
    const program = linkProgram(gl.asContext(), VERTEX, FRAGMENT);

    expect(program).not.toBeNull();
    expect(gl.callsTo('compileShader')).toHaveLength(2);
    expect(gl.callsTo('attachShader')).toHaveLength(2);
    expect(gl.called('linkProgram')).toBe(true);
  });

  it('attaches both stages before linking', () => {
    const gl = new StubWebGL2();
    linkProgram(gl.asContext(), VERTEX, FRAGMENT);

    const lastAttach = gl.calls.map((call) => call.method).lastIndexOf('attachShader');
    expect(lastAttach).toBeLessThan(gl.firstIndexOf('linkProgram'));
  });

  it('detaches and deletes both shaders, leaving only the program', () => {
    // Standard hygiene, and worth the two extra calls here: the fragment source
    // is a very large string the piece has no further use for once it is a
    // linked program, and the driver holds it until the shader object goes.
    const gl = new StubWebGL2();
    const program = linkProgram(gl.asContext(), VERTEX, FRAGMENT);

    expect(gl.callsTo('detachShader')).toHaveLength(2);
    expect(gl.callsTo('deleteShader')).toHaveLength(2);
    expect([...gl.live]).toEqual([program]);
  });

  it('leaks nothing when the fragment stage fails after the vertex stage compiled', () => {
    // The awkward one. The vertex shader is already a live driver object at the
    // point the fragment shader throws, and the naïve version walks straight
    // past it.
    const gl = new StubWebGL2();
    let compiles = 0;
    gl.getShaderParameter = (): boolean => {
      compiles += 1;
      return compiles === 1;
    };

    expect(() => linkProgram(gl.asContext(), VERTEX, FRAGMENT)).toThrow(ShaderError);
    expect(gl.live.size).toBe(0);
  });

  it('deletes the program and both shaders when the link fails', () => {
    const gl = new StubWebGL2({ link: true });
    gl.linkLog = 'ERROR: too many varyings';

    expect(() => linkProgram(gl.asContext(), VERTEX, FRAGMENT)).toThrow(/did not link/);
    expect(gl.live.size).toBe(0);
  });

  it('carries the driver’s link log on the error', () => {
    const gl = new StubWebGL2({ link: true });
    gl.linkLog = 'ERROR: too many varyings';

    try {
      linkProgram(gl.asContext(), VERTEX, FRAGMENT);
      expect.unreachable('the link should have failed');
    } catch (error) {
      expect((error as ShaderError).log).toBe('ERROR: too many varyings');
    }
  });

  it('cleans up when the driver will not allocate a program', () => {
    const gl = new StubWebGL2({ createProgram: true });

    expect(() => linkProgram(gl.asContext(), VERTEX, FRAGMENT)).toThrow(
      /would not allocate a program/
    );
    expect(gl.live.size).toBe(0);
  });

  it('rethrows anything that is not a shader problem', () => {
    const gl = new StubWebGL2();
    gl.linkProgram = (): never => {
      throw new TypeError('the context went away');
    };

    expect(() => linkProgram(gl.asContext(), VERTEX, FRAGMENT)).toThrow(TypeError);
  });
});

describe('reflecting the uniforms', () => {
  it('finds a location for every uniform the program declares', () => {
    const gl = new StubWebGL2();
    const program = linkProgram(gl.asContext(), VERTEX, FRAGMENT);
    const locations = uniformLocations(gl.asContext(), program);

    // Against the stub's own list rather than a literal: the shader grew from
    // eight uniforms to twenty-one when the room started reading the clock, and
    // a number written out here would have failed for that with a message about
    // arithmetic rather than about uniforms.
    expect(locations.size).toBe(STUB_UNIFORM_NAMES.length);
    expect(locations.has('uResolution')).toBe(true);
    expect(locations.get('uTime')).not.toBeUndefined();
  });

  it('strips the array suffix drivers add', () => {
    // An array uniform is reported as `uThing[0]`; both spellings resolve, and
    // the bare name is the one a call site wants to write.
    const gl = new StubWebGL2({}, ['uPalette[0]', 'uTime']);
    const program = linkProgram(gl.asContext(), VERTEX, FRAGMENT);

    expect([...uniformLocations(gl.asContext(), program).keys()]).toEqual(['uPalette', 'uTime']);
  });

  it('skips an index the driver has nothing to say about', () => {
    const gl = new StubWebGL2({}, ['uTime']);
    const program = linkProgram(gl.asContext(), VERTEX, FRAGMENT);
    gl.getActiveUniform = (): null => null;

    expect(uniformLocations(gl.asContext(), program).size).toBe(0);
  });

  it('is reflected rather than listed, so an optimised-away uniform is simply absent', () => {
    // The reason this is reflection and not a hand-written list: a uniform the
    // compiler removed has no location, and a list would carry a null nobody
    // checked or drift from the shader.
    const gl = new StubWebGL2({}, []);
    const program = linkProgram(gl.asContext(), VERTEX, FRAGMENT);

    expect(uniformLocations(gl.asContext(), program).size).toBe(0);
  });
});
