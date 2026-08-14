/**
 * Compile AUBADE's shaders in a real browser and render one frame.
 *
 *     npm run verify:shader                 # compile, link, draw, assert
 *     npm run verify:shader -- --out lobby.png   # and write the frame out
 *
 * ## Why this exists
 *
 * The GLSL in `src/aubade/rooms/` is the only code in this repository whose
 * compiler runs after deployment. Everything else is checked before it ships —
 * TypeScript by `tsc`, the Python by `mypy --strict`, the templates by
 * `angular-eslint`. A misplaced semicolon in the fragment shader passes every
 * one of those gates, passes the unit tests (which drive a stub context that
 * never looks at the source), deploys, and then shows a visitor a blank page
 * with one line in a console they will not open.
 *
 * So the shader gets a compiler too. Playwright's Chromium renders WebGL2
 * through SwiftShader in headless mode, which is a real ANGLE front end over a
 * real GLSL compiler: if it rejects the source, so will a driver.
 *
 * ## What it does and does not prove
 *
 * It proves the source compiles and links, that every uniform the renderer
 * writes actually exists in the program, that a draw call produces no GL error,
 * and that the result is an image rather than a flat colour — which is the
 * usual symptom of a raymarch whose camera ended up inside a wall, and is
 * otherwise indistinguishable from "the page did not load".
 *
 * It proves nothing about **speed**. SwiftShader is a CPU rasteriser and its
 * frame times have no relationship to a GPU's. The frame budget is a separate
 * claim, checked by looking at the thing on real hardware.
 *
 * Nor does it prove the image is *good*. That is a judgement, it is the actual
 * Definition of Done for this phase, and no script is going to make it — which
 * is what `--out` is for.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

import { FULLSCREEN_VERTEX_SHADER } from '../src/aubade/rooms/fullscreen.vert.ts';
import { LOBBY_FRAGMENT_SHADER } from '../src/aubade/rooms/lobby.frag.ts';
import { ANCHOR_EYE, ANCHOR_TARGET, breathe } from '../src/aubade/camera/drift.ts';
import { QUALITY_TIERS } from '../src/aubade/gl/quality.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Read `--name value` from argv, or fall back. Mirrors scripts/serve-dist.mjs. */
function readFlag(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

const width = Number(readFlag('width', '1280'));
const height = Number(readFlag('height', '720'));
const seconds = Number(readFlag('time', '0'));
const outPath = readFlag('out', null);
const tier = QUALITY_TIERS[Number(readFlag('tier', '0'))];

/**
 * Everything the page needs, gathered here so the browser side stays a pure
 * function of its argument and can be read without cross-referencing.
 */
const job = {
  vertexSource: FULLSCREEN_VERTEX_SHADER,
  fragmentSource: LOBBY_FRAGMENT_SHADER,
  width,
  height,
  camera: breathe(seconds),
  seconds,
  tier,
  // Asserted against the program's own reflection: a uniform the renderer
  // writes but the shader does not declare is a silent no-op, and a renamed one
  // is how a piece ends up frozen at time zero with nothing in the console.
  expected: [
    'uResolution',
    'uTime',
    'uEye',
    'uTarget',
    'uRoll',
    'uMarchSteps',
    'uShadowSteps',
    'uVolumetricSamples',
  ],
};

/**
 * Compile, link, draw, and report. Runs inside the page.
 *
 * Written in a loose style on purpose: this function is serialised and evaluated
 * in the browser, so it can close over nothing, must not use anything the
 * bundler would have to resolve, and reads `input` as untyped.
 *
 * @param {typeof job} input
 */
function renderInPage(input) {
  const canvas = document.createElement('canvas');
  canvas.width = input.width;
  canvas.height = input.height;

  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: true,
  });
  if (gl === null) {
    return { ok: false, stage: 'context', log: 'This browser produced no WebGL2 context.' };
  }

  const compile = (type, source, name) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      return { error: { ok: false, stage: name, log: gl.getShaderInfoLog(shader) || '' } };
    }
    return { shader };
  };

  const vertex = compile(gl.VERTEX_SHADER, input.vertexSource, 'vertex');
  if (vertex.error) return vertex.error;
  const fragment = compile(gl.FRAGMENT_SHADER, input.fragmentSource, 'fragment');
  if (fragment.error) return fragment.error;

  const program = gl.createProgram();
  gl.attachShader(program, vertex.shader);
  gl.attachShader(program, fragment.shader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    return { ok: false, stage: 'link', log: gl.getProgramInfoLog(program) || '' };
  }

  gl.useProgram(program);

  const declared = [];
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let index = 0; index < count; index += 1) {
    declared.push(gl.getActiveUniform(program, index).name.replace(/\[0\]$/, ''));
  }

  const at = (name) => gl.getUniformLocation(program, name);
  gl.uniform2f(at('uResolution'), input.width, input.height);
  gl.uniform1f(at('uTime'), input.seconds);
  gl.uniform3f(at('uEye'), input.camera.eye.x, input.camera.eye.y, input.camera.eye.z);
  gl.uniform3f(at('uTarget'), input.camera.target.x, input.camera.target.y, input.camera.target.z);
  gl.uniform1f(at('uRoll'), input.camera.roll);
  gl.uniform1i(at('uMarchSteps'), input.tier.marchSteps);
  gl.uniform1i(at('uShadowSteps'), input.tier.shadowSteps);
  gl.uniform1i(at('uVolumetricSamples'), input.tier.volumetricSamples);

  gl.viewport(0, 0, input.width, input.height);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  const glError = gl.getError();

  // Statistics over the frame, sampled on a grid rather than every pixel: this
  // is a CPU rasteriser and a full readback of two megapixels is slow enough to
  // matter to a person waiting for a gate.
  const pixels = new Uint8Array(input.width * input.height * 4);
  gl.readPixels(0, 0, input.width, input.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

  // Distinct *luma levels*, not distinct colours. This is a night interior: it
  // lives in the bottom eighth of the range, so binning RGB counts almost
  // nothing however good the picture is, and a threshold on it would only ever
  // measure how dark the room was. The number of separate brightness steps
  // present is what actually distinguishes an image from a flat fill.
  let min = 255;
  let max = 0;
  let total = 0;
  let samples = 0;
  const levels = new Set();
  for (let y = 0; y < input.height; y += 4) {
    for (let x = 0; x < input.width; x += 4) {
      const offset = (y * input.width + x) * 4;
      const luma = (pixels[offset] * 3 + pixels[offset + 1] * 6 + pixels[offset + 2]) / 10;
      min = Math.min(min, luma);
      max = Math.max(max, luma);
      total += luma;
      samples += 1;
      levels.add(Math.round(luma));
    }
  }
  const distinct = levels;

  return {
    ok: true,
    glError,
    declared,
    min,
    max,
    mean: total / samples,
    distinct: distinct.size,
    dataUrl: canvas.toDataURL('image/png'),
  };
}
const browser = await chromium.launch();
const page = await browser.newPage();
const result = await page.evaluate(renderInPage, job);
await browser.close();

const problems = [];

if (!result.ok) {
  process.stderr.write(`\nThe ${result.stage} stage failed:\n\n${result.log}\n\n`);
  const reference = /\b\d+:(\d+)\b/.exec(result.log ?? '');
  if (reference !== null) {
    const source = result.stage === 'vertex' ? job.vertexSource : job.fragmentSource;
    const line = source.split('\n')[Number(reference[1]) - 1];
    if (line !== undefined) {
      process.stderr.write(`  ${reference[1]} | ${line.trim()}\n\n`);
    }
  }
  process.exit(1);
}

if (result.glError !== 0) {
  problems.push(`The draw call left GL error 0x${result.glError.toString(16)} set.`);
}

for (const name of job.expected) {
  if (!result.declared.includes(name)) {
    problems.push(
      `The renderer writes \`${name}\`, which the linked program does not declare. ` +
        `Either it was renamed in the shader, or it was optimised away because nothing ` +
        `reads it — both are silent at runtime.`
    );
  }
}

// A raymarch that ends up inside a wall, or whose camera is NaN, renders a
// perfectly uniform colour. So does a page that never drew at all, which is why
// this is worth asserting rather than eyeballing.
if (result.max - result.min < 12) {
  problems.push(
    `The frame is nearly uniform (luma ${result.min.toFixed(1)}–${result.max.toFixed(1)}). ` +
      `That is what a camera inside a wall looks like, and what a NaN uniform looks like.`
  );
}
if (result.distinct < 60) {
  problems.push(
    `Only ${result.distinct} distinct brightness levels in the frame; expected an image. ` +
      `A flat fill scores 1, a two-tone gradient a handful.`
  );
}
if (result.mean < 2) {
  problems.push(`The frame is essentially black (mean luma ${result.mean.toFixed(2)}).`);
}
if (result.mean > 200) {
  problems.push(`The frame is blown out (mean luma ${result.mean.toFixed(2)}).`);
}

if (outPath !== null) {
  const target = path.resolve(repoRoot, outPath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(result.dataUrl.split(',')[1], 'base64'));
  process.stdout.write(`wrote ${path.relative(repoRoot, target)}\n`);
}

process.stdout.write(
  `lobby.frag: compiled and linked, ${result.declared.length} uniforms, ` +
    `luma ${result.min.toFixed(1)}–${result.max.toFixed(1)} (mean ${result.mean.toFixed(1)}), ` +
    `${result.distinct} distinct brightness levels at ${width}×${height}.\n`
);

if (problems.length > 0) {
  process.stderr.write(`\nThe shader compiled, but the frame is wrong:\n\n`);
  for (const problem of problems) {
    process.stderr.write(`  ${problem}\n`);
  }
  process.stderr.write(
    `\nRe-run with \`-- --out docs/images/lobby.png\` and look at it.\n` +
      `Note that this renders through SwiftShader, so it says nothing about speed.\n\n`
  );
  process.exit(1);
}

process.stdout.write('The lobby renders.\n');
