/**
 * Compile AUBADE's shader in a real browser and render the hotel's floors and
 * hours.
 *
 *     npm run verify:shader                      # compile, link, draw everything, assert
 *     npm run verify:shader -- --state shuttered # just the one hour
 *     npm run verify:shader -- --floor corridor  # just the one floor
 *     npm run verify:shader -- --out docs/images/aubade.webp
 *                                                # …and write each frame out
 *     npm run verify:shader -- --invited --out /tmp/invited.png
 *                                                # the night rooms opened by hand
 *
 * ## Why this exists
 *
 * The GLSL in `src/aubade/rooms/` is the only code in this repository whose
 * compiler runs after deployment. Everything else is checked before it ships —
 * TypeScript by `tsc`, the Python by `mypy --strict`, the templates by
 * `angular-eslint`. A misplaced semicolon in the fragment shader passes every one
 * of those gates, passes the unit tests (which drive a stub context that never
 * looks at the source), deploys, and then shows a visitor a blank page with one
 * line in a console they will not open.
 *
 * So the shader gets a compiler too. Playwright's Chromium renders WebGL2 through
 * SwiftShader in headless mode, which is a real ANGLE front end over a real GLSL
 * compiler: if it rejects the source, so will a driver.
 *
 * ## What it does and does not prove
 *
 * It proves the source compiles and links, that every uniform the renderer writes
 * actually exists in the program, that a draw call produces no GL error, and that
 * the result is an image rather than a flat colour — which is the usual symptom of
 * a raymarch whose camera ended up inside a wall, and is otherwise
 * indistinguishable from "the page did not load".
 *
 * Since the rooms started reading the clock it proves two more things, and they
 * are the only automatic checks on the whole point of the piece.
 *
 * **The lobby brightens in the order the sun does.** Five states, five pictures,
 * running dark to light. A rig wired to the wrong state, a uniform left unwritten,
 * or a daytime frame that came out as the night frame with the brightness up all
 * read as an ordering failure here, and none of them would fail anything else.
 *
 * **The corridor darkens instead.** Floor −1 has no window and its light is its
 * own; AUBADE's `late` state is "rooms begin closing behind you, lights go out in
 * the order you are not looking", so the corridor's gas goes down as the lobby's
 * sky comes up. Asserting the lobby's ordering on the corridor would be asserting
 * the opposite of the truth, so the two floors are checked against their own
 * claims. See `rooms/corridor-rig.ts`.
 *
 * It proves nothing about **speed**. SwiftShader is a CPU rasteriser and its frame
 * times have no relationship to a GPU's. The frame budget is a separate claim,
 * checked by looking at the thing on real hardware.
 *
 * Nor does it prove the image is *good*. That is a judgement, it is the actual
 * Definition of Done for these phases, and no script is going to make it — which
 * is what `--out` is for. It is emphatically not going to make the judgement Floor
 * −1's Definition of Done asks for, which is whether a stranger reads the missing
 * reflection as deliberate inside ten seconds. That needs a stranger.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

import { FULLSCREEN_VERTEX_SHADER } from '../src/aubade/rooms/fullscreen.vert.ts';
import { HOTEL_FRAGMENT_SHADER } from '../src/aubade/rooms/hotel.frag.ts';
import { breathe } from '../src/aubade/camera/drift.ts';
import { QUALITY_TIERS } from '../src/aubade/gl/quality.ts';
import { cellarRigFor } from '../src/aubade/rooms/cellar-rig.ts';
import { corridorRigFor } from '../src/aubade/rooms/corridor-rig.ts';
import { libraryRigFor } from '../src/aubade/rooms/library-rig.ts';
import { rigFor } from '../src/aubade/rooms/light-rig.ts';
import { breathAt } from '../src/aubade/cellar.ts';
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

/**
 * The positions of the lift that get a committed frame.
 *
 * `lift`, `descent` and `sinking` are not floors and that is exactly why they are
 * here. They are the three rides caught halfway, where two distance fields are
 * being evaluated and mixed, and they are the things in the piece whose whole
 * justification is that they look like something. A phase whose spectacle has no
 * committed frame has no way of noticing when the spectacle stops working.
 *
 * `arriving` is not a floor either, and it is the strangest entry here: it is Floor
 * −3 at the same depth as `cellar` and a different *visitor*. Floor −3 is the one
 * room in the hotel that is not a function of the hour alone — see
 * `rooms/cellar-rig.ts` — so a single frame per state cannot describe it. Two can:
 * the room a visitor walks into, and the room ninety seconds of stillness turns it
 * into. The pair is what the cellar's assertions below are actually about.
 *
 * It carries `probe`, which is the one entry that does, and that is because of what
 * the five arriving frames turn out to be. Nothing in the cellar's rig varies with
 * the hour except the adaptation ceiling, and stillness zero multiplies that out —
 * so all five of them are the same picture, necessarily, and committing five copies
 * of one image would be committing a redundancy rather than a reference. They are
 * rendered on every run and asserted three ways; `--out` skips them unless
 * `--floor arriving` asks for one specifically.
 */
const FLOORS = [
  { name: 'lobby', depth: 0 },
  { name: 'lift', depth: 0.5 },
  { name: 'corridor', depth: 1 },
  { name: 'descent', depth: 1.5 },
  { name: 'library', depth: 2 },
  { name: 'sinking', depth: 2.5 },
  { name: 'arriving', depth: 3, stillness: 0, probe: true },
  { name: 'cellar', depth: 3, stillness: 1 },
];

/** The entries `--out` writes only when they are asked for by name. */
const PROBES = new Set(FLOORS.filter((floor) => floor.probe).map((floor) => floor.name));

const onlyState = readFlag('state', null);
if (onlyState !== null && !AUBADE_STATES.includes(onlyState)) {
  process.stderr.write(`\nNo such state: ${onlyState}. The five are ${AUBADE_STATES.join(', ')}.\n\n`);
  process.exit(1);
}

const onlyFloor = readFlag('floor', null);
if (onlyFloor !== null && !FLOORS.some((floor) => floor.name === onlyFloor)) {
  const names = FLOORS.map((floor) => floor.name).join(', ');
  process.stderr.write(`\nNo such floor: ${onlyFloor}. They are ${names}.\n\n`);
  process.exit(1);
}

const states = onlyState === null ? AUBADE_STATES : [onlyState];
const floors = onlyFloor === null ? FLOORS : FLOORS.filter((floor) => floor.name === onlyFloor);

// An override, for looking at a ride at some other point than halfway. Names the
// depth, so 1.5 is halfway down the second leg rather than halfway down the shaft.
const depthOverride = readFlag('depth', null);

/**
 * Everything the page needs, gathered here so the browser side stays a pure
 * function of its argument and can be read without cross-referencing.
 *
 * The camera is per-frame rather than global, because it is a function of the lift
 * as well as of the clock — `breathe(seconds, morph)` interpolates between the two
 * floors' anchors and sags in the middle of the ride. A single camera would put
 * the corridor's frames in the lobby's eye position, which is inside a wall.
 */
const job = {
  vertexSource: FULLSCREEN_VERTEX_SHADER,
  fragmentSource: HOTEL_FRAGMENT_SHADER,
  width,
  height,
  seconds,
  tier,
  frames: floors.flatMap((floor) => {
    const depth = depthOverride === null ? floor.depth : Number(depthOverride);
    return states.map((state) => ({
      state,
      floor: floor.name,
      depth,
      camera: breathe(seconds, depth, breathAt(seconds)),
      lobby: rigFor(state, invited),
      corridor: corridorRigFor(state, invited),
      library: libraryRigFor(state, invited),
      cellar: cellarRigFor(state, invited),
      // A visitor who has already settled, unless the entry says otherwise. The
      // committed frames are the room as somebody who stayed sees it, because that
      // is the room the phase claims to have built; `arriving` is the one entry
      // that overrides it, and the pair of them is Floor −3's whole assertion.
      stillness: floor.stillness ?? 1,
      // The camera's own pacing, evaluated at the same second, so a frame and the
      // eye position it was drawn from can never disagree about where in the breath
      // they are.
      breath: breathAt(seconds),
    }));
  }),
  // The extension decides the encoding. Five 1280×720 PNGs of this room are 7.5MB,
  // which is not a thing to commit for the sake of a few screenshots; the same
  // five as WebP are a twentieth of that and the difference is invisible on an
  // image that is mostly one dark interior. PNG is still there for anyone who
  // wants a lossless frame to look at.
  mimeType: outPath !== null && outPath.endsWith('.webp') ? 'image/webp' : 'image/png',
  // Asserted against the program's own reflection: a uniform the renderer writes
  // but the shader does not declare is a silent no-op, and a renamed one is how a
  // piece ends up frozen at time zero with nothing in the console.
  expected: [
    'uResolution',
    'uTime',
    'uEye',
    'uTarget',
    'uRoll',
    'uDepth',
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
    'uStillness',
    'uBreath',
  ],
};

/**
 * Compile, link, draw every frame, and report. Runs inside the page.
 *
 * Written in a loose style on purpose: this function is serialised and evaluated
 * in the browser, so it can close over nothing, must not use anything the bundler
 * would have to resolve, and reads `input` as untyped.
 *
 * One context and one program for every floor and every hour, which is not just
 * economy: it is the same claim the renderer makes. Two rooms and five hours out
 * of one compiled program is what keeps the piece from stalling a driver at the
 * exact moment the sky changes or the lift doors close, and a script that compiled
 * twice would not be testing what ships.
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
  gl.uniform1i(at('uMarchSteps'), input.tier.marchSteps);
  gl.uniform1i(at('uShadowSteps'), input.tier.shadowSteps);
  gl.uniform1i(at('uVolumetricSamples'), input.tier.volumetricSamples);

  gl.viewport(0, 0, input.width, input.height);

  const rendered = [];
  const pixels = new Uint8Array(input.width * input.height * 4);

  for (const frame of input.frames) {
    const camera = frame.camera;
    gl.uniform3f(at('uEye'), camera.eye.x, camera.eye.y, camera.eye.z);
    gl.uniform3f(at('uTarget'), camera.target.x, camera.target.y, camera.target.z);
    gl.uniform1f(at('uRoll'), camera.roll);
    gl.uniform1f(at('uDepth'), frame.depth);

    const lobby = frame.lobby;
    gl.uniform3f(at('uKeyDirection'), lobby.keyDirection.x, lobby.keyDirection.y, lobby.keyDirection.z);
    gl.uniform3f(at('uKeyColour'), lobby.keyColour[0], lobby.keyColour[1], lobby.keyColour[2]);
    gl.uniform1f(at('uKeyStrength'), lobby.keyStrength);
    gl.uniform3f(at('uPaneColour'), lobby.paneColour[0], lobby.paneColour[1], lobby.paneColour[2]);
    gl.uniform1f(at('uPaneStrength'), lobby.paneStrength);
    gl.uniform1f(at('uLampStrength'), lobby.lampStrength);
    gl.uniform3f(at('uAmbientFloor'), lobby.ambientFloor[0], lobby.ambientFloor[1], lobby.ambientFloor[2]);
    gl.uniform3f(at('uAmbientSky'), lobby.ambientSky[0], lobby.ambientSky[1], lobby.ambientSky[2]);
    gl.uniform1f(at('uDust'), lobby.dust);
    gl.uniform1f(at('uShutter'), lobby.shutter);
    gl.uniform1f(at('uBleach'), lobby.bleach);
    gl.uniform1f(at('uExposure'), lobby.exposure);
    gl.uniform1f(at('uThreshold'), lobby.threshold);

    const corridor = frame.corridor;
    gl.uniform3f(at('uSconceColour'), corridor.sconceColour[0], corridor.sconceColour[1], corridor.sconceColour[2]);
    gl.uniform1f(at('uSconceStrength'), corridor.sconceStrength);
    gl.uniform3f(at('uShaftDirection'), corridor.shaftDirection.x, corridor.shaftDirection.y, corridor.shaftDirection.z);
    gl.uniform3f(at('uShaftColour'), corridor.shaftColour[0], corridor.shaftColour[1], corridor.shaftColour[2]);
    gl.uniform1f(at('uShaftStrength'), corridor.shaftStrength);
    gl.uniform3f(at('uCorridorFloor'), corridor.ambientFloor[0], corridor.ambientFloor[1], corridor.ambientFloor[2]);
    gl.uniform3f(at('uCorridorSky'), corridor.ambientSky[0], corridor.ambientSky[1], corridor.ambientSky[2]);
    gl.uniform1f(at('uCorridorDust'), corridor.dust);

    const library = frame.library;
    gl.uniform3f(at('uReadingColour'), library.readingColour[0], library.readingColour[1], library.readingColour[2]);
    gl.uniform1f(at('uReadingStrength'), library.readingStrength);
    gl.uniform1f(at('uInk'), library.inkStrength);
    gl.uniform1f(at('uLibraryExposure'), library.exposure);
    gl.uniform3f(at('uLibraryFloor'), library.ambientFloor[0], library.ambientFloor[1], library.ambientFloor[2]);
    gl.uniform3f(at('uLibrarySky'), library.ambientSky[0], library.ambientSky[1], library.ambientSky[2]);
    gl.uniform1f(at('uLibraryDust'), library.dust);

    const cellar = frame.cellar;
    gl.uniform3f(at('uCandleColour'), cellar.candleColour[0], cellar.candleColour[1], cellar.candleColour[2]);
    gl.uniform1f(at('uCandleStrength'), cellar.candleStrength);
    gl.uniform1f(at('uAdaptation'), cellar.adaptation);
    gl.uniform1f(at('uCellarExposure'), cellar.exposure);
    gl.uniform3f(at('uCellarFloor'), cellar.ambientFloor[0], cellar.ambientFloor[1], cellar.ambientFloor[2]);
    gl.uniform3f(at('uCellarSky'), cellar.ambientSky[0], cellar.ambientSky[1], cellar.ambientSky[2]);
    gl.uniform1f(at('uCellarDust'), cellar.dust);

    gl.uniform1f(at('uStillness'), frame.stillness);
    gl.uniform1f(at('uBreath'), frame.breath);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const glError = gl.getError();

    // Statistics over the frame, sampled on a grid rather than every pixel: this
    // is a CPU rasteriser and a full readback of two megapixels is slow enough to
    // matter to a person waiting for a gate.
    gl.readPixels(0, 0, input.width, input.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    // Distinct *luma levels*, not distinct colours. Most of these frames are night
    // interiors: they live in the bottom eighth of the range, so binning RGB counts
    // almost nothing however good the picture is, and a threshold on it would only
    // ever measure how dark the room was. The number of separate brightness steps
    // present is what actually distinguishes an image from a flat fill.
    // The spread is carried as well as the mean, and it exists for Floor −2. That
    // floor's claim is that its light does not change and its *writing* does, so a
    // mean is exactly the statistic that cannot see it — the room is the same
    // brightness at every hour. What falls as the gilt goes is the variation
    // between neighbouring pixels, which is what a standard deviation measures.
    // Chroma is carried as well, and it exists for Floor −3. That floor's reward
    // for stillness is not only a brighter room but a *colourless* one — rods are
    // monochromatic, so a dark-adapted eye drains the hue out of everything it is
    // finally able to see. Neither a mean nor a deviation can tell that apart from
    // the exposure being raised, which is the failure mode the whole piece is most
    // prone to, so the spread between the channels is measured directly.
    let min = 255;
    let max = 0;
    let total = 0;
    let totalSquares = 0;
    let totalChroma = 0;
    let samples = 0;
    const levels = new Set();
    for (let y = 0; y < input.height; y += 4) {
      for (let x = 0; x < input.width; x += 4) {
        const offset = (y * input.width + x) * 4;
        const red = pixels[offset];
        const green = pixels[offset + 1];
        const blue = pixels[offset + 2];
        const luma = (red * 3 + green * 6 + blue) / 10;
        min = Math.min(min, luma);
        max = Math.max(max, luma);
        total += luma;
        totalSquares += luma * luma;
        totalChroma += Math.max(red, green, blue) - Math.min(red, green, blue);
        samples += 1;
        levels.add(Math.round(luma));
      }
    }
    const mean = total / samples;
    const deviation = Math.sqrt(Math.max(totalSquares / samples - mean * mean, 0));

    rendered.push({
      state: frame.state,
      floor: frame.floor,
      depth: frame.depth,
      glError,
      min,
      max,
      mean,
      deviation,
      chroma: totalChroma / samples,
      distinct: levels.size,
      dataUrl: canvas.toDataURL(input.mimeType, 0.92),
    });
  }

  return { ok: true, declared, frames: rendered };
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

/** The frames for one floor, in the order the states are declared. */
const floorFrames = (name) => result.frames.filter((frame) => frame.floor === name);

for (const frame of result.frames) {
  const label = `${frame.floor} ${frame.state}`;

  if (frame.glError !== 0) {
    problems.push(`The ${label} draw left GL error 0x${frame.glError.toString(16)} set.`);
  }

  // A raymarch that ends up inside a wall, or whose camera is NaN, renders a
  // perfectly uniform colour. So does a page that never drew at all, which is why
  // this is worth asserting rather than eyeballing.
  if (frame.max - frame.min < 12) {
    problems.push(
      `The ${label} frame is nearly uniform (luma ${frame.min.toFixed(1)}–${frame.max.toFixed(1)}). ` +
        `That is what a camera inside a wall looks like, and what a NaN uniform looks like.`
    );
  }
  if (frame.distinct < 60) {
    problems.push(
      `Only ${frame.distinct} distinct brightness levels in the ${label} frame; expected ` +
        `an image. A flat fill scores 1, a two-tone gradient a handful.`
    );
  }
  if (frame.mean < 2) {
    problems.push(`The ${label} frame is essentially black (mean luma ${frame.mean.toFixed(2)}).`);
  }
  if (frame.mean > 220) {
    problems.push(`The ${label} frame is blown out (mean luma ${frame.mean.toFixed(2)}).`);
  }
}

// The claim the day-and-night phase rests on: the lobby's five hours are five
// pictures, and they brighten in the order the sun does. Asserted as an ordering
// rather than as five luma bands, because bands would have to be re-tuned every
// time a rig was nudged, and the thing actually worth defending is not any one
// number — it is that the hotel gets lighter as the night ends.
if (onlyState === null && !invited) {
  const lobby = floorFrames('lobby');

  if (lobby.length === AUBADE_STATES.length) {
    const means = lobby.map((frame) => frame.mean);

    for (let i = 1; i < lobby.length; i += 1) {
      if (means[i] <= means[i - 1]) {
        problems.push(
          `The lobby's ${lobby[i].state} frame (mean luma ${means[i].toFixed(1)}) is no brighter ` +
            `than ${lobby[i - 1].state} (${means[i - 1].toFixed(1)}). The five states are ` +
            `ordered darkest to brightest in solar/state.ts; the rigs in rooms/light-rig.ts have ` +
            `stopped agreeing with that order.`
        );
      }
    }

    // And the two ends are not merely ordered but different pictures. Three times
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

  // The corridor's own claim, and it is the opposite one. Floor −1 has no window;
  // its light is seven gas sconces that are turned down as the night ends, which is
  // AUBADE's "rooms begin closing behind you" with numbers in it. Checked over the
  // three states before the sun is in play at all — from `aubade` onwards the blade
  // down the lift shaft starts adding light back, and the interesting fact about
  // those two frames is not their brightness but where it is coming from.
  const corridor = floorFrames('corridor');
  const closing = ['open', 'late', 'warning']
    .map((state) => corridor.find((frame) => frame.state === state))
    .filter((frame) => frame !== undefined);

  for (let i = 1; i < closing.length; i += 1) {
    if (closing[i].mean >= closing[i - 1].mean) {
      problems.push(
        `The corridor's ${closing[i].state} frame (mean luma ${closing[i].mean.toFixed(1)}) is no ` +
          `darker than ${closing[i - 1].state} (${closing[i - 1].mean.toFixed(1)}). Floor −1 has ` +
          `no window: its gas goes down as the night ends, which is what "rooms begin closing ` +
          `behind you" means in rooms/corridor-rig.ts. A corridor that brightens with the sun has ` +
          `been wired to the lobby's rig.`
      );
    }
  }

  // The library's claim, and it is a third different one rather than a third
  // dimmer switch. Floor −2 has no window and no daylight ever reaches it, so its
  // lamps burn at exactly the same strength at every hour — five of the six fields
  // in rooms/library-rig.ts are identical across all five states on purpose. What
  // the sun takes from this floor is the writing.
  //
  // So the mean is asserted *flat* rather than ordered, which is the one thing
  // neither floor above it does…
  const library = floorFrames('library');

  if (library.length === AUBADE_STATES.length) {
    const means = library.map((frame) => frame.mean);
    const brightest = Math.max(...means);
    const dimmest = Math.min(...means);

    if (brightest - dimmest > brightest * 0.12) {
      problems.push(
        `The library's five frames span mean luma ${dimmest.toFixed(1)}–${brightest.toFixed(1)}, ` +
          `which is more than a tenth of its own brightness. Floor −2 is lit identically at every ` +
          `hour — see rooms/library-rig.ts, where five of six fields are the same in all five ` +
          `rigs. A library that dims with the sun has been wired to another floor's rig, and the ` +
          `whole point of the room is that it does not.`
      );
    }

    // …and the spread is asserted falling, which is that writing going. It has to
    // be a spread and not a mean precisely because the room does not get darker:
    // the gilt is the only thing leaving, so the only thing that changes is how
    // much a pixel differs from its neighbours.
    const spreads = library.map((frame) => frame.deviation);
    for (let i = 1; i < library.length; i += 1) {
      if (spreads[i] >= spreads[i - 1]) {
        problems.push(
          `The library's ${library[i].state} frame is no less varied than ${library[i - 1].state} ` +
            `(luma deviation ${spreads[i].toFixed(2)} against ${spreads[i - 1].toFixed(2)}). uInk ` +
            `is supposed to take the gilt off the spines as the night ends; a library whose ` +
            `contrast holds through dawn still has its writing at noon.`
        );
      }
    }

    if (spreads[0] < spreads[spreads.length - 1] * 1.15) {
      problems.push(
        `The library at astronomical night is barely more varied than at noon (deviation ` +
          `${spreads[0].toFixed(2)} against ${spreads[spreads.length - 1].toFixed(2)}). uInk is ` +
          `reaching the shader but is not doing enough to be seen, which makes the floor's one ` +
          `answer to the clock invisible.`
      );
    }
  }

  // The cellar's claim, and it is a fourth different one again. Floor −3 is lit
  // identically at every hour like Floor −2, but what the sun moves here is not in
  // the room at all: it is the ceiling on how far a visitor's own eyes can adapt,
  // which is exactly zero at noon. See `rooms/cellar-rig.ts`.
  //
  // So the statistic has to be a *pair* of frames rather than a series, which is
  // the one shape none of the three floors above uses. `arriving` and `cellar` are
  // the same room at the same hour seen by a visitor who has just walked in and one
  // who has stood still for ninety seconds, and the whole floor is the difference
  // between them: large at astronomical night, and nothing whatever at noon.
  const arriving = floorFrames('arriving');
  const cellar = floorFrames('cellar');

  const pairFor = (state) => [
    arriving.find((frame) => frame.state === state),
    cellar.find((frame) => frame.state === state),
  ];

  // The room a visitor walks into is the same room at every hour — not similar, the
  // same, because nothing in CELLAR_RIGS varies except the ceiling and stillness
  // zero multiplies that out. It is the plainest possible statement of the floor's
  // claim that the sun does not touch this room, and it is also the assertion that
  // would catch a stray uHour term wired into the cellar's lighting by somebody
  // making it "respond to the clock like the others do".
  if (arriving.length === AUBADE_STATES.length) {
    const [reference] = arriving;
    for (const frame of arriving.slice(1)) {
      if (Math.abs(frame.mean - reference.mean) > 0.05) {
        problems.push(
          `The cellar on arrival differs between ${reference.state} and ${frame.state} ` +
            `(mean luma ${reference.mean.toFixed(3)} against ${frame.mean.toFixed(3)}). Before a ` +
            `visitor has kept still, Floor −3 is supposed to be one picture at all five hours: ` +
            `nothing in rooms/cellar-rig.ts varies but the adaptation ceiling, and stillness zero ` +
            `multiplies that out. Something on this floor has been wired to the sun directly.`
        );
      }
    }
  }

  const [walkedIn, stayed] = pairFor('open');
  if (walkedIn !== undefined && stayed !== undefined) {
    if (stayed.mean < walkedIn.mean * 3) {
      problems.push(
        `At astronomical night the cellar after ninety seconds of stillness (mean luma ` +
          `${stayed.mean.toFixed(1)}) is less than three times as bright as the cellar on ` +
          `arrival (${walkedIn.mean.toFixed(1)}). uStillness and uAdaptation are supposed to ` +
          `open the room up by an order of magnitude in adapted(); a floor whose reward is a ` +
          `slight lift is a floor that asked for ninety seconds and gave nothing back.`
      );
    }

    // And it is not merely brighter. A gain alone would be the room with the
    // exposure raised, which is precisely what the daytime lobby is checked against
    // one floor at a time — so the drain has to show as well. A dark-adapted eye is
    // colourless, and the rendered frame has to be measurably less coloured.
    if (stayed.chroma >= walkedIn.chroma) {
      problems.push(
        `The settled cellar is no less coloured than the one on arrival (mean chroma ` +
          `${stayed.chroma.toFixed(2)} against ${walkedIn.chroma.toFixed(2)}). SCOTOPIC_DRAIN in ` +
          `hotel.frag.ts is supposed to take the colour out as the rods take over; without it ` +
          `the floor is the same picture with the exposure up, which is the one thing every ` +
          `other room here is checked against.`
      );
    }
  }

  // The exact half of the claim, and the one that would fail silently. At noon the
  // ceiling is exactly zero, so ninety seconds of perfect stillness has to buy
  // *exactly nothing* — the same frame, to within the noise of a rounded byte.
  // A ceiling of 0.03 renders a room that resolves very slightly, which looks
  // entirely fine and has quietly turned an argument into a gradient.
  const [shutIn, shutStayed] = pairFor('shuttered');
  if (shutIn !== undefined && shutStayed !== undefined) {
    if (Math.abs(shutIn.mean - shutStayed.mean) > 0.05) {
      problems.push(
        `At noon the cellar changes when the visitor keeps still (mean luma ` +
          `${shutIn.mean.toFixed(3)} on arrival against ${shutStayed.mean.toFixed(3)} after ` +
          `ninety seconds). CELLAR_RIGS.shuttered.adaptation is meant to be exactly 0: a ` +
          `daytime visitor gets the room they walked into and no other, however long they stand ` +
          `in it. Something is reading uStillness without going through settledInto().`
      );
    }
  }

  // The ceiling falls with the sun, which is the ordering claim — made over the
  // settled frames, because the arriving ones are identical by construction and
  // ordering them would be asserting that a constant is monotonic.
  if (cellar.length === AUBADE_STATES.length) {
    const means = cellar.map((frame) => frame.mean);
    for (let i = 1; i < cellar.length; i += 1) {
      if (means[i] >= means[i - 1]) {
        problems.push(
          `The settled cellar's ${cellar[i].state} frame (mean luma ${means[i].toFixed(1)}) is ` +
            `no darker than ${cellar[i - 1].state} (${means[i - 1].toFixed(1)}). ` +
            `CELLAR_RIGS.adaptation is supposed to fall as the night ends: a visitor arriving ` +
            `nearer dawn has more of the day still in their eyes and gets less of the room for ` +
            `the same ninety seconds.`
        );
      }
    }
  }

  // A ride is between two floors and has to look like neither. A ride whose halfway
  // frame matches one of its endpoints is a cut with a delay in it, which is the
  // one thing "visible and unhurried" rules out — and it is exactly what a morph
  // curve that saturates at an endpoint produces. All three legs, against both of
  // their own endpoints.
  //
  // The third leg's lower endpoint is `arriving` rather than `cellar`, and that is
  // not a detail: a visitor stepping out of the lift has by definition not been
  // standing still yet, so the settled frame is not the room the ride ends in.
  for (const [ride, ends] of [
    ['lift', ['lobby', 'corridor']],
    ['descent', ['corridor', 'library']],
    ['sinking', ['library', 'arriving']],
  ]) {
    for (const moving of floorFrames(ride)) {
      for (const floor of ends) {
        const settled = floorFrames(floor).find((frame) => frame.state === moving.state);
        if (settled === undefined) {
          continue;
        }

        // Every statistic, not just the mean. A cut with a delay in it renders the
        // *same picture* as its endpoint, so it matches on all three; a genuine mix
        // of two distance fields can land on one of them by coincidence and does —
        // halfway down the third leg the hybrid room's mean luma crossed the
        // settled library's at exactly one hour of the five, while its contrast and
        // its colour were nowhere near it. Requiring all three is a stricter test of
        // the thing actually being claimed and a looser one only against the
        // coincidence.
        const same =
          Math.abs(settled.mean - moving.mean) < 0.5 &&
          Math.abs(settled.deviation - moving.deviation) < 0.3 &&
          Math.abs(settled.chroma - moving.chroma) < 0.5;

        if (same) {
          problems.push(
            `Halfway through the ${ride} the ${moving.state} frame is indistinguishable from the ` +
              `settled ${floor} (mean luma ${moving.mean.toFixed(1)} against ${settled.mean.toFixed(1)}, ` +
              `sd ${moving.deviation.toFixed(2)} against ${settled.deviation.toFixed(2)}, chroma ` +
              `${moving.chroma.toFixed(2)} against ${settled.chroma.toFixed(2)}). The lift is ` +
              `supposed to be a mix of two distance fields, not a cut between them.`
          );
        }
      }
    }
  }
}

if (outPath !== null) {
  const parsed = path.parse(path.resolve(repoRoot, outPath));
  await mkdir(parsed.dir, { recursive: true });

  for (const frame of result.frames) {
    // Probes are rendered and asserted but not written out, unless somebody asked
    // for that one by name — see the note on FLOORS.
    if (PROBES.has(frame.floor) && onlyFloor !== frame.floor) {
      continue;
    }

    // One file per floor per state, always suffixed — even for a single `--state`,
    // so the name says which hour and which floor is in the picture. A screenshot
    // of a piece whose whole subject is the hour should not have to be identified
    // by eye.
    const target = path.join(parsed.dir, `${parsed.name}-${frame.floor}-${frame.state}${parsed.ext}`);
    await writeFile(target, Buffer.from(frame.dataUrl.split(',')[1], 'base64'));
    process.stdout.write(`wrote ${path.relative(repoRoot, target)}\n`);
  }
}

process.stdout.write(
  `hotel.frag: compiled and linked, ${result.declared.length} uniforms, ` +
    `${result.frames.length} frame${result.frames.length === 1 ? '' : 's'} at ${width}×${height}.\n`
);
for (const frame of result.frames) {
  process.stdout.write(
    `  ${frame.floor.padEnd(9)} ${frame.state.padEnd(10)} luma ${frame.min.toFixed(1)}–${frame.max.toFixed(1)} ` +
      `(mean ${frame.mean.toFixed(1)}, sd ${frame.deviation.toFixed(2)}, chroma ` +
      `${frame.chroma.toFixed(2)}), ${frame.distinct} levels\n`
  );
}

if (problems.length > 0) {
  process.stderr.write(`\nThe shader compiled, but a frame is wrong:\n\n`);
  for (const problem of problems) {
    process.stderr.write(`  ${problem}\n`);
  }
  process.stderr.write(
    `\nRe-run with \`-- --out docs/images/aubade.png\` and look at them.\n` +
      `Note that this renders through SwiftShader, so it says nothing about speed.\n\n`
  );
  process.exit(1);
}

process.stdout.write('The hotel renders, on every floor, at every hour.\n');
