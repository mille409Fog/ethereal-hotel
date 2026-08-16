import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type { Result } from 'axe-core';
import { stubBookingApi } from './support/backend';

/**
 * The six routes the app actually has. `/` is the portfolio page;
 * `/dashboard` and `/booking` are the live demos and `/work` is the case
 * studies. The last two are the separate WebGL work.
 *
 * `/aubade` is scanned for a reason the first four are not: a canvas is opaque
 * to assistive technology, so the whole a11y surface of that route is the prose
 * and the plate around it. If those ever stop being real DOM the scan is the
 * only thing that would notice.
 *
 * `/aubade/reader` is scanned because a clean axe run is written into its
 * Definition of Done rather than assumed of it. It is the Reader's Edition —
 * the text version AUBADE requires — and a text version with a serious
 * violation in it is not serving the people it exists for.
 *
 * All six are reached through the SPA fallback in `scripts/serve-dist.mjs`.
 */
const ROUTES = [
  { path: '/', name: 'landing page' },
  { path: '/dashboard', name: 'dashboard' },
  { path: '/booking', name: 'booking' },
  { path: '/work', name: 'case studies' },
  { path: '/aubade', name: 'aubade' },
  { path: '/aubade/reader', name: 'aubade reader' },
] as const;

/**
 * Impacts that fail the build. axe grades every violation `minor`, `moderate`,
 * `serious` or `critical`; the first two are reported but not enforced, because
 * a chunk of them are best-practice heuristics rather than WCAG failures and a
 * gate that cries wolf gets disabled. `serious` and above are real barriers.
 */
const BLOCKING_IMPACTS = new Set(['critical', 'serious']);

/** Turn axe's nested result shape into something readable in a CI log. */
function formatViolations(violations: Result[]): string {
  return violations
    .map((violation) => {
      const targets = violation.nodes.map((node) => `      - ${node.target.join(' ')}`).join('\n');
      return [
        `  [${violation.impact}] ${violation.id}: ${violation.help}`,
        `    ${violation.helpUrl}`,
        targets,
      ].join('\n');
    })
    .join('\n\n');
}

/**
 * The dashboard seeds itself from a committed fixture and then probes the
 * backend, so its DOM settles a tick after load. Scanning before that settles
 * would audit the "Connecting to the API…" state and miss the real content.
 */
async function waitForSettledDashboard(page: Page): Promise<void> {
  await expect(page.getByText(/Simulated data|Live data/)).toBeVisible();
}

/**
 * The booking route settles the same way and for the same reason: it probes
 * the API on init and the form is disabled until it answers, so scanning
 * early would audit a page of greyed-out controls.
 *
 * Stubbed up rather than left to fail, because the two states have different
 * a11y surfaces — populated selects and a live table exist only when the API
 * answers, and those are most of what there is to audit here.
 */
async function waitForSettledBooking(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: 'Create booking' })).toBeEnabled();
}

/**
 * Aubade fetches its renderer chunk before it knows what it can show, so the
 * plate says "Unlocking the lobby…" for a moment. Scanning then would audit a
 * state no visitor sees for long, and — worse — would miss whichever of the
 * three real states this browser lands in.
 *
 * Headless Chromium renders WebGL through SwiftShader, so it usually reaches
 * the canvas; the wait is written to accept the closed state too, because
 * whether a CI runner has a working GL stack is not something this suite should
 * depend on. Both states are supposed to pass the audit, which is the point.
 */
async function waitForSettledAubade(page: Page): Promise<void> {
  // Twenty seconds rather than the default five, for the reason given over the
  // twin of this helper in `aubade.spec.ts`: it is waiting on a lazy chunk, a
  // shader compile and one CPU-rasterised raymarch, not on a widget settling.
  await expect(page.getByText('Unlocking the lobby')).toBeHidden({ timeout: 20_000 });
}

test.describe('accessibility', () => {
  for (const route of ROUTES) {
    test(`${route.name} has no critical or serious axe violations`, async ({ page }, testInfo) => {
      // Scanned under reduced motion, which is what makes this scan repeatable
      // rather than a coin flip. axe skips elements it considers invisible, and
      // the scroll-reveal directive parks every section below the fold at
      // `opacity: 0` until an IntersectionObserver fires — so whether a given
      // section got audited depended on observer timing, and an early run of
      // this suite reported 30 contrast failures where a later one reported 2.
      // Reduced motion renders the whole page immediately, so every section is
      // audited on every run.
      await page.emulateMedia({ reducedMotion: 'reduce' });

      if (route.path === '/booking') {
        await stubBookingApi(page);
      }

      await page.goto(route.path);

      if (route.path === '/dashboard') {
        await waitForSettledDashboard(page);
      }
      if (route.path === '/booking') {
        await waitForSettledBooking(page);
      }
      if (route.path === '/aubade') {
        await waitForSettledAubade(page);
      }

      const results = await new AxeBuilder({ page }).analyze();

      // Surface everything axe found as a CI artefact, then fail only on the
      // blocking impacts — so a `moderate` finding is visible without being
      // able to block a release on its own.
      await testInfo.attach(`axe-${route.name.replace(/\s+/g, '-')}.json`, {
        body: JSON.stringify(results.violations, null, 2),
        contentType: 'application/json',
      });

      // `impact` is optional as well as nullable in axe's types — a truthiness
      // check covers both, and an unclassified violation can't be blocking.
      const blocking = results.violations.filter((violation) =>
        violation.impact ? BLOCKING_IMPACTS.has(violation.impact) : false
      );

      expect(blocking, `\n${formatViolations(blocking)}\n`).toEqual([]);
    });
  }

  /**
   * The booking form again, after the server has rejected it.
   *
   * Scanning only the resting state would miss the half of a form that is
   * hardest to get right and easiest to regress: an error message is new
   * content, inserted after load, that has to be associated with its control
   * and reachable from it. A page that scans clean empty and dirty on failure
   * is the normal outcome, not an unlikely one.
   */
  test('the booking form has no critical or serious violations while showing an error', async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await stubBookingApi(page);
    await page.goto('/booking');
    await waitForSettledBooking(page);

    // Equal dates: rejected by the API, attributed to check-out.
    await page.getByLabel('Check-in').fill('2026-06-01');
    await page.getByLabel('Check-out').fill('2026-06-01');
    await page.getByRole('button', { name: 'Create booking' }).click();
    await expect(page.locator('#check_out-error')).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();

    await testInfo.attach('axe-booking-error-state.json', {
      body: JSON.stringify(results.violations, null, 2),
      contentType: 'application/json',
    });

    const blocking = results.violations.filter((violation) =>
      violation.impact ? BLOCKING_IMPACTS.has(violation.impact) : false
    );

    expect(blocking, `\n${formatViolations(blocking)}\n`).toEqual([]);
  });
});

test.describe('keyboard operability', () => {
  test('the first Tab reaches a skip link that jumps to main content', async ({ page }) => {
    await page.goto('/');

    await page.keyboard.press('Tab');
    const skipLink = page.locator(':focus');
    await expect(skipLink).toHaveText(/skip to (main )?content/i);

    // Deliberately not `toBeVisible()`: this link is parked at `top: -100px`
    // until focused, and Playwright counts an element with a non-empty box as
    // visible even when it sits entirely off-screen — so `toBeVisible` passes
    // whether or not the link ever actually appears. Assert the real thing, and
    // poll, because it slides in over a 0.3s transition.
    await expect
      .poll(async () => (await skipLink.boundingBox())?.y ?? -1, { timeout: 2000 })
      .toBeGreaterThanOrEqual(0);

    await page.keyboard.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();
  });

  test('every nav link is reachable by Tab in visual order', async ({ page }) => {
    await page.goto('/');

    const expected = ['Home', 'Projects', 'Experience', 'Skills', 'Contact'];
    const reached: string[] = [];

    // Walk forward from the skip link until the nav has been traversed,
    // capping the walk so a focus trap fails the test instead of hanging it.
    for (let index = 0; index < 20 && reached.length < expected.length; index += 1) {
      await page.keyboard.press('Tab');
      const text = ((await page.locator(':focus').textContent()) ?? '').trim();
      if (expected.includes(text)) {
        reached.push(text);
      }
    }

    expect(reached).toEqual(expected);
  });

  test('activating a nav link by keyboard moves focus to that section', async ({ page }) => {
    await page.goto('/');

    // Scoped to the nav: "Projects" on its own also matches "GitHub Projects"
    // down in the contact section.
    await page
      .getByRole('navigation')
      .getByRole('link', { name: 'Projects', exact: true })
      .press('Enter');

    // A same-page link that only scrolls leaves a keyboard user's focus behind
    // in the nav, so the next Tab resumes from the wrong place.
    await expect(page.locator('#projects')).toBeFocused();
  });
});

/**
 * Note the explicit `emulateMedia` calls rather than
 * `test.use({ reducedMotion: 'reduce' })`. The fixture form silently failed to
 * reach the page here — `matchMedia('(prefers-reduced-motion: reduce)')` still
 * reported `false` inside the browser, so both tests below "passed the app" for
 * the wrong reason until that was checked. `emulateMedia` also runs before
 * `goto`, which matters: the directive reads the preference once, in `ngOnInit`.
 */
test.describe('reduced motion', () => {
  test('content is revealed without the scroll animation', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    // The scroll-reveal directive starts elements at opacity 0 and fades them
    // in. Under reduced motion the content must be present from the start
    // rather than waiting on an animation that will never run.
    const projects = page.locator('#projects');
    await expect(projects).toBeVisible();
    await expect(projects).toHaveCSS('opacity', '1');
  });

  test('the looping heartbeat and pulse animations are stopped', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    // Polled, not sampled once. The reduced-motion block does not delete these
    // animations — it collapses them to `animation-duration: 0.01ms` with a
    // single iteration, which is the standard recipe and the right one. So they
    // genuinely do run, for one frame, and a single `getAnimations()` call
    // immediately after load catches them still `running` often enough to fail
    // roughly one run in three. What the test means to assert is that nothing
    // is *looping*, and that is a claim about where the animations end up, not
    // about this instant.
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            document
              .getAnimations()
              .filter((animation) => animation.playState === 'running')
              .map((animation) => (animation as CSSAnimation).animationName ?? 'unnamed')
          ),
        { timeout: 2000 }
      )
      .toEqual([]);
  });
});
