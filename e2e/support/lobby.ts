/**
 * Waiting for Aubade's lobby, and saying how long it took.
 *
 * One helper for both specs that open `/aubade`, because the budget below is a
 * measurement and two copies of a measurement drift: `a11y.spec.ts` and
 * `aubade.spec.ts` each carried their own twenty seconds, and both went stale
 * together without either noticing.
 *
 * ## What the wait is actually for
 *
 * The plate stops saying "Unlocking the lobby…" once the renderer chunk has
 * resolved and the first frame has been handed to the GPU process. On a real GPU
 * that is a blink. Headless Chromium has no GPU, so the first draw is also when
 * SwiftShader JIT-compiles the whole fragment shader — and the main thread is
 * blocked behind it, so every other assertion on the page stalls too.
 *
 * Measured on 2026-10-11, the compile is most of the cost and does not care about
 * the viewport: 3.6s at 64×64 and 5.4s at 1280×720 on the development box, and
 * 13–33s per lobby test on the Linux CI runner with two workers. It grows with
 * every floor, because every floor is more GLSL in one program — the shader went
 * from 1,604 lines at the last green run to over 4,000 four floors later, and the
 * old budget of twenty seconds sat in the middle of what CI was measuring. That
 * is why a different handful of tests timed out on every run for two months.
 *
 * ## Why every wait is recorded
 *
 * A timeout only speaks once the budget is gone. Each wait is attached to its
 * test as a `lobby` annotation, and `scripts/lobby-headroom.mjs` — registered
 * as a reporter in `playwright.config.ts` — reads them back after the run and
 * warns when the slowest one has used more than half of `LOBBY_TIMEOUT`. A shader
 * that is getting dearer to compile shows up as a warning on a green run, weeks
 * before it shows up as red ones.
 */
import { expect, test, type Page } from '@playwright/test';

/**
 * How long the plate may say it is unlocking, in milliseconds.
 *
 * Sized from CI rather than from this box, which is the only reading that
 * decides: the slowest lobby that passed on the Linux runner took about
 * twenty-five seconds with two workers, so forty-five leaves real room without
 * hiding a regression — the headroom reporter warns well before it is used up.
 * Raise it only on the strength of a CI run's headroom line, never a local one.
 */
export const LOBBY_TIMEOUT = 45_000;

/**
 * The annotation each wait is recorded under, as `"<elapsed>ms of <budget>ms"` so
 * it reads as a sentence in the HTML report and carries the budget with it — the
 * reporter is plain JavaScript and cannot import `LOBBY_TIMEOUT` from here.
 * `scripts/lobby-headroom.test.mjs` fails if its copy of this name drifts.
 */
const LOBBY_ANNOTATION = 'lobby';

/**
 * Wait for the lobby to finish unlocking, and record how long it took.
 *
 * @param page A page that has been sent to `/aubade`.
 */
export async function waitForTheLobby(page: Page): Promise<void> {
  const started = Date.now();
  await expect(page.getByText('Unlocking the lobby')).toBeHidden({ timeout: LOBBY_TIMEOUT });
  test.info().annotations.push({
    type: LOBBY_ANNOTATION,
    description: `${Date.now() - started}ms of ${LOBBY_TIMEOUT}ms`,
  });
}
