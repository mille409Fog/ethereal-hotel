/**
 * Builds Watershed's stored land, and checks that the committed one is still
 * the land the calibration makes.
 *
 *     npm run build:watershed-land    # run the storm in Node and write public/watershed-land.png
 *     npm run check:watershed-land    # what CI runs: is the committed land current?
 *
 * ## What the stored land is for
 *
 * `/watershed` is a simulation, and two kinds of visitor cannot watch one: a
 * device that cannot render to 32-bit float, and anyone who asked for reduced
 * motion. Both are shown this image instead, which is the reference model's own
 * output for `HERO_SEED`: `raiseLand` at `STORED_SIZE`, then every step of the
 * storm, raining as the storm's curve says (`rainAt`), exactly as the route
 * would run it. The route says on screen that the land was computed earlier by
 * the same model, and this is the computation it means.
 *
 * Only the fields the storm changes are stored. The uplift and the beds are
 * raised again from the seed in the browser, by the same `raiseLand`, so they
 * are not in the image; `stored/stored-layout.ts` has the pixel layout and the
 * reasons for it.
 *
 * ## Why `--check` does not re-run the storm
 *
 * The run takes about eleven minutes, which is a long time to make a CI job
 * wait for an answer it could have had from a digest. So the build records,
 * beside the image, a digest of everything that made it: every erosion
 * constant, the seed, the grid, the rain's curve and the layout's ranges.
 * `--check` recomputes that digest from the source as it stands and fails if
 * it differs, which is what a changed constant does until the land is rebuilt.
 * It then decodes the image and checks its shape and that it has water in it.
 *
 * What the digest cannot see is code. A change to how a step is computed, with
 * every constant left alone, makes a different land and passes the check. The
 * verifier holds the shaders to the model; nothing holds the stored land to a
 * changed model except rebuilding it, so rebuild after changing `model/`.
 *
 * ## Refusals
 *
 * The build refuses to write a file over `MOST_BYTES`, and refuses to write a
 * land whose fields do not fit the layout's ranges, rather than clamping them:
 * a clamped cut is a mountain with its valleys filled in, drawn without
 * complaint.
 *
 * `--size <n> --out <file>` runs a smaller grid into a file of your choosing,
 * which is how to try the script without waiting eleven minutes. It writes no
 * record and is never what is committed.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { mulberry32, HERO_SEED } from '../src/app/watershed/seed/seed.ts';
import { EROSION, STRATA_ENTRIES } from '../src/app/watershed/model/erosion-calibration.ts';
import { createFields } from '../src/app/watershed/model/fields.ts';
import { raiseLand } from '../src/app/watershed/model/land.ts';
import { createNoise } from '../src/app/watershed/model/noise.ts';
import { step } from '../src/app/watershed/model/step.ts';
import { strataTable, strataWarp } from '../src/app/watershed/model/strata.ts';
import { tally } from '../src/app/watershed/model/tally.ts';
import { uplift } from '../src/app/watershed/model/uplift.ts';
import { DIRECTION } from '../src/app/watershed/direction/direction-calibration.ts';
import { rainAt } from '../src/app/watershed/direction/direction.ts';
import {
  CUT_RANGE,
  REGOLITH_RANGE,
  STORED_SIZE,
  WATER_RANGE,
  outOfRange,
} from '../src/app/watershed/stored/stored-layout.ts';
import { landDigest, packLand, unpackLand } from './watershed-land.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imagePath = path.join(repoRoot, 'public', 'watershed-land.png');
const recordPath = path.join(repoRoot, 'public', 'watershed-land.json');

/** The largest stored land the build will write. It is fetched by every visitor who cannot simulate. */
export const MOST_BYTES = 1024 * 1024;

const PARTS = { random: mulberry32, createNoise, createFields, uplift, strataTable, strataWarp };

/** Everything that decides what land the build makes, and so what the digest covers. */
function madeOf(size) {
  return {
    seed: HERO_SEED,
    size,
    stormSteps: EROSION.stormSteps,
    erosion: EROSION,
    strataEntries: STRATA_ENTRIES,
    rain: {
      rainFull: DIRECTION.rainFull,
      rainEase: DIRECTION.rainEase,
      rainStop: DIRECTION.rainStop,
    },
    ranges: { cut: CUT_RANGE, regolith: REGOLITH_RANGE, water: WATER_RANGE },
  };
}

function option(name) {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
}

function fail(message) {
  process.stderr.write(`\n${message}\n\n`);
  process.exit(1);
}

const relative = (file) => path.relative(repoRoot, file).replaceAll('\\', '/');

async function check() {
  let record;
  let bytes;
  try {
    record = JSON.parse(await readFile(recordPath, 'utf8'));
    bytes = await readFile(imagePath);
  } catch {
    fail(`${relative(imagePath)} or its record is missing. Run \`npm run build:watershed-land\`.`);
  }
  const problems = [];
  const digest = landDigest(madeOf(STORED_SIZE));
  if (record.digest !== digest) {
    problems.push(
      'The stored land was built from a different calibration, seed, grid, rain or layout ' +
        'than the source now holds, so it is not the land the route would make. Rebuild it ' +
        'with `npm run build:watershed-land` (about eleven minutes).'
    );
  }
  if (bytes.length > MOST_BYTES) {
    problems.push(`It is ${bytes.length} bytes, over the ${MOST_BYTES} the build allows.`);
  }
  let land;
  try {
    land = unpackLand(bytes);
  } catch (error) {
    problems.push(`It does not decode: ${error.message}.`);
  }
  if (land) {
    if (land.size !== STORED_SIZE) {
      problems.push(
        `It is a land of ${land.size} cells a side, and the layout says ${STORED_SIZE}.`
      );
    }
    let wet = 0;
    for (let i = 2; i < land.land.length; i += 4) {
      wet += land.land[i] > 0 ? 1 : 0;
    }
    if (wet === 0) {
      problems.push('Its water channel is empty, so the land would be drawn with no water on it.');
    }
  }
  if (problems.length > 0) {
    fail(problems.join('\n'));
  }
  process.stdout.write(`${relative(imagePath)} is the land the calibration makes\n`);
}

async function build() {
  const size = Number(option('size') ?? STORED_SIZE);
  const out = option('out');
  if (size !== STORED_SIZE && out === undefined) {
    fail('A land of another size is only ever a trial: say where it goes with --out.');
  }
  const total = EROSION.stormSteps;
  const minutes = Math.max(1, Math.round((11 * (size / STORED_SIZE) ** 2 * total) / 12000));
  process.stdout.write(
    `Raising seed ${HERO_SEED} at ${size}² and running all ${total} steps of its storm. ` +
      `This takes about ${minutes} minute${minutes === 1 ? '' : 's'}.\n`
  );

  const land = raiseLand(HERO_SEED, size, EROSION, STRATA_ENTRIES, PARTS);
  const started = Date.now();
  for (let n = 0; n < total; n++) {
    step(land.fields, land.terrain, EROSION, rainAt(n / total, DIRECTION));
    if ((n + 1) % 1000 === 0) {
      const spent = (Date.now() - started) / 1000;
      const left = (spent / (n + 1)) * (total - n - 1);
      process.stdout.write(`  step ${n + 1} of ${total}, about ${Math.ceil(left / 60)} min left\n`);
    }
  }

  const refused = outOfRange(land.fields);
  if (refused.length > 0) {
    fail(`Not written: the land does not fit the layout.\n${refused.join('\n')}`);
  }
  const bytes = packLand(land.fields);
  if (bytes.length > MOST_BYTES) {
    fail(`Not written: ${bytes.length} bytes is over the ${MOST_BYTES} the build allows.`);
  }

  const most = (values) => values.reduce((a, b) => Math.max(a, b), 0);
  const counted = tally(land.fields, land.terrain, EROSION);
  const measured = {
    seconds: Math.round((Date.now() - started) / 1000),
    deepestCut: most(land.fields.cut),
    deepestRegolith: most(land.fields.regolith),
    deepestWater: most(land.fields.water),
    wetCells: land.fields.water.reduce((n, w) => n + (w > 0.01 ? 1 : 0), 0),
    rockCut: counted.cut,
    rockExported: land.fields.ledger.exported,
  };

  const target = out ? path.resolve(out) : imagePath;
  await writeFile(target, bytes);
  if (!out) {
    const record = {
      digest: landDigest(madeOf(size)),
      seed: HERO_SEED,
      size,
      steps: total,
      measured,
    };
    await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`);
  }
  process.stdout.write(
    `wrote ${out ? target : relative(target)}: ${(bytes.length / 1024).toFixed(1)} KB, ` +
      `${size * 2}×${size}, in ${measured.seconds} s\n${JSON.stringify(measured, null, 2)}\n`
  );
}

(process.argv.includes('--check') ? check() : build()).catch((error) => fail(error.stack));
