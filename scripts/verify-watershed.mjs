/**
 * Holds Watershed's shaders to its reference model.
 *
 *     npm run verify:watershed
 *     npm run verify:watershed -- --verbose   # also print the nudged run's differences
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
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

import { mulberry32, HERO_SEED } from '../src/app/watershed/seed/seed.ts';
import { EROSION, STRATA_ENTRIES } from '../src/app/watershed/model/erosion-calibration.ts';
import { createFields } from '../src/app/watershed/model/fields.ts';
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
function raise() {
  return raiseLand(HERO_SEED, SIZE, CONSTANTS, STRATA_ENTRIES, PARTS);
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
            gl.uniform1f(location, value);
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
    const glError = gl.getError();
    if (glError !== gl.NO_ERROR) {
      throw new Error(`WebGL reported error ${glError}`);
    }
    return { renderer, texels: Array.from(texels) };
  } catch (error) {
    return { error: String(error?.message ?? error) };
  }
}

/** The shaders' answer, with the constants given. */
async function simulate(page, constants) {
  const land = raise();
  const uniforms = Object.fromEntries(SIM_CONSTANTS.map((key) => [key, constants[key]]));
  uniforms[SIM_STRENGTH] = 1;
  const outcome = await page.evaluate(simulateInPage, {
    size: SIZE,
    beds: STRATA_ENTRIES,
    channels: CHANNELS,
    steps: STEPS,
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
  return { fields: land.fields, renderer: outcome.renderer };
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

const browser = await chromium.launch();
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
} catch (error) {
  failed = true;
  console.error(`verify:watershed: ${error.message}`);
} finally {
  await browser.close();
}

const here = path.relative(process.cwd(), fileURLToPath(import.meta.url));
console.log(`${here} took ${((Date.now() - started) / 1000).toFixed(1)}s`);
process.exit(failed ? 1 : 0);
