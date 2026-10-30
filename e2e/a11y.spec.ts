import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type { Result } from 'axe-core';
import { COLOURS } from '../src/app/gallery/gallery.data';
import { stubBookingApi } from './support/backend';
import { LOBBY_TIMEOUT, waitForTheLobby } from './support/lobby';

/**
 * Nine of the app's routes; `/murmuration` is not scanned. `/` is the portfolio page;
 * `/dashboard` and `/booking` are the live demos, `/work` is the case
 * studies, `/gallery` the colour-to-painting guide, `/aesthetic` the
 * aesthetic generator's colour wheel and `/wanderquest` the travel quests'
 * tablist. The last two in the list are the separate WebGL work.
 *
 * `/gallery` is scanned with a painting hung, not at rest: the label is most
 * of what there is to audit on that page, and it does not exist until an orb
 * is pressed. `/aesthetic` is scanned with a primary chosen, for the same
 * reason.
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
 * All nine are reached through the SPA fallback in `scripts/serve-dist.mjs`.
 */
const ROUTES = [
  { path: '/', name: 'landing page' },
  { path: '/dashboard', name: 'dashboard' },
  { path: '/booking', name: 'booking' },
  { path: '/work', name: 'case studies' },
  { path: '/gallery', name: 'gallery' },
  { path: '/aesthetic', name: 'aesthetic' },
  { path: '/wanderquest', name: 'wanderquest' },
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
 * The gallery shows only orbs until one is pressed. Focus landing on the
 * painting's heading is the sign the label has rendered.
 */
async function hangAPainting(page: Page): Promise<void> {
  await page.locator('button.orb').first().click();
  await expect(page.locator('#painting-title')).toBeFocused();
}

/**
 * The wheel's cards are placeholders until a primary is chosen. Choosing one
 * from the keyboard, the way the page says to, builds the whole aesthetic:
 * three cards, three markers and the specimen, whose one line of type is the
 * contrast claim most worth a real browser's check. Moving focus also proves
 * the radio group's tab stop works.
 */
async function chooseAPrimary(page: Page): Promise<void> {
  const entry = page.locator('.cell[tabindex="0"]');
  await entry.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { checked: true })).toBeFocused();
  await expect(page.locator('.triad-primary .triad-name')).toBeVisible();
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
  // The same wait `aubade.spec.ts` uses, budget and all — see `support/lobby.ts`.
  // This used to carry its own twenty seconds, and the two copies went stale
  // together when the shader outgrew them.
  await waitForTheLobby(page);
}

test.describe('accessibility', () => {
  for (const route of ROUTES) {
    test(`${route.name} has no critical or serious axe violations`, async ({ page }, testInfo) => {
      // Scanned under reduced motion, so no transition is caught mid-flight.
      // axe skips elements it considers invisible: when sections faded in on
      // scroll, an early run of this suite reported 30 contrast failures where
      // a later one reported 2. The fade is gone, but a scan that depends on
      // timing is the thing being guarded against.
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
      if (route.path === '/gallery') {
        await hangAPainting(page);
      }
      if (route.path === '/aesthetic') {
        await chooseAPrimary(page);
      }
      if (route.path === '/aubade') {
        // The lobby's budget alone outlasts the default test timeout.
        testInfo.setTimeout(LOBBY_TIMEOUT + 20_000);
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

  /**
   * Every gallery room, not just the one the draw happens to offer first.
   *
   * Each colour re-dresses the card: its own surface, type, links and frame,
   * and Pearl alone switches off the global heading shadow. The data spec holds
   * each palette's numbers to 4.5:1, but only a browser sees what the CSS does
   * with them, and the route scan above sees one room per run. So this presses
   * every colour and scans each room as it hangs.
   *
   * It gets there the way a visitor would: press each offered colour not yet
   * seen, then "Show me different colours" for a fresh five of seven. Forcing
   * a colour through a URL or a test hook would be quicker, and would add a
   * way into the page that visitors do not have. A given colour is left out
   * of a draw with probability 2/7, so the cap of 30 draws fails on bad luck
   * about once in 10^16 runs; hitting it means the reshuffle is broken.
   */
  test('every gallery room has no critical or serious violations', async ({ page }, testInfo) => {
    // Seven full-page scans, each a second or two, plus the redraws between.
    testInfo.setTimeout(120_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/gallery');

    const unseen = new Set(COLOURS.map((colour) => colour.name));
    const found: string[] = [];

    for (let draw = 0; draw < 30 && unseen.size > 0; draw += 1) {
      if (draw > 0) {
        await page.getByRole('button', { name: 'Show me different colours' }).click();
        // A redraw clears the wall in the same render that replaces the orbs,
        // so the empty wall means the names below are this draw's, not the last.
        await expect(page.getByText('Nothing is hanging yet')).toBeVisible();
      }
      const offered = await page.locator('button.orb .orb-name').allTextContents();
      for (const name of offered.map((text) => text.trim()).filter((n) => unseen.has(n))) {
        await page.locator('button.orb', { hasText: name }).click();
        await expect(page.locator('#painting-title')).toBeFocused();
        await expect(page.locator('.hung-kicker')).toContainText(name);
        unseen.delete(name);

        const results = await new AxeBuilder({ page }).analyze();
        const blocking = results.violations.filter((violation) =>
          violation.impact ? BLOCKING_IMPACTS.has(violation.impact) : false
        );
        if (blocking.length > 0) {
          found.push(`${name} room:\n${formatViolations(blocking)}`);
        }
      }
    }

    await testInfo.attach('axe-gallery-rooms.txt', {
      body: found.join('\n\n') || 'No blocking violations in any room.',
      contentType: 'text/plain',
    });
    expect([...unseen], 'colours never offered in 30 draws').toEqual([]);
    expect(found, `\n${found.join('\n\n')}\n`).toEqual([]);
  });
});

/**
 * Every keyed shape on the wanderquest outlines carries a `<title>`, which is
 * the pointer's tooltip, and 195 of them on the countries map. The SVG's
 * `role="img"` is what keeps those out of the accessibility tree; axe would
 * pass either way, so this reads the tree the browser actually built and
 * requires each map to be one named image with nothing inside it.
 */
test.describe('wanderquest outlines', () => {
  test('each map is one image to a screen reader, whatever its shapes are titled', async ({
    page,
  }) => {
    await page.goto('/wanderquest');
    const maps = [
      ['States', 'Outline map of the fifty states', 'California'],
      ['Continents', 'Outline map of the seven continents', 'Asia'],
      ['Countries', 'Outline map of the countries of the world', 'Brazil'],
    ] as const;

    for (const [tab, label, place] of maps) {
      await page.getByRole('tab', { name: tab }).click();
      const svg = page.getByRole('tabpanel', { name: tab }).locator('svg.quest-outline');
      await expect(svg.locator('path[data-id] > title', { hasText: place })).toHaveCount(1);
      expect(await svg.ariaSnapshot()).toBe(`- img "${label}"`);
    }
  });
});

test.describe('keyboard operability', () => {
  test('the first Tab reaches a skip link that jumps to main content', async ({ page }) => {
    await page.goto('/');
    // `goto` resolves on `load`, which can beat Angular's first render on a slow
    // runner; a Tab pressed into the empty page then focuses nothing at all.
    await expect(page.locator('a[href="#main-content"]')).toBeAttached();

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
    // Same race as above: wait for the first render before the first Tab.
    await expect(page.locator('a[href="#main-content"]')).toBeAttached();

    const expected = ['Home', 'Projects', 'Experience', 'Contact'];
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
 * Note the explicit `emulateMedia` call rather than
 * `test.use({ reducedMotion: 'reduce' })`. The fixture form silently failed to
 * reach the page here — `matchMedia('(prefers-reduced-motion: reduce)')` still
 * reported `false` inside the browser, so the test below "passed the app" for
 * the wrong reason until that was checked.
 *
 * `/booking` with the API stubbed up, not `/`. The landing page no longer
 * loops anything, so it would pass whether or not the reduced-motion block
 * worked. The booking badge's live dot is a loop that the block has to stop,
 * and the stub is what puts the badge in its live state.
 */
test.describe('reduced motion', () => {
  test('the looping animations are stopped', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await stubBookingApi(page);
    await page.goto('/booking');
    await waitForSettledBooking(page);
    await expect(page.locator('.data-source-dot')).toBeAttached();

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
