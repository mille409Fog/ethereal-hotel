/**
 * Proof that Node can run Watershed's reference model straight from its
 * TypeScript source.
 *
 *     npm run test:scripts
 *
 * The model under `src/app/watershed/model/` is used twice outside the app: a
 * script runs it to build the stored land, and another compares it with the
 * shaders. Both import the `.ts` files directly, which works only while each
 * is a leaf: Node's resolver has no extensionless resolution, and the Angular
 * build forbids a `.ts` specifier, so a model file that imports a sibling's
 * code cannot be written in a way both accept. Type-only imports are erased
 * and are fine; so is `seed.ts`, which imports nothing.
 *
 * Nothing in the app's own suite can see that rule broken. Vitest bundles, so
 * a value import between two model files passes every spec and then fails here,
 * at the first `import`, with a module-not-found. That failure is this file
 * working. The fix is to hand the dependency in as an argument, the way
 * `land.ts` takes its parts, not to add an extension.
 *
 * The same goes for syntax: Node strips types and does not transform, so an
 * `enum` or a parameter property in a model file fails here too.
 *
 * What the model computes is the app suite's to judge. This file only checks
 * that the wiring a script would write raises a land, steps it, and gets the
 * same answer twice.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { mulberry32 } from '../src/app/watershed/seed/seed.ts';
import {
  EROSION,
  STRATA_ENTRIES,
  cellSize,
  stableTimestep,
} from '../src/app/watershed/model/erosion-calibration.ts';
import { createFields } from '../src/app/watershed/model/fields.ts';
import { raiseLand } from '../src/app/watershed/model/land.ts';
import { createNoise } from '../src/app/watershed/model/noise.ts';
import { step } from '../src/app/watershed/model/step.ts';
import { strataTable, strataWarp } from '../src/app/watershed/model/strata.ts';
import { tally } from '../src/app/watershed/model/tally.ts';
import { uplift } from '../src/app/watershed/model/uplift.ts';

const PARTS = { random: mulberry32, createNoise, createFields, uplift, strataTable, strataWarp };
const SIZE = 24;
const CONSTANTS = { ...EROSION, extent: SIZE * 16 };
const SEED = 4127;

/** Raise the land a seed names and rain on it for `steps`. */
function run(steps) {
  const land = raiseLand(SEED, SIZE, CONSTANTS, STRATA_ENTRIES, PARTS);
  for (let n = 0; n < steps; n++) {
    step(land.fields, land.terrain, CONSTANTS, 1);
  }
  return land;
}

describe('the watershed model, imported by Node', () => {
  test('raises a land from a seed with the parts a script hands it', () => {
    const { fields, terrain, strata } = run(0);

    assert.equal(fields.size, SIZE);
    assert.equal(terrain.uplift.length, SIZE * SIZE);
    assert.equal(terrain.erodibility.length, STRATA_ENTRIES);
    assert.equal(strata.colours.length, STRATA_ENTRIES * 3);
    assert.equal(terrain.uplift[0], CONSTANTS.baseLevel);
    assert.ok(Math.max(...terrain.uplift) > CONSTANTS.baseLevel);
  });

  test('steps it, and the storm cuts rock and carries some of it off the block', () => {
    const { fields, terrain } = run(120);
    const counted = tally(fields, terrain, CONSTANTS);

    assert.ok(counted.cut > 0, 'no bedrock was cut');
    assert.ok(counted.water > 0, 'no water is standing');
    assert.ok(fields.ledger.exported > 0, 'no rock left the block');
    assert.ok(fields.cut.every(Number.isFinite), 'the land is not finite');
  });

  test('gets the same land twice', () => {
    const first = run(40);
    const second = run(40);

    assert.deepEqual(first.fields.cut, second.fields.cut);
    assert.deepEqual(first.fields.water, second.fields.water);
    assert.deepEqual(first.fields.ledger, second.fields.ledger);
  });

  test('exposes the stability limit a script needs to refuse a bad timestep', () => {
    const limit = stableTimestep(cellSize(SIZE, CONSTANTS), CONSTANTS);

    assert.ok(CONSTANTS.timestep < limit);
  });
});
