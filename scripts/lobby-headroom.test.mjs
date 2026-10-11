/**
 * The tests that judge the lobby headroom reporter.
 *
 *     npm run test:scripts
 *
 * The judgement is the part worth testing: a reporter that calls a tight run
 * fine is the silence this file exists to end, and one that cries wolf on every
 * run is a warning people learn to scroll past. The last block reads the e2e
 * helper itself, because the annotation name is declared twice and a drift would
 * leave the reporter with nothing to judge and no failure anywhere.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  assessHeadroom,
  describeHeadroom,
  LOBBY_ANNOTATION,
  readAnnotation,
  WARN_AT,
} from './lobby-headroom.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUDGET = 45_000;

const sample = (title, ms) => ({ title, ms });

describe('assessHeadroom', () => {
  test('has nothing to judge when nothing waited for the lobby', () => {
    assert.deepEqual(assessHeadroom([], BUDGET), { verdict: 'none', worst: null, used: 0 });
  });

  test('judges the slowest wait, not the first or the last', () => {
    const headroom = assessHeadroom(
      [sample('a', 4_000), sample('b', 18_000), sample('c', 9_000)],
      BUDGET
    );
    assert.deepEqual(headroom.worst, sample('b', 18_000));
    assert.equal(headroom.used, 18_000 / BUDGET);
    assert.equal(headroom.verdict, 'ok');
  });

  test('calls a run tight once the slowest wait is past the line', () => {
    const headroom = assessHeadroom([sample('a', 30_000)], BUDGET);
    assert.equal(headroom.verdict, 'tight');
    assert.equal(headroom.used, 30_000 / BUDGET);
  });

  test('exactly at the line is still ok', () => {
    assert.equal(assessHeadroom([sample('a', BUDGET * WARN_AT)], BUDGET).verdict, 'ok');
  });

  test('takes the line it is given', () => {
    assert.equal(assessHeadroom([sample('a', 10_000)], BUDGET, 0.2).verdict, 'tight');
    assert.equal(assessHeadroom([sample('a', 10_000)], BUDGET, 0.3).verdict, 'ok');
  });

  test('keeps the first of two equally slow waits', () => {
    const headroom = assessHeadroom([sample('first', 12_000), sample('second', 12_000)], BUDGET);
    assert.equal(headroom.worst?.title, 'first');
  });

  test('reports a wait over the budget rather than capping it', () => {
    assert.equal(assessHeadroom([sample('a', 90_000)], BUDGET).used, 2);
  });

  test('ignores a wait that is not a real duration', () => {
    // NaN loses every comparison, so a careless max would neither pick it nor
    // notice it was there — and a negative or infinite one would win or lose
    // for the wrong reason.
    const headroom = assessHeadroom(
      [
        sample('nan', Number.NaN),
        sample('real', 5_000),
        sample('neg', -1),
        sample('inf', Infinity),
      ],
      BUDGET
    );
    assert.deepEqual(headroom.worst, sample('real', 5_000));
  });

  test('has nothing to judge when no wait is a real duration', () => {
    assert.deepEqual(assessHeadroom([sample('nan', Number.NaN)], BUDGET), {
      verdict: 'none',
      worst: null,
      used: 0,
    });
  });

  test('refuses a budget that could not have been one', () => {
    for (const budget of [0, -1, Number.NaN, Infinity]) {
      assert.throws(() => assessHeadroom([sample('a', 1_000)], budget), RangeError);
    }
  });

  test('does not reorder or change what it was given', () => {
    const samples = Object.freeze([sample('a', 2_000), sample('b', 1_000)].map(Object.freeze));
    assessHeadroom(samples, BUDGET);
    assert.deepEqual(samples, [sample('a', 2_000), sample('b', 1_000)]);
  });
});

describe('readAnnotation', () => {
  test('reads what lobby.ts writes', () => {
    assert.deepEqual(readAnnotation('t', '14203ms of 45000ms'), {
      sample: sample('t', 14_203),
      budgetMs: 45_000,
    });
  });

  test('refuses anything else rather than guessing', () => {
    for (const text of [undefined, '', '14203', '14.2s of 45s', '14203ms of 45000ms!']) {
      assert.equal(readAnnotation('t', text), null);
    }
  });
});

describe('describeHeadroom', () => {
  test('says so when there was nothing to judge', () => {
    assert.match(describeHeadroom({ verdict: 'none', worst: null, used: 0 }, BUDGET), /no lobby/);
  });

  test('names the test, the time and the share', () => {
    const line = describeHeadroom(
      { verdict: 'ok', worst: sample('renders the lobby', 14_203), used: 14_203 / BUDGET },
      BUDGET
    );
    assert.match(line, /14\.2s of 45\.0s \(32%\)/);
    assert.match(line, /renders the lobby/);
    assert.doesNotMatch(line, /LOBBY_TIMEOUT/);
  });

  test('points a tight run at the cause before the knob', () => {
    const line = describeHeadroom(
      { verdict: 'tight', worst: sample('a', 30_000), used: 30_000 / BUDGET },
      BUDGET
    );
    assert.match(line, /verify:shader/);
    assert.match(line, /LOBBY_TIMEOUT/);
  });
});

describe('the e2e helper', () => {
  const helper = readFileSync(path.join(repoRoot, 'e2e/support/lobby.ts'), 'utf8');

  test('records its waits under the name this reporter reads', () => {
    assert.match(helper, new RegExp(`LOBBY_ANNOTATION = '${LOBBY_ANNOTATION}'`));
  });

  test('records them in the shape readAnnotation reads', () => {
    assert.match(helper, /`\$\{Date\.now\(\) - started\}ms of \$\{LOBBY_TIMEOUT\}ms`/);
  });
});
