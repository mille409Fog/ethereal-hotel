/**
 * Dashboard smoke test, with the backend stubbed up and stubbed down.
 *
 * The "up" half is the path the hosted demo now runs on, since the API deploys
 * alongside the frontend. The "down" half is still the one that earns its keep:
 * it is the only place the fallback is exercised end to end, and it is what a
 * visitor sees if the function errors or the deployment is rolled back.
 * `dashboard.spec.ts` in `src/` proves the component *chooses* the fixture when
 * the health check fails; this proves the numbers reach the screen.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import type { IMetrics } from '../src/app/services/dashboard-api.service';
import {
  LIVE_DASHBOARD,
  OFFLINE_DASHBOARD,
  POLLED_METRICS,
  stubBackendDown,
  stubBackendUp,
} from './support/backend';

const METRIC_CARDS = 6;

/**
 * Assert the provenance badge, by its modifier class rather than its wording.
 *
 * Checking the *absence* of the opposite state is the half that matters. A page
 * showing the offline fixture under a "Live data" badge is worse than one
 * showing nothing: it presents a recording as a live feed, which is exactly the
 * claim the badge exists to keep honest.
 *
 * Asserting on the modifier also rules out the initial `checking` state for
 * free — that branch renders a bare `.data-source` with no modifier — so a
 * health check that never settled fails here rather than sitting on
 * "Connecting…" while the seeded fixture makes every other assertion pass.
 */
async function expectDataSource(page: Page, source: 'live' | 'simulated'): Promise<void> {
  const opposite = source === 'live' ? 'simulated' : 'live';
  await expect(page.locator(`.data-source--${source}`)).toBeVisible();
  await expect(page.locator(`.data-source--${opposite}`)).toHaveCount(0);
}

/** Whole dollars, matching `| currency: 'USD': 'symbol': '1.0-0'` in the grid. */
function usd(value: number): string {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

/** The card carrying a given label, e.g. `Occupancy`. */
function metricCard(page: Page, label: string): Locator {
  return page
    .locator('.metric-card')
    .filter({ has: page.locator('.metric-label', { hasText: label }) });
}

/**
 * Assert the grid and charts show exactly these metrics.
 *
 * Exact values rather than "is something there", because "something" is what a
 * broken dashboard renders: the header, six cards and three chart frames all
 * survive a metrics signal full of zeroes, so every liveness-only assertion
 * passes against a page that tells the user nothing. Asserting the figures is
 * what makes an empty render a failure — and running the same function over
 * both the live payload and the offline fixture is what makes a *silently
 * swapped* source a failure too.
 */
async function expectMetricsRendered(page: Page, metrics: IMetrics): Promise<void> {
  await expect(page.locator('.metric-card')).toHaveCount(METRIC_CARDS);

  const outOfService = metrics.totalRooms - metrics.operationalRooms;
  const net = metrics.arrivalsToday - metrics.departuresToday;

  await expect(metricCard(page, 'Occupancy')).toContainText(`${metrics.occupancy.toFixed(1)}%`);
  await expect(metricCard(page, 'Occupancy')).toContainText(
    `${metrics.occupiedRooms} of ${metrics.operationalRooms} sellable rooms`
  );

  await expect(metricCard(page, 'ADR')).toContainText(usd(metrics.adr));
  await expect(metricCard(page, 'RevPAR')).toContainText(usd(metrics.revpar));

  await expect(metricCard(page, 'Room Revenue Today')).toContainText(usd(metrics.revenueToday));
  await expect(metricCard(page, 'Room Revenue Today')).toContainText(
    `${metrics.guestsInHouse.toLocaleString('en-US')} guests in house`
  );

  await expect(metricCard(page, 'Arrivals / Departures')).toContainText(
    `${metrics.arrivalsToday} / ${metrics.departuresToday}`
  );
  await expect(metricCard(page, 'Rooms Available')).toContainText(`${metrics.availableRooms}`);
  await expect(metricCard(page, 'Rooms Available')).toContainText(
    `${metrics.totalRooms} total · ${outOfService} out of service`
  );

  // The net-movement line is the one piece of derived copy in the grid, so it
  // is the one that can be wrong while every raw figure is right.
  const expectedNet =
    net > 0
      ? `Net +${net} rooms filling today`
      : net < 0
        ? `Net ${net} rooms emptying today`
        : 'Even turnover today';
  await expect(metricCard(page, 'Arrivals / Departures')).toContainText(expectedNet);

  // The charts are canvases, so their pixels are not assertable — but their
  // aria-labels are computed from the same signals they plot, which makes the
  // room-mix label a faithful readout of whether the chart received this data
  // or stale data.
  await expect(page.locator('#roomMixChart')).toHaveAttribute(
    'aria-label',
    `Room inventory tonight: ${metrics.occupiedRooms} occupied, ` +
      `${metrics.availableRooms} available, ${outOfService} out of service.`
  );
  await expect(page.locator('#guestsChart')).toBeVisible();
  await expect(page.locator('#revenueChart')).toBeVisible();
}

test.describe('dashboard with the backend up', () => {
  test('renders the metrics the API served and labels them live', async ({ page }) => {
    // No updates queued: the /dashboard payload is what is under test here, and
    // a differing poll landing mid-assertion would overwrite it.
    await stubBackendUp(page);
    await page.goto('/dashboard');

    await expectDataSource(page, 'live');
    await expectMetricsRendered(page, LIVE_DASHBOARD.metrics);
  });

  test('applies a metrics snapshot read by the polling transport', async ({ page }) => {
    await stubBackendUp(page, [POLLED_METRICS]);
    await page.goto('/dashboard');

    // The /dashboard payload lands first and is then overwritten by the first
    // poll, so these values can only be on screen if the polling transport
    // works end to end.
    await expectMetricsRendered(page, POLLED_METRICS);
    await expectDataSource(page, 'live');
  });
});

/**
 * The grid's rows, as the eye reads them: card labels grouped by their top
 * edge, each row left to right, and whether that row reaches the grid's right
 * edge. A row that falls short has an empty slot at the end of it.
 */
async function metricRows(page: Page): Promise<Array<{ labels: string[]; filled: boolean }>> {
  return page.locator('.metrics-grid').evaluate((grid) => {
    const right = grid.getBoundingClientRect().right;
    const rows = new Map<number, Array<{ label: string; left: number; right: number }>>();
    for (const card of Array.from(grid.querySelectorAll('.metric-card'))) {
      const box = card.getBoundingClientRect();
      const top = Math.round(box.top);
      const label = card.querySelector('.metric-label')?.textContent?.trim() ?? '';
      rows.set(top, [...(rows.get(top) ?? []), { label, left: box.left, right: box.right }]);
    }
    return [...rows.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, cards]) => {
        cards.sort((a, b) => a.left - b.left);
        return {
          labels: cards.map((c) => c.label),
          filled: Math.abs(cards[cards.length - 1].right - right) < 1,
        };
      });
  });
}

test.describe('dashboard layout', () => {
  test('puts occupancy and revenue above four supporting figures at 1280px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await stubBackendUp(page);
    await page.goto('/dashboard');
    await expect(page.locator('.metric-card')).toHaveCount(METRIC_CARDS);

    expect(await metricRows(page)).toEqual([
      { labels: ['Occupancy', 'Room Revenue Today'], filled: true },
      { labels: ['ADR', 'RevPAR', 'Arrivals / Departures', 'Rooms Available'], filled: true },
    ]);

    // "Visibly primary" as a number rather than a judgement.
    const size = (label: string): Promise<number> =>
      metricCard(page, label)
        .locator('.metric-value')
        .evaluate((el) => parseFloat(el.ownerDocument.defaultView!.getComputedStyle(el).fontSize));
    expect(await size('Occupancy')).toBeGreaterThan(await size('ADR'));
    expect(await size('Room Revenue Today')).toBeGreaterThan(await size('ADR'));
  });

  test('stacks every card readably at 390px with no horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubBackendUp(page);
    await page.goto('/dashboard');
    await expect(page.locator('.metric-card')).toHaveCount(METRIC_CARDS);

    const rows = await metricRows(page);
    expect(rows.map((r) => r.labels)).toEqual([
      ['Occupancy'],
      ['Room Revenue Today'],
      ['ADR'],
      ['RevPAR'],
      ['Arrivals / Departures'],
      ['Rooms Available'],
    ]);
    expect(rows.every((r) => r.filled)).toBe(true);

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
    // A value wider than its card is clipped by the card's overflow: hidden,
    // which no page-level scroll check would notice.
    for (const value of await page.locator('.metric-value').all()) {
      expect(await value.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    }
  });
});

test.describe('dashboard with the backend down', () => {
  test('falls back to the committed fixture and says so', async ({ page }) => {
    await stubBackendDown(page);
    await page.goto('/dashboard');

    await expectDataSource(page, 'simulated');
    await expect(page.locator('.data-source')).toContainText('backend unreachable');
    await expectMetricsRendered(page, OFFLINE_DASHBOARD.metrics);
  });
});
