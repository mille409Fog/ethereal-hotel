/**
 * Holds Watershed's shaders to its reference model.
 *
 *     npm run verify:watershed
 *     npm run verify:watershed -- --verbose   # also print the nudged run's differences
 *     npm run verify:watershed -- --out land.png   # also draw a land, to look at
 *     npm run verify:watershed -- --out wet.png --raining   # the same land, still in the rain
 *
 * ## What this is for
 *
 * `/watershed` runs an erosion simulation on the GPU. The same simulation exists
 * in plain TypeScript, `src/app/watershed/model/step.ts`, where every pass has a
 * spec: rock is conserved, water runs downhill, the timestep is stable. None of
 * that says anything about the picture a visitor sees unless the shaders compute
 * what the model computes. This script is the only thing that says so. It raises
 * one land, runs it through both, and compares the results cell by cell.
 *
 * It is also these shaders' compiler. `tsc` cannot read GLSL, and the unit tests
 * drive a recording renderer that never looks at the source, so without this the
 * first compile would happen in a visitor's browser. `verify:shader` does the
 * same job for `/aubade` and its header says why at more length.
 *
 * ## How
 *
 * The shaders are run by a harness written here in raw WebGL2, not by the
 * route's three.js driver. That would look like testing a stand-in, except for
 * what the two share: `SIM_PASSES`, which says for every pass what it reads and
 * writes, `SIM_CONSTANTS`, which names the uniforms, and the packing functions
 * in `sim-layout.ts`. A driver is a loop over that table. So what is verified
 * here is the simulation itself, and the driver's own correctness (that it
 * walks the table in order and never reads the copy it is writing) is what its
 * unit spec is for.
 *
 * The harness runs in Playwright's headless Chromium, which draws with
 * SwiftShader. So the arithmetic checked is a CPU's 32-bit float, not a real
 * GPU's. Real GPUs differ from it in the last bit of a multiply-add, and the
 * model is chaotic, so no tolerance could cover every device over a whole
 * storm; that is why the run is short. What a short run proves is that the
 * shaders are the same *algorithm*, which is the thing a typo breaks.
 *
 * ## Why the tolerances are what they are
 *
 * The model holds its state in 32-bit arrays and computes between them in
 * JavaScript's doubles; the shaders compute in 32-bit throughout. The two agree
 * to rounding, and rounding compounds. The measured worst differences after
 * the run are printed on every run and were, when this was written, on this
 * box:
 *
 *     layer       worst difference   the layer reaches   with capacity +1%
 *     cut         5.3e-5 m           210 m               4.2e-2 m
 *     regolith    6.3e-5 m           136 m               6.3e-1 m
 *     water       1.7e-5 m           0.70 m              1.6e-1 m
 *     suspended   6.9e-4 m           31 m                6.5 m
 *
 * (2026-11-11, SwiftShader under Windows, 64 grid, 50 steps, seed 4127.) Each
 * tolerance below is about ten times its measurement. The last column is why
 * that is still tight enough, and it is checked on every run, not assumed: the
 * script runs the shaders once more with one constant nudged by 1% and requires
 * the comparison to *fail*. A gate that cannot fail is not a gate, and this is
 * the cheapest proof that this one can.
 *
 * The land here is not a gentle one. A 64 grid of real-sized cells is a
 * kilometre across and the calibrated relief is nearly two, so the slopes are
 * far past what rock holds and most of what moves in fifty steps is rockfall.
 * That is deliberate: it puts every branch of every pass to work in a run
 * short enough to compare.
 *
 * ## The land's shaders
 *
 * The light pass and the mesh's two shaders (`land/land-shaders.ts`) draw the
 * land; they are a picture, and there is no model to hold a picture to. They
 * are compiled here for the same reason as the rest, and two claims about them
 * that a number can carry are checked on the reference model's land:
 *
 * - ground that faces away from the sun is in shadow, every cell of it. This
 *   is the check on the conventions, which is where a light pass goes wrong:
 *   which way a texture's rows run, which way the march walks, what sign the
 *   sun's vector has. Get one backwards and the lit side of every ridge is the
 *   shaded one, in a picture that still looks like a landscape.
 * - a flat land is fully lit and sees the whole sky.
 *
 * Then one frame of the mesh is drawn and required not to be one flat colour.
 *
 * ## The water's shaders
 *
 * `water/water-shaders.ts` is a second mesh over the land, compiled here too.
 * The plan's rule for it is that nothing in it decides where water is, and
 * that is a claim a number can carry: the mesh is drawn alone on a cleared
 * canvas, where every pixel with any alpha is a pixel of water, and
 *
 * - on the reference land, which has cells deeper than `waterFrom`, it draws
 *   some;
 * - on the same land with every cell's water capped at `waterFrom`, it draws
 *   none at all. A mask, a noise or a constant in the shader would leave
 *   pixels behind; so would a depth carried past a triangle's edge, which is
 *   what a multisampled canvas does to a varying not marked `centroid`, and
 *   that one was found by this count.
 *
 * `--out` draws a land worth looking at instead of the gate's: the whole block
 * on a coarse grid, eroded by the shaders for `--steps` steps (1,500 unless
 * given, on a `--grid` of 256), from the route's own vantage. It stops raining
 * for the last share of the steps, as the storm does; `--raining` keeps it up,
 * and the two pictures side by side are the water's Definition of Done. The
 * line it prints times the light pass, the mesh, the water and a copy of the
 * frame; `--gpu` takes those on this machine's own graphics card. It is
 * tone-mapped by a few lines appended here and not by the route's chain, and
 * it is drawn by SwiftShader, so it shows whether the land reads and says
 * nothing about the final colour or about speed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

import { mulberry32, HERO_SEED } from '../src/app/watershed/seed/seed.ts';
import { EROSION, STRATA_ENTRIES } from '../src/app/watershed/model/erosion-calibration.ts';
import { createFields } from '../src/app/watershed/model/fields.ts';
import { LAND_LOOK, sunDirection } from '../src/app/watershed/land/land-calibration.ts';
import { landGeometry } from '../src/app/watershed/land/land-geometry.ts';
import {
  GREENING,
  GROUND_FRAGMENT,
  GROUND_VERTEX,
  LAND_COLOURS,
  LAND_EROSION,
  LAND_FLOATS,
  LAND_FRAGMENT,
  LAND_VERTEX,
  LIGHT_COUNTS,
  LIGHT_EROSION,
  LIGHT_FLOATS,
  LIGHT_FRAGMENT,
  RAIN,
  SUN_DIRECTION,
} from '../src/app/watershed/land/land-shaders.ts';
import { WATER_LOOK } from '../src/app/watershed/water/water-calibration.ts';
import {
  RIPPLE,
  WATER_COLOURS,
  WATER_FLOATS,
  waterFragment,
  waterVertex,
} from '../src/app/watershed/water/water-shaders.ts';
import {
  CAMERA_FAR,
  CAMERA_FOV,
  CAMERA_NEAR,
  CAMERA_POSITION,
  CAMERA_REFERENCE_ASPECT,
  CAMERA_TARGET,
} from '../src/app/watershed/stage/stage-calibration.ts';
import { raiseLand } from '../src/app/watershed/model/land.ts';
import { createNoise } from '../src/app/watershed/model/noise.ts';
import { step } from '../src/app/watershed/model/step.ts';
import { strataTable, strataWarp } from '../src/app/watershed/model/strata.ts';
import { uplift } from '../src/app/watershed/model/uplift.ts';
import {
  CHANNELS,
  packLand,
  packStrata,
  packTerrain,
  unpackLand,
} from '../src/app/watershed/sim/sim-layout.ts';
import {
  SIM_CONSTANTS,
  SIM_PASSES,
  SIM_STATES,
  SIM_STRENGTH,
  SIM_TRIANGLE,
  SIM_VERTEX,
} from '../src/app/watershed/sim/sim-shaders.ts';

const PARTS = { random: mulberry32, createNoise, createFields, uplift, strataTable, strataWarp };

/** Cells along a side. Small, so SwiftShader is quick; cells of the real size, so the physics is the real one. */
const SIZE = 64;
const CELL = EROSION.extent / 512;
const CONSTANTS = { ...EROSION, extent: SIZE * CELL };

/** Long enough for water to gather, move rock and break a slope; short enough that rounding has not yet become weather. */
const STEPS = 50;

/**
 * The largest difference allowed in each field, in metres, between the model
 * and the shaders after the run. See the header for where these come from.
 */
const TOLERANCE = { cut: 5e-4, regolith: 6e-4, water: 2e-4, suspended: 7e-3 };

/** The constant nudged, and by how much, for the run that must fail. */
const NUDGED = 'capacity';
const NUDGE = 1.01;

const LAYERS = ['cut', 'regolith', 'water', 'suspended'];

/** The land both sides start from. Raised twice, so neither run can see the other's state. */
function raise(size = SIZE, constants = CONSTANTS) {
  return raiseLand(HERO_SEED, size, constants, STRATA_ENTRIES, PARTS);
}

/** The model's answer: the fields after `STEPS` steps of full rain. */
function reference() {
  const land = raise();
  for (let n = 0; n < STEPS; n++) {
    step(land.fields, land.terrain, CONSTANTS, 1);
  }
  return land.fields;
}

/**
 * Runs in the page. Compiles every pass, runs `job.steps` steps over
 * ping-ponged RGBA32F targets, and returns the `land` texture's texels.
 * Self-contained: it is serialised into the browser and can close over nothing.
 */
function simulateInPage(job) {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  if (!gl) {
    return { error: 'This Chromium has no WebGL2.' };
  }
  if (!gl.getExtension('EXT_color_buffer_float')) {
    return { error: 'This Chromium cannot render to float textures (EXT_color_buffer_float).' };
  }
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown';

  const compile = (type, source, name) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, `#version 300 es\n${source}`);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(`${name} did not compile:\n${gl.getShaderInfoLog(shader)}`);
    }
    return shader;
  };

  const texture = (width, height, data) => {
    const made = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, made);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return made;
  };

  try {
    const vertex = compile(gl.VERTEX_SHADER, job.vertex, 'the vertex shader');
    const programs = job.passes.map((pass) => {
      const program = gl.createProgram();
      gl.attachShader(program, vertex);
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, pass.fragment, `pass "${pass.name}"`));
      gl.bindAttribLocation(program, 0, 'position');
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(`pass "${pass.name}" did not link:\n${gl.getProgramInfoLog(program)}`);
      }
      return program;
    });

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(job.triangle), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    const fixed = {
      terrain: texture(job.size, job.size, new Float32Array(job.terrain)),
      strata: texture(job.beds, 1, new Float32Array(job.strata)),
    };
    // Two copies of each state texture: `front` is read, `back` is written, and they swap.
    const state = {};
    for (const name of job.states) {
      const initial = name === 'land' ? new Float32Array(job.land) : null;
      state[name] = {
        front: texture(job.size, job.size, initial),
        back: texture(job.size, job.size, null),
      };
    }
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.viewport(0, 0, job.size, job.size);

    for (let n = 0; n < job.steps; n++) {
      job.passes.forEach((pass, index) => {
        const program = programs[index];
        gl.useProgram(program);
        for (const [key, value] of Object.entries(job.uniforms)) {
          const location = gl.getUniformLocation(program, key);
          if (location !== null) {
            // the rain's strength is the one uniform that changes: full for the wet steps, none after
            gl.uniform1f(location, key === job.strength && n >= job.wet ? 0 : value);
          }
        }
        pass.reads.forEach((name, unit) => {
          gl.activeTexture(gl.TEXTURE0 + unit);
          gl.bindTexture(gl.TEXTURE_2D, fixed[name] ?? state[name].front);
          gl.uniform1i(gl.getUniformLocation(program, name), unit);
        });
        const target = state[pass.writes];
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER,
          gl.COLOR_ATTACHMENT0,
          gl.TEXTURE_2D,
          target.back,
          0
        );
        if (n === 0 && gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
          throw new Error(`the framebuffer for pass "${pass.name}" is incomplete`);
        }
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        [target.front, target.back] = [target.back, target.front];
      });
    }

    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      state.land.front,
      0
    );
    const texels = new Float32Array(job.size * job.size * job.channels);
    gl.readPixels(0, 0, job.size, job.size, gl.RGBA, gl.FLOAT, texels);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      state.flow.front,
      0
    );
    const flow = new Float32Array(job.size * job.size * job.channels);
    gl.readPixels(0, 0, job.size, job.size, gl.RGBA, gl.FLOAT, flow);
    const glError = gl.getError();
    if (glError !== gl.NO_ERROR) {
      throw new Error(`WebGL reported error ${glError}`);
    }
    return { renderer, texels: Array.from(texels), flow: Array.from(flow) };
  } catch (error) {
    return { error: String(error?.message ?? error) };
  }
}

/**
 * The shaders' answer, with the constants given: `steps` steps on a grid of
 * `size`, raining for the first `wet` of them.
 */
async function simulate(page, constants, size = SIZE, steps = STEPS, wet = steps) {
  const land = raise(size, constants);
  const uniforms = Object.fromEntries(SIM_CONSTANTS.map((key) => [key, constants[key]]));
  uniforms[SIM_STRENGTH] = 1;
  const outcome = await page.evaluate(simulateInPage, {
    size,
    beds: STRATA_ENTRIES,
    channels: CHANNELS,
    steps,
    wet,
    strength: SIM_STRENGTH,
    vertex: SIM_VERTEX,
    triangle: [...SIM_TRIANGLE],
    passes: SIM_PASSES.map(({ name, fragment, reads, writes }) => ({
      name,
      fragment,
      reads: [...reads],
      writes,
    })),
    states: [...SIM_STATES],
    uniforms,
    terrain: Array.from(packTerrain(land.terrain)),
    strata: Array.from(packStrata(land.strata)),
    land: Array.from(packLand(land.fields)),
  });
  if (outcome.error) {
    throw new Error(outcome.error);
  }
  unpackLand(outcome.texels, land.fields);
  for (let i = 0; i < land.fields.water.length; i++) {
    land.fields.velocityX[i] = outcome.flow[i * CHANNELS];
    land.fields.velocityY[i] = outcome.flow[i * CHANNELS + 1];
  }
  return { fields: land.fields, renderer: outcome.renderer, land };
}

/**
 * The mesh's fragment shader with a display transform after it, so a frame
 * drawn straight to a canvas can be looked at. The route does this in its
 * output pass; the curve here is the usual short fit to ACES and is close to
 * that, not equal to it.
 */
function forDisplay(fragment) {
  const renamed = fragment.replace('void main()', 'void shade()');
  if (renamed === fragment) {
    throw new Error('A fragment shader to be displayed has no `void main()` to wrap.');
  }
  return `${renamed}
void main() {
  shade();
  // three.js exposes its ACES curve by 1 / 0.6, so a frame from here is as bright as one from the route
  vec3 c = result.rgb / 0.6;
  c = clamp((c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14), 0.0, 1.0);
  result = vec4(pow(c, vec3(1.0 / 2.2)), 1.0);
}`;
}

/** `flow`: the water's velocity along x and along y, and two spare channels. */
function packFlow(fields) {
  const packed = new Float32Array(fields.water.length * CHANNELS);
  for (let i = 0; i < fields.water.length; i++) {
    packed[i * CHANNELS] = fields.velocityX[i];
    packed[i * CHANNELS + 1] = fields.velocityY[i];
  }
  return packed;
}

/** Column-major, as WebGL takes them. */
function perspective(fovDegrees, aspect, near, far) {
  const f = 1 / Math.tan((fovDegrees * Math.PI) / 360);
  const depth = 1 / (near - far);
  // prettier-ignore
  return [
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * depth, -1,
    0, 0, 2 * far * near * depth, 0,
  ];
}

function lookAt(eye, target) {
  const unit = (v) => {
    const length = Math.hypot(...v);
    return v.map((part) => part / length);
  };
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const back = unit(eye.map((part, axis) => part - target[axis]));
  const right = unit(cross([0, 1, 0], back));
  const up = cross(back, right);
  // prettier-ignore
  return [
    right[0], up[0], back[0], 0,
    right[1], up[1], back[1], 0,
    right[2], up[2], back[2], 0,
    -dot(right, eye), -dot(up, eye), -dot(back, eye), 1,
  ];
}

/**
 * Runs in the page. Compiles the light pass and the mesh, works the light out
 * for the land given, draws one frame of the mesh, and returns the light's
 * texels and what the frame looks like in numbers. Self-contained, as above.
 */
function drawInPage(job) {
  const canvas = document.createElement('canvas');
  canvas.width = job.width;
  canvas.height = job.height;
  const gl = canvas.getContext('webgl2', { antialias: true, premultipliedAlpha: false });
  if (!gl) {
    return { error: 'This Chromium has no WebGL2.' };
  }

  const compile = (type, source, name) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, `#version 300 es\n${source}`);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(`${name} did not compile:\n${gl.getShaderInfoLog(shader)}`);
    }
    return shader;
  };
  const link = (vertex, fragment, name) => {
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex, `${name}'s vertex shader`));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment, `${name}'s fragment shader`));
    gl.bindAttribLocation(program, 0, 'position');
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`${name} did not link:\n${gl.getProgramInfoLog(program)}`);
    }
    return program;
  };
  const texture = (format, width, height, type, data, filter) => {
    const made = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, made);
    gl.texImage2D(gl.TEXTURE_2D, 0, format, width, height, 0, gl.RGBA, type, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return made;
  };
  const float = (width, height, data) =>
    texture(gl.RGBA32F, width, height, gl.FLOAT, new Float32Array(data), gl.NEAREST);

  try {
    const lightProgram = link(job.triangleVertex, job.lightFragment, 'the light pass');
    // the source the route ships, compiled as it is; then the copy with a display transform, to draw with
    link(job.landVertex, job.landFragment, 'the land');
    const landProgram = link(job.landVertex, job.displayFragment, 'the land, for display');
    link(job.waterVertex, job.waterFragment, 'the water');
    const waterProgram = link(job.waterVertex, job.displayWaterFragment, 'the water, for display');

    const textures = {
      terrain: float(job.size, job.size, job.terrain),
      strata: float(job.beds, 1, job.strata),
      land: float(job.size, job.size, job.land),
      flow: float(job.size, job.size, job.flow),
      light: texture(gl.RGBA8, job.size, job.size, gl.UNSIGNED_BYTE, null, gl.LINEAR),
    };
    const use = (program, samplers) => {
      gl.useProgram(program);
      const at = (name) => gl.getUniformLocation(program, name);
      for (const [name, value] of Object.entries(job.floats)) {
        gl.uniform1f(at(name), value);
      }
      for (const [name, value] of Object.entries(job.counts)) {
        gl.uniform1i(at(name), value);
      }
      for (const [name, value] of Object.entries(job.vectors)) {
        gl.uniform3fv(at(name), value);
      }
      for (const [name, value] of Object.entries(job.matrices)) {
        gl.uniformMatrix4fv(at(name), false, value);
      }
      samplers.forEach((name, unit) => {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, textures[name]);
        gl.uniform1i(at(name), unit);
      });
    };

    // the light, into its own texture
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(job.triangle), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, textures.light, 0);
    gl.viewport(0, 0, job.size, job.size);
    use(lightProgram, ['land', 'terrain']);
    // a read-back waits for the draw before it, so the clock stops on finished work
    const lightBegan = performance.now();
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const light = new Uint8Array(job.size * job.size * 4);
    gl.readPixels(0, 0, job.size, job.size, gl.RGBA, gl.UNSIGNED_BYTE, light);
    const lightMs = performance.now() - lightBegan;

    // the mesh, to the canvas, culled and depth-tested as three.js would draw it
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, job.width, job.height);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(job.positions), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(job.indices), gl.STATIC_DRAW);
    use(landProgram, ['land', 'terrain', 'strata', 'light']);
    const frame = new Uint8Array(job.width * job.height * 4);
    // drawn twice and the second timed: the first pays for the upload and the driver's own compile
    gl.drawElements(gl.TRIANGLES, job.indices.length, gl.UNSIGNED_INT, 0);
    gl.readPixels(0, 0, job.width, job.height, gl.RGBA, gl.UNSIGNED_BYTE, frame);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const meshBegan = performance.now();
    gl.drawElements(gl.TRIANGLES, job.indices.length, gl.UNSIGNED_INT, 0);
    gl.readPixels(0, 0, job.width, job.height, gl.RGBA, gl.UNSIGNED_BYTE, frame);
    const meshMs = performance.now() - meshBegan;

    // what the land's frame is judged on is counted before the water is drawn into it
    const landFrame = frame.slice();

    // the water over the land, drawn after it and a little nearer, as the route draws it. timed against
    // the alternative it was chosen over: a copy of the frame for the water to read the bed out of
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(job.offset[0], job.offset[1]);
    use(waterProgram, ['land', 'terrain', 'strata', 'light', 'flow']);
    gl.drawElements(gl.TRIANGLES, job.waterCount, gl.UNSIGNED_INT, 0);
    gl.readPixels(0, 0, job.width, job.height, gl.RGBA, gl.UNSIGNED_BYTE, frame);
    const image = job.image ? canvas.toDataURL('image/png') : null;
    const waterBegan = performance.now();
    gl.drawElements(gl.TRIANGLES, job.waterCount, gl.UNSIGNED_INT, 0);
    gl.readPixels(0, 0, job.width, job.height, gl.RGBA, gl.UNSIGNED_BYTE, frame);
    const waterMs = performance.now() - waterBegan;
    const copy = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + 7);
    gl.bindTexture(gl.TEXTURE_2D, copy);
    gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, job.width, job.height, 0);
    const copyBegan = performance.now();
    gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, job.width, job.height, 0);
    gl.readPixels(0, 0, job.width, job.height, gl.RGBA, gl.UNSIGNED_BYTE, frame);
    const copyMs = performance.now() - copyBegan;

    // the water alone, on a cleared canvas: every pixel with any alpha is a pixel of water
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.drawElements(gl.TRIANGLES, job.waterCount, gl.UNSIGNED_INT, 0);
    gl.readPixels(0, 0, job.width, job.height, gl.RGBA, gl.UNSIGNED_BYTE, frame);
    let watered = 0;
    for (let i = 3; i < frame.length; i += 4) {
      watered += frame[i] > 0 ? 1 : 0;
    }
    frame.set(landFrame);
    const glError = gl.getError();
    if (glError !== gl.NO_ERROR) {
      throw new Error(`WebGL reported error ${glError}`);
    }

    // the cleared canvas has no alpha; a pixel with any is the land
    let covered = 0;
    let sum = 0;
    let squares = 0;
    for (let i = 0; i < frame.length; i += 4) {
      if (frame[i + 3] > 0) {
        const luma = (0.2126 * frame[i] + 0.7152 * frame[i + 1] + 0.0722 * frame[i + 2]) / 255;
        covered++;
        sum += luma;
        squares += luma * luma;
      }
    }
    const mean = covered > 0 ? sum / covered : 0;
    return {
      light: Array.from(light),
      covered: covered / (job.width * job.height),
      mean,
      deviation: covered > 0 ? Math.sqrt(Math.max(0, squares / covered - mean * mean)) : 0,
      image,
      watered,
      lightMs,
      meshMs,
      waterMs,
      copyMs,
    };
  } catch (error) {
    return { error: String(error?.message ?? error) };
  }
}

/** Lights and draws the land given: its terrain and beds, and the fields it has come to. */
async function draw(page, land, constants, view, image = false) {
  const { size } = land.terrain;
  const geometry = landGeometry(size, constants.extent);
  const pick = (keys, from) => Object.fromEntries(keys.map((key) => [key, from[key]]));
  const outcome = await page.evaluate(drawInPage, {
    size,
    beds: STRATA_ENTRIES,
    width: view.width,
    height: view.height,
    image,
    triangleVertex: SIM_VERTEX,
    triangle: [...SIM_TRIANGLE],
    lightFragment: LIGHT_FRAGMENT,
    landVertex: LAND_VERTEX,
    landFragment: LAND_FRAGMENT,
    displayFragment: forDisplay(LAND_FRAGMENT),
    waterVertex: waterVertex(GROUND_VERTEX),
    waterFragment: waterFragment(GROUND_FRAGMENT),
    displayWaterFragment: forDisplay(waterFragment(GROUND_FRAGMENT)),
    waterCount: (size - 1) * (size - 1) * 6,
    offset: [WATER_LOOK.offsetFactor, WATER_LOOK.offsetUnits],
    flow: Array.from(packFlow(land.fields)),
    terrain: Array.from(packTerrain(land.terrain)),
    strata: Array.from(packStrata(land.strata)),
    land: Array.from(packLand(land.fields)),
    positions: Array.from(geometry.positions),
    indices: Array.from(geometry.indices),
    floats: {
      ...pick([...LIGHT_EROSION, ...LAND_EROSION], constants),
      ...pick([...LIGHT_FLOATS, ...LAND_FLOATS], LAND_LOOK),
      ...pick(WATER_FLOATS, WATER_LOOK),
      [GREENING]: 0,
      [RAIN]: view.rain ?? 0,
      [RIPPLE]: 0.25,
    },
    counts: pick(LIGHT_COUNTS, LAND_LOOK),
    vectors: {
      ...pick(LAND_COLOURS, LAND_LOOK),
      ...pick(WATER_COLOURS, WATER_LOOK),
      [SUN_DIRECTION]: sunDirection(LAND_LOOK),
      cameraPosition: view.eye,
    },
    matrices: {
      viewMatrix: lookAt(view.eye, view.target),
      projectionMatrix: perspective(view.fov, view.width / view.height, CAMERA_NEAR, CAMERA_FAR),
    },
  });
  if (outcome.error) {
    throw new Error(outcome.error);
  }
  return outcome;
}

/**
 * Holds the light to the land it was worked out for. Returns what is wrong,
 * as sentences, and the shares the summary line prints.
 */
function judgeLight(land, constants, light) {
  const { size, uplift } = land.terrain;
  const cell = constants.extent / size;
  const surface = uplift.map((raised, i) => raised - land.fields.cut[i] + land.fields.regolith[i]);
  const sun = sunDirection(LAND_LOOK);
  // the two neighbours a ray toward the sun passes between: one straight along the axis it mostly
  // travels, one diagonal. x is a texture's column and z its row, which is the convention on trial
  const alongX = Math.abs(sun[0]) >= Math.abs(sun[2]);
  const stepX = Math.sign(sun[0]) || 1;
  const stepY = Math.sign(sun[2]) || 1;
  const straight = alongX ? stepX : stepY * size;
  const diagonal = stepX + stepY * size;
  // the most a ray can have climbed by the time it is over either of them, and a metre to spare
  const climbed = (Math.SQRT2 * cell * sun[1]) / Math.hypot(sun[0], sun[2]) + 1;
  let away = 0;
  let awayLit = 0;
  let lit = 0;
  let dark = 0;
  let leastSky = 255;
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const i = y * size + x;
      const shadow = light[i * 4];
      lit += shadow > 250 ? 1 : 0;
      dark += shadow < 5 ? 1 : 0;
      leastSky = Math.min(leastSky, light[i * 4 + 1]);
      // ground that rises toward the sun faster than the sun does: its own slope hides it
      if (Math.min(surface[i + straight], surface[i + diagonal]) > surface[i] + climbed) {
        away++;
        awayLit += shadow > 0 ? 1 : 0;
      }
    }
  }
  const cells = (size - 2) ** 2;
  const problems = [];
  if (away < cells / 50) {
    problems.push(
      `only ${away} of ${cells} cells face away from the sun, too few to check a shadow against. ` +
        `The gate's land or its sun has changed; choose ones that disagree more.`
    );
  }
  if (awayLit > 0) {
    problems.push(
      `${awayLit} of the ${away} cells that face away from the sun are lit. The light pass and ` +
        `the land disagree about a direction: the sun's sign, the march's, or which way rows run.`
    );
  }
  if (lit < cells / 50 || dark < cells / 50) {
    problems.push(
      `${lit} cells are fully lit and ${dark} fully shadowed, of ${cells}; a land this steep ` +
        `under a low sun has plenty of both.`
    );
  }
  if (leastSky > 230) {
    problems.push(
      `no cell sees less than ${Math.round((leastSky / 255) * 100)}% of the sky, on a land ` +
        `of gorges. The occlusion term is not being worked out.`
    );
  }
  return { problems, lit: lit / cells, dark: dark / cells, leastSky: leastSky / 255 };
}

/** The view the gate's frame is drawn from: the little land is taller than it is wide. */
const GATE_VIEW = {
  width: 320,
  height: 200,
  fov: CAMERA_FOV,
  eye: [1.9 * CONSTANTS.extent, 3 * CONSTANTS.extent, 2.4 * CONSTANTS.extent],
  target: [0, 0.8 * CONSTANTS.extent, 0],
};

/** The route's own vantage, at the aspect it was composed for. */
const ROUTE_VIEW = {
  width: 1280,
  height: 1280 / CAMERA_REFERENCE_ASPECT,
  fov: CAMERA_FOV,
  eye: [...CAMERA_POSITION],
  target: [...CAMERA_TARGET],
};

/** Compiles the land's shaders and holds them to the claims in the header. True when something is wrong. */
async function verifyLand(page, expected) {
  const land = { ...raise(), fields: expected };
  const drawn = await draw(page, land, CONSTANTS, GATE_VIEW);
  const judged = judgeLight(land, CONSTANTS, drawn.light);
  const problems = [...judged.problems];

  const level = raise();
  level.terrain.uplift.fill(100);
  const plain = await draw(page, level, CONSTANTS, GATE_VIEW);
  const dimmed = plain.light.filter((value, i) => i % 4 < 2 && value !== 255).length;
  if (dimmed > 0) {
    problems.push(
      `on a flat land ${dimmed} values of the light are below full. Nothing stands on a flat ` +
        `land to shade it or to hide its sky.`
    );
  }

  if (drawn.covered < 0.1 || drawn.deviation < 0.02) {
    problems.push(
      `the frame of the mesh has the land on ${(drawn.covered * 100).toFixed(1)}% of it with a ` +
        `spread in brightness of ${drawn.deviation.toFixed(3)}: nothing was drawn, or one flat ` +
        `colour was.`
    );
  }

  // the water: drawn where the model has water over the threshold, and nowhere else
  const deep = land.fields.water.filter((depth) => depth > WATER_LOOK.waterFrom).length;
  if (deep < 10) {
    problems.push(
      `only ${deep} cells of the reference land hold water deeper than waterFrom, too few to ` +
        `check the water against. Lengthen the run or lower the threshold.`
    );
  }
  if (drawn.watered === 0) {
    problems.push(
      `the reference land has ${deep} cells of water deep enough to draw and the water's mesh ` +
        `drew none of it.`
    );
  }
  const shallow = { ...land, fields: { ...land.fields } };
  shallow.fields.water = land.fields.water.map((depth) => Math.min(depth, WATER_LOOK.waterFrom));
  const film = await draw(page, shallow, CONSTANTS, GATE_VIEW);
  if (film.watered > 0) {
    problems.push(
      `with no cell holding more than waterFrom, ${film.watered} pixels of water were drawn. ` +
        `Something other than the depth in the land texture is deciding where water is.`
    );
  }

  console.log(
    `  the water: compiled; ${deep} cells deep enough to draw, on ${drawn.watered} pixels of the ` +
      `reference land's frame, and on ` +
      `${film.watered} once no cell holds more than ${WATER_LOOK.waterFrom} m\n` +
      `  the land: the light pass and the mesh compiled; ${(judged.dark * 100).toFixed(0)}% of the ` +
      `reference land in full shadow, ${(judged.lit * 100).toFixed(0)}% in full sun, the deepest ` +
      `cell seeing ${(judged.leastSky * 100).toFixed(0)}% of the sky; the frame covers ` +
      `${(drawn.covered * 100).toFixed(0)}% of the canvas, brightness ${drawn.mean.toFixed(2)} ` +
      `± ${drawn.deviation.toFixed(2)}`
  );
  for (const problem of problems) {
    console.error(`\nThe land: ${problem}`);
  }
  return problems.length > 0;
}

/** `--name value` from the command line, or the fallback. */
function option(name, fallback) {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? fallback : process.argv[at + 1];
}

/** Erodes the whole block on a coarse grid and writes a picture of it. To look at; it asserts nothing. */
async function picture(page, file) {
  const size = Number(option('grid', 256));
  const steps = Number(option('steps', 1500));
  const began = Date.now();
  // it stops raining for the last share, as the storm does, so the land is seen drained; `--raining`
  // keeps it up to the end, so the land is seen as it is in the storm
  const raining = process.argv.includes('--raining');
  const wet = raining ? steps : Math.round(steps * 0.85);
  const eroded = await simulate(page, EROSION, size, steps, wet);
  const view = { ...ROUTE_VIEW, rain: raining ? 1 : 0 };
  const drawn = await draw(page, eroded.land, EROSION, view, true);
  fs.writeFileSync(file, Buffer.from(drawn.image.split(',')[1], 'base64'));
  console.log(
    `  wrote ${file}: ${steps} steps on a ${size} grid, in ` +
      `${((Date.now() - began) / 1000).toFixed(1)}s; the light pass took ` +
      `${drawn.lightMs.toFixed(0)} ms, the mesh ${drawn.meshMs.toFixed(0)} ms and the water ` +
      `${drawn.waterMs.toFixed(0)} ms, on ${drawn.watered} pixels; copying the frame took ` +
      `${drawn.copyMs.toFixed(0)} ms`
  );
}

/** The worst difference in each layer, where it is, and how large the layer itself is there. */
function compare(expected, actual) {
  return LAYERS.map((layer) => {
    let worst = 0;
    let at = 0;
    let largest = 0;
    for (let i = 0; i < expected[layer].length; i++) {
      const difference = Math.abs(expected[layer][i] - actual[layer][i]);
      if (!(difference <= worst)) {
        // also catches NaN, which is greater than nothing and so would otherwise pass
        worst = Number.isNaN(difference) ? Infinity : difference;
        at = i;
      }
      largest = Math.max(largest, Math.abs(expected[layer][i]));
    }
    return { layer, worst, at, largest, tolerance: TOLERANCE[layer] };
  });
}

function table(rows) {
  return rows
    .map(
      ({ layer, worst, at, largest, tolerance }) =>
        `  ${layer.padEnd(10)} worst difference ${worst.toExponential(2).padStart(9)} m ` +
        `at (${at % SIZE}, ${Math.floor(at / SIZE)}); the layer reaches ` +
        `${largest.toExponential(2)} m; allowed ${tolerance.toExponential(0)}`
    )
    .join('\n');
}

const started = Date.now();
const expected = reference();
if (!LAYERS.every((layer) => expected[layer].some((value) => value > 0))) {
  console.error(
    `verify:watershed: after ${STEPS} steps the reference model has an empty layer, so ` +
      `agreeing with it would prove nothing. Lengthen the run.`
  );
  process.exit(1);
}

// `--gpu` asks for this machine's own graphics card where the default is the software rasteriser.
// It is for taking a timing with `--out`; the gate's tolerances were measured on SwiftShader.
const browser = await chromium.launch(
  process.argv.includes('--gpu')
    ? { args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] }
    : {}
);
let failed = false;
try {
  const page = await browser.newPage();
  const honest = await simulate(page, CONSTANTS);
  const rows = compare(expected, honest.fields);
  console.log(
    `verify:watershed: ${SIM_PASSES.length} passes compiled; ${STEPS} steps on a ${SIZE} grid, ` +
      `seed ${HERO_SEED}, through ${honest.renderer}\n${table(rows)}`
  );
  const over = rows.filter((row) => !(row.worst <= row.tolerance));
  if (over.length > 0) {
    failed = true;
    console.error(
      `\nThe shaders and the model disagree in ${over.map((row) => row.layer).join(', ')}. ` +
        `One of sim-shaders.ts and model/step.ts was changed without the other; they are the ` +
        `same arithmetic and have to stay so.`
    );
  }

  const nudged = await simulate(page, { ...CONSTANTS, [NUDGED]: CONSTANTS[NUDGED] * NUDGE });
  const nudgedRows = compare(expected, nudged.fields);
  const caught = nudgedRows.filter((row) => !(row.worst <= row.tolerance));
  if (process.argv.includes('--verbose')) {
    console.log(`  nudged:\n${table(nudgedRows)}`);
  }
  if (caught.length === 0) {
    failed = true;
    console.error(
      `\nWith ${NUDGED} raised by ${Math.round((NUDGE - 1) * 100)}% in the shaders alone, the ` +
        `comparison still passed. The tolerances are too loose to catch a wrong shader, so a ` +
        `pass above means nothing. Tighten them toward the measured differences.`
    );
  } else {
    console.log(
      `  and with ${NUDGED} nudged ${Math.round((NUDGE - 1) * 100)}% in the shaders alone it ` +
        `fails, in ${caught.map((row) => row.layer).join(', ')}: the gate can fail.`
    );
  }

  if (await verifyLand(page, expected)) {
    failed = true;
  }
  const out = option('out', null);
  if (out) {
    await picture(page, out);
  }
} catch (error) {
  failed = true;
  console.error(`verify:watershed: ${error.message}`);
} finally {
  await browser.close();
}

const here = path.relative(process.cwd(), fileURLToPath(import.meta.url));
console.log(`${here} took ${((Date.now() - started) / 1000).toFixed(1)}s`);
process.exit(failed ? 1 : 0);
