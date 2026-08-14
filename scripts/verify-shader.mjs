/**
 * Compile AUBADE's shaders in a real browser and render the hotel's five hours.
 *
 *     npm run verify:shader                      # compile, link, draw all five, assert
 *     npm run verify:shader -- --state shuttered # just the one
 *     npm run verify:shader -- --out docs/images/aubade-lobby.png
 *                                                # …and write each state out
 *     npm run verify:shader -- --invited --out /tmp/invited.png
 *                                                # the night rooms opened by hand
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
 * Since the room started reading the clock it proves one more thing, and it is
 * the only automatic check on the whole point of the piece: that the five solar
 * states are five *different* pictures, and that they run from dark to light in
 * the order the sun does. A rig wired to the wrong state, a uniform left
 * unwritten, or a daytime frame that came out as the night frame with the
 * brightness up all read as an ordering failure here, and none of them would
 * fail anything else in the repository.
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
import { rigFor } from '../src/aubade/rooms/light-rig.ts';
import { AUBADE_STATES } from '../src/aubade/solar/state.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Read `--name value` from argv, or fall back. Mirrors scripts/serve-dist.mjs. */
function readFlag(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

/** Read a bare `--name` switch. */
const hasFlag = (name) => process.argv.includes(`--${name}`);

const width = Number(readFlag('width', '1280'));
const height = Number(readFlag('height', '720'));
const seconds = Number(readFlag('time', '0'));
const outPath = readFlag('out', null);
const tier = QUALITY_TIERS[Number(readFlag('tier', '0'))];
const invited = hasFlag('invited');

const only = readFlag('state', null);
if (only !== null && !AUBADE_STATES.includes(only)) {
  process.stderr.write(`\nNo such state: ${only}. The five are ${AUBADE_STATES.join(', ')}.\n\n`);
  process.exit(1);
}
const states = only === null ? AUBADE_STATES : [only];

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
  rigs: states.map((state) => rigFor(state, invited)),
  // The extension decides the encoding. Five 1280×720 PNGs of this room are
  // 7.5MB, which is not a thing to commit for the sake of five screenshots; the
  // same five as WebP are a twentieth of that and the difference is invisible on
  // an image that is mostly one dark interior. PNG is still there for anyone who
  // wants a lossless frame to look at.
  mimeType: outPath !== null && outPath.endsWith('.webp') ? 'image/webp' : 'image/png',
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
  ],
};

/**
 * Compile, link, draw every rig, and report. Runs inside the page.
 *
 * Written in a loose style on purpose: this function is serialised and evaluated
 * in the browser, so it can close over nothing, must not use anything the
 * bundler would have to resolve, and reads `input` as untyped.
 *
 * One context and one program for all five states, which is not just economy: it
 * is the same claim the renderer makes. Five hours out of one compiled program is
 * what keeps the piece from stalling a driver at the exact moment the sky
 * changes, and a script that compiled five times would not be testing what ships.
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

  const frames = [];
  const pixels = new Uint8Array(input.width * input.height * 4);

  for (const rig of input.rigs) {
    gl.uniform3f(at('uKeyDirection'), rig.keyDirection.x, rig.keyDirection.y, rig.keyDirection.z);
    gl.uniform3f(at('uKeyColour'), rig.keyColour[0], rig.keyColour[1], rig.keyColour[2]);
    gl.uniform1f(at('uKeyStrength'), rig.keyStrength);
    gl.uniform3f(at('uPaneColour'), rig.paneColour[0], rig.paneColour[1], rig.paneColour[2]);
    gl.uniform1f(at('uPaneStrength'), rig.paneStrength);
    gl.uniform1f(at('uLampStrength'), rig.lampStrength);
    gl.uniform3f(at('uAmbientFloor'), rig.ambientFloor[0], rig.ambientFloor[1], rig.ambientFloor[2]);
    gl.uniform3f(at('uAmbientSky'), rig.ambientSky[0], rig.ambientSky[1], rig.ambientSky[2]);
    gl.uniform1f(at('uDust'), rig.dust);
    gl.uniform1f(at('uShutter'), rig.shutter);
    gl.uniform1f(at('uBleach'), rig.bleach);
    gl.uniform1f(at('uExposure'), rig.exposure);
    gl.uniform1f(at('uThreshold'), rig.threshold);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const glError = gl.getError();

    // Statistics over the frame, sampled on a grid rather than every pixel: this
    // is a CPU rasteriser and a full readback of two megapixels is slow enough to
    // matter to a person waiting for a gate.
    gl.readPixels(0, 0, input.width, input.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    // Distinct *luma levels*, not distinct colours. Four of these five frames are
    // night interiors: they live in the bottom eighth of the range, so binning
    // RGB counts almost nothing however good the picture is, and a threshold on
    // it would only ever measure how dark the room was. The number of separate
    // brightness steps present is what actually distinguishes an image from a
    // flat fill.
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

    frames.push({
      state: rig.state,
      glError,
      min,
      max,
      mean: total / samples,
      distinct: levels.size,
      dataUrl: canvas.toDataURL(input.mimeType, 0.92),
    });
  }

  return { ok: true, declared, frames };
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

for (const name of job.expected) {
  if (!result.declared.includes(name)) {
    problems.push(
      `The renderer writes \`${name}\`, which the linked program does not declare. ` +
        `Either it was renamed in the shader, or it was optimised away because nothing ` +
        `reads it — both are silent at runtime.`
    );
  }
}

for (const frame of result.frames) {
  if (frame.glError !== 0) {
    problems.push(`The ${frame.state} draw left GL error 0x${frame.glError.toString(16)} set.`);
  }

  // A raymarch that ends up inside a wall, or whose camera is NaN, renders a
  // perfectly uniform colour. So does a page that never drew at all, which is why
  // this is worth asserting rather than eyeballing.
  if (frame.max - frame.min < 12) {
    problems.push(
      `The ${frame.state} frame is nearly uniform (luma ${frame.min.toFixed(1)}–${frame.max.toFixed(1)}). ` +
        `That is what a camera inside a wall looks like, and what a NaN uniform looks like.`
    );
  }
  if (frame.distinct < 60) {
    problems.push(
      `Only ${frame.distinct} distinct brightness levels in the ${frame.state} frame; expected ` +
        `an image. A flat fill scores 1, a two-tone gradient a handful.`
    );
  }
  if (frame.mean < 2) {
    problems.push(`The ${frame.state} frame is essentially black (mean luma ${frame.mean.toFixed(2)}).`);
  }
  if (frame.mean > 220) {
    problems.push(`The ${frame.state} frame is blown out (mean luma ${frame.mean.toFixed(2)}).`);
  }
}

// The claim the whole phase rests on: the five hours are five pictures, and they
// brighten in the order the sun does. Asserted as an ordering rather than as five
// luma bands, because bands would have to be re-tuned every time a rig was
// nudged, and the thing actually worth defending is not any one number — it is
// that the hotel gets lighter as the night ends. A rig assigned to the wrong
// state fails this and nothing else in the repository.
if (only === null && !invited) {
  const means = result.frames.map((frame) => frame.mean);

  for (let i = 1; i < result.frames.length; i += 1) {
    if (means[i] <= means[i - 1]) {
      problems.push(
        `The ${result.frames[i].state} frame (mean luma ${means[i].toFixed(1)}) is no brighter ` +
          `than ${result.frames[i - 1].state} (${means[i - 1].toFixed(1)}). The five states are ` +
          `ordered darkest to brightest in solar/state.ts; the rigs in rooms/light-rig.ts have ` +
          `stopped agreeing with that order.`
      );
    }
  }

  // And the two ends are not merely ordered but different pictures. Two-thirds
  // is well inside the gap the rigs actually produce and well outside anything
  // an accidentally-shared rig could reach.
  const [night] = means;
  const day = means[means.length - 1];
  if (day < night * 3) {
    problems.push(
      `Day (mean luma ${day.toFixed(1)}) is less than three times as bright as astronomical ` +
        `night (${night.toFixed(1)}). AUBADE asks for a daytime piece that stands alone, not ` +
        `the night frame with the exposure raised.`
    );
  }
}

if (outPath !== null) {
  const parsed = path.parse(path.resolve(repoRoot, outPath));
  await mkdir(parsed.dir, { recursive: true });

  for (const frame of result.frames) {
    // One file per state, always suffixed — even for a single `--state`, so the
    // name says which hour is in the picture. A screenshot of a piece whose whole
    // subject is the hour should not have to be identified by eye.
    const target = path.join(parsed.dir, `${parsed.name}-${frame.state}${parsed.ext}`);
    await writeFile(target, Buffer.from(frame.dataUrl.split(',')[1], 'base64'));
    process.stdout.write(`wrote ${path.relative(repoRoot, target)}\n`);
  }
}

process.stdout.write(
  `lobby.frag: compiled and linked, ${result.declared.length} uniforms, ` +
    `${result.frames.length} state${result.frames.length === 1 ? '' : 's'} at ${width}×${height}.\n`
);
for (const frame of result.frames) {
  process.stdout.write(
    `  ${frame.state.padEnd(10)} luma ${frame.min.toFixed(1)}–${frame.max.toFixed(1)} ` +
      `(mean ${frame.mean.toFixed(1)}), ${frame.distinct} levels\n`
  );
}

if (problems.length > 0) {
  process.stderr.write(`\nThe shader compiled, but a frame is wrong:\n\n`);
  for (const problem of problems) {
    process.stderr.write(`  ${problem}\n`);
  }
  process.stderr.write(
    `\nRe-run with \`-- --out docs/images/aubade-lobby.png\` and look at them.\n` +
      `Note that this renders through SwiftShader, so it says nothing about speed.\n\n`
  );
  process.exit(1);
}

process.stdout.write('The lobby renders, at every hour.\n');
