/**
 * How close the e2e suite came to running out of time on Aubade's lobby.
 *
 * A Playwright reporter, registered in `playwright.config.ts`. It exists because
 * of how the suite went red for two months: the shader that every `/aubade` page
 * compiles before its first frame grew by a floor at a time, the time to unlock
 * the lobby on CI grew with it, and nothing said so until it crossed a fixed
 * twenty-second budget — at which point a different handful of tests timed out
 * on every run and it looked like a flaky box. `e2e/support/lobby.ts` has the
 * measurements.
 *
 * So every lobby wait is recorded as an annotation, and after the run this reads
 * them back and prints one line: the slowest wait, as a share of its budget. Past
 * half the budget it becomes a warning — a GitHub annotation on CI, so it shows
 * on the run's summary page while the run is still green. It never fails a run:
 * the timeout already does that, and a second, tighter timeout dressed up as a
 * report would be the same flake with a better message.
 *
 * Plain JavaScript rather than TypeScript so `npm run test:scripts` can test the
 * judgement below with no build and no browser.
 */
import { appendFileSync } from 'node:fs';

/**
 * The annotation `e2e/support/lobby.ts` records each wait under. Duplicated
 * because this file cannot import TypeScript; `lobby-headroom.test.mjs` reads
 * that file and fails if the two disagree.
 */
export const LOBBY_ANNOTATION = 'lobby';

/**
 * The share of the budget past which a run is reported as tight.
 *
 * Half, because the budget was sized at roughly twice the slowest lobby CI had
 * passed with. A run past half has eaten that margin — the shader has grown, or
 * the runner has got slower — and there is still time to find out which before
 * the suite goes red.
 */
export const WARN_AT = 0.5;

/**
 * One recorded lobby wait.
 *
 * @typedef {object} LobbySample
 * @property {string} title The test that waited.
 * @property {number} ms How long the plate took to stop saying it was unlocking.
 */

/**
 * The verdict on a run's lobby waits.
 *
 * @typedef {object} Headroom
 * @property {'none' | 'ok' | 'tight'} verdict `none` when there was nothing to
 *   judge, `tight` when the slowest wait used more than `warnAt` of the budget.
 * @property {LobbySample | null} worst The slowest wait, or `null` with `none`.
 * @property {number} used The slowest wait as a fraction of the budget; 0 with
 *   `none`.
 */

/**
 * Judge a run's lobby waits against their budget.
 *
 * @param {readonly LobbySample[]} samples Every wait the run recorded.
 * @param {number} budgetMs The budget each wait was given.
 * @param {number} [warnAt] The fraction of the budget past which the run is tight.
 * @returns {Headroom}
 */
export function assessHeadroom(samples, budgetMs, warnAt = WARN_AT) {
  if (!Number.isFinite(budgetMs) || budgetMs <= 0) {
    throw new RangeError(
      `range error detected on budget ms, budget must be positive and finite, received ${budgetMs}`
    );
  }
  const cleanSamples = samples.filter(
    (x) => x.ms != null && !Number.isNaN(x.ms) && Number.isFinite(x.ms) && x.ms >= 0
  );
  if (cleanSamples.length === 0) {
    return { verdict: 'none', worst: null, used: 0 };
  }
  const worst = cleanSamples.reduce((a, b) => (b.ms > a.ms ? b : a));
  const used = worst.ms / budgetMs;
  return { verdict: used > warnAt ? 'tight' : 'ok', worst, used };
}

/**
 * Read one annotation back into a sample.
 *
 * @param {string} title The test it belongs to.
 * @param {string | undefined} description As `lobby.ts` writes it.
 * @returns {{ sample: LobbySample, budgetMs: number } | null} `null` for an
 *   annotation this file cannot read, which is reported rather than guessed at.
 */
export function readAnnotation(title, description) {
  const match = /^(\d+)ms of (\d+)ms$/.exec(description ?? '');
  if (match === null) {
    return null;
  }
  return { sample: { title, ms: Number(match[1]) }, budgetMs: Number(match[2]) };
}

/**
 * The line the reporter prints.
 *
 * @param {Headroom} headroom
 * @param {number} budgetMs
 * @returns {string}
 */
export function describeHeadroom(headroom, budgetMs) {
  if (headroom.worst === null) {
    return 'Lobby headroom: no lobby waits were recorded.';
  }
  const seconds = (ms) => `${(ms / 1000).toFixed(1)}s`;
  const line =
    `Lobby headroom: the slowest unlock took ${seconds(headroom.worst.ms)} of ` +
    `${seconds(budgetMs)} (${Math.round(headroom.used * 100)}%), in "${headroom.worst.title}".`;
  if (headroom.verdict !== 'tight') {
    return line;
  }
  return (
    `${line} That is past ${Math.round(WARN_AT * 100)}% of the budget. The usual cause is ` +
    `the Aubade shader growing: compare the wall time npm run verify:shader prints ` +
    `with an earlier run before raising LOBBY_TIMEOUT in e2e/support/lobby.ts.`
  );
}

/** @implements {import('@playwright/test/reporter').Reporter} */
export default class LobbyHeadroomReporter {
  /** @type {LobbySample[]} */
  samples = [];

  /** @type {number[]} */
  budgets = [];

  /** @type {string[]} */
  unreadable = [];

  /**
   * @param {import('@playwright/test/reporter').TestCase} test
   * @param {import('@playwright/test/reporter').TestResult} result
   */
  onTestEnd(test, result) {
    for (const annotation of result.annotations) {
      if (annotation.type !== LOBBY_ANNOTATION) {
        continue;
      }
      const read = readAnnotation(test.title, annotation.description);
      if (read === null) {
        this.unreadable.push(`${test.title}: ${annotation.description ?? '(empty)'}`);
        continue;
      }
      this.samples.push(read.sample);
      this.budgets.push(read.budgetMs);
    }
  }

  onEnd() {
    const lines = [];
    for (const entry of this.unreadable) {
      lines.push(`Lobby headroom: could not read the annotation on ${entry}.`);
    }

    // One budget in practice. The smallest if not, so the line errs towards alarm.
    const budgetMs = this.budgets.length > 0 ? Math.min(...this.budgets) : 1;
    const headroom = assessHeadroom(this.samples, budgetMs);
    const line = describeHeadroom(headroom, budgetMs);
    lines.push(line);

    for (const entry of lines) {
      console.log(entry);
    }

    if (process.env['CI']) {
      if (headroom.verdict === 'tight') {
        console.log(`::warning title=Lobby headroom::${line}`);
      }
      const summary = process.env['GITHUB_STEP_SUMMARY'];
      if (summary) {
        appendFileSync(summary, `${lines.join('\n\n')}\n`);
      }
    }
  }
}
