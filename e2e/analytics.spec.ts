/**
 * The three custom events, fired by a real browser against the real bundle.
 *
 * The unit tests prove the rule and the service in isolation; this proves the
 * chain — that the events are wired to the things they claim to measure, and
 * that what arrives at `window.va` is what `docs/analytics.md` promises a
 * visitor is collected. That document is a claim made to someone else, so it is
 * worth more than an assertion about a spy.
 *
 * Nothing here reaches Vercel. `/_vercel/insights/script.js` does not exist off
 * the platform, so `window.va` stays the buffering shim from
 * `analytics.service.ts` and every call lands in `window.vaq` — which is both
 * how these tests read the events and how you check wiring locally.
 */
import { expect, test, type Page } from '@playwright/test';
import { MINIMUM_DWELL_MS } from '../src/app/work/study-read.directive';
import { stubBackendUp } from './support/backend';

/** One buffered `va('event', …)` call, as the shim stores it. */
interface ITrackedEvent {
  name: string;
  data?: Record<string, string | number | boolean | null>;
}

/**
 * Everything the page has tried to report so far.
 *
 * Reads the queue rather than a spy so the assertion covers the real service
 * and the real shim, not a test double standing in for them.
 */
async function trackedEvents(page: Page): Promise<ITrackedEvent[]> {
  return page.evaluate(() =>
    (window.vaq ?? []).filter((call) => call[0] === 'event').map((call) => call[1] as ITrackedEvent)
  );
}

/** Fail loudly if the insights script is ever actually requested off-platform. */
async function stubInsights(page: Page): Promise<void> {
  await page.route('**/_vercel/**', (route) => route.abort('failed'));
}

test.describe('analytics', () => {
  test.beforeEach(async ({ page }) => {
    await stubInsights(page);
  });

  test('reports reaching the dashboard, with the transport it reached', async ({ page }) => {
    await stubBackendUp(page);
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // `polling` rather than `socket` because environment.prod.ts sets wsUrl to
    // null; if that ever changes, this is one of the places that should notice.
    expect(await trackedEvents(page)).toEqual([
      { name: 'dashboard_reached', data: { transport: 'polling' } },
    ]);
  });

  /**
   * The one slow test in the suite, and it waits out the real dwell on purpose.
   *
   * `page.clock` is the obvious way to make this instant and it does not work
   * here: under a faked clock Chromium delivers an IntersectionObserver's
   * *initial* observation but never a scroll-triggered update, because the
   * frame loop that drives them is frozen with the clock. The observer would
   * therefore never learn the reader reached the end, the directive would never
   * arm its timer, and fast-forwarding would assert on a page where nothing had
   * happened — a test that passes by never testing anything. Verified, not
   * assumed; do not "optimise" this back.
   *
   * The dwell is imported rather than repeated, so lowering the threshold makes
   * this test faster instead of making it lie.
   */
  test('reports a case study read to the end, and not one scrolled past', async ({ page }) => {
    test.setTimeout(MINIMUM_DWELL_MS + 30_000);
    await page.goto('/work');

    const study = page.locator('article.study').first();
    await expect(study).toBeVisible();
    const slug = await study.getAttribute('id');

    // Reaching the bottom is necessary but not sufficient: at this instant the
    // reader has spent no time on it at all.
    await study.locator('[data-study-end]').scrollIntoViewIfNeeded();
    expect(await trackedEvents(page)).toEqual([]);

    // Sitting there is what makes it a read. Nothing scrolls from here, so this
    // also covers the case where no further intersection callback ever fires —
    // the reason the directive carries a timer rather than deciding once.
    await page.waitForTimeout(MINIMUM_DWELL_MS + 1_500);
    expect(await trackedEvents(page)).toEqual([{ name: 'case_study_read', data: { study: slug } }]);
  });

  test('reports a resume download, and serves the file it counted', async ({ page }) => {
    await page.goto('/');

    // The download itself is asserted, not just the click. The event counts
    // clicks on this link, so a link pointing at a path that 404s would be an
    // analytics number measuring nothing — and nothing else in the suite loads
    // this file.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: /download the pdf/i }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
    expect(await trackedEvents(page)).toEqual([{ name: 'resume_downloaded' }]);
  });
});
