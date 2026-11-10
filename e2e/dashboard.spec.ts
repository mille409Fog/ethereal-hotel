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
import type { IDashboardData, IMetrics } from '../src/app/services/dashboard-api.service';
import { environment } from '../src/environments/environment.prod';
import {
  DASHBOARD_PATH,
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

  // The aria-labels are computed from the same signals the charts plot, so this
  // proves the data reached the component, not that it reached the canvas. The
  // `dashboard charts` tests below read the pixels for that.
  await expect(page.locator('#roomMixChart')).toHaveAttribute(
    'aria-label',
    `Room inventory tonight: ${metrics.occupiedRooms} occupied, ` +
      `${metrics.availableRooms} available, ${outOfService} out of service. ` +
      `Occupancy ${metrics.occupancy.toFixed(1)} percent of sellable rooms.`
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

  // The production build is the only place the two claims meet the interval the
  // deployment really runs on, so this is what holds them to `pollIntervalMs`.
  test('states one transport and the deployed interval in the badge and the footer', async ({
    page,
  }) => {
    await stubBackendUp(page);
    await page.goto('/dashboard');

    const interval = `every ${environment.pollIntervalMs / 1000} seconds`;
    await expect(page.locator('.data-source--live')).toContainText(
      `polled from the API ${interval}`
    );
    await expect(page.locator('.dashboard-note')).toContainText(`Polled over REST ${interval}`);
    await expect(page.locator('.dashboard-note')).not.toContainText('WebSocket');
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

  // A phone ranks the cards the way the desktop does, in rows short enough
  // that the whole grid fits the first screen. Six cards in one column used to
  // put the charts five screens down.
  test('keeps the primary pair full width and the rest two across at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubBackendUp(page);
    await page.goto('/dashboard');
    await expect(page.locator('.metric-card')).toHaveCount(METRIC_CARDS);

    const rows = await metricRows(page);
    expect(rows.map((r) => r.labels)).toEqual([
      ['Occupancy'],
      ['Room Revenue Today'],
      ['ADR', 'RevPAR'],
      ['Arrivals / Departures', 'Rooms Available'],
    ]);
    expect(rows.every((r) => r.filled)).toBe(true);

    // The DOM keeps the order the cards were written in; only CSS moves them.
    expect(await page.locator('.metric-label').allTextContents()).toEqual([
      'Occupancy',
      'ADR',
      'RevPAR',
      'Room Revenue Today',
      'Arrivals / Departures',
      'Rooms Available',
    ]);

    const gridBottom = await page
      .locator('.metrics-grid')
      .evaluate((el) => el.getBoundingClientRect().bottom + window.scrollY);
    expect(gridBottom).toBeLessThanOrEqual(844);
  });

  // 320px is the narrowest width the two-across row has to survive.
  for (const width of [320, 390]) {
    test(`clips no value, label or detail at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await stubBackendUp(page);
      await page.goto('/dashboard');
      await expect(page.locator('.metric-card')).toHaveCount(METRIC_CARDS);

      // Polled: until Chart.js sizes them, the canvases sit at their default
      // 300px, wider than a chart card at 320px, for a frame or two.
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
        .toBe(true);
      // Text wider than its card is clipped by the card's overflow: hidden,
      // which no page-level scroll check would notice. Wrapping is allowed;
      // a word that cannot wrap is what overflows.
      for (const text of await page.locator('.metric-value, .metric-label, .metric-detail').all()) {
        expect(await text.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      }
    });
  }
});

/**
 * What the charts are served below: every series different from the fixture in
 * both values and dates, so no canvas can match it by accident. 1 room of 64 out
 * of service is production's shape, against the fixture's 4.
 */
const CHART_DASHBOARD: IDashboardData = {
  ...LIVE_DASHBOARD,
  metrics: { ...LIVE_DASHBOARD.metrics, availableRooms: 38, operationalRooms: 63 },
  historicalGuests: reshaped(LIVE_DASHBOARD.historicalGuests),
  historicalRevenue: reshaped(LIVE_DASHBOARD.historicalRevenue),
};

/** The same number of nights, in another month, with the values reversed. */
function reshaped(series: IDashboardData['historicalGuests']): IDashboardData['historicalGuests'] {
  return series.map(({ timestamp }, night) => ({
    timestamp: timestamp.replace(/^\d{4}-\d{2}/, '2031-03'),
    value: series[series.length - 1 - night].value,
  }));
}

const CHART_IDS = ['guestsChart', 'revenueChart', 'roomMixChart'] as const;

type ChartPixels = Record<(typeof CHART_IDS)[number], string>;

/** What each canvas holds right now. The bitmap, because that is the claim. */
function chartPixels(page: Page): Promise<ChartPixels> {
  return page.evaluate(
    (ids) =>
      Object.fromEntries(
        ids.map((id) => [id, (document.getElementById(id) as HTMLCanvasElement).toDataURL()])
      ) as ChartPixels,
    CHART_IDS
  );
}

/** Resolves once Chart.js has put something on the canvas, so it is animating. */
async function firstPaint(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const canvas = document.getElementById('roomMixChart') as HTMLCanvasElement | null;
    return canvas
      ?.getContext('2d')
      ?.getImageData(0, 0, canvas.width, canvas.height)
      .data.some((channel) => channel !== 0);
  });
}

/** Hold `/dashboard` unanswered until the returned function is called. */
async function holdDashboardAnswer(page: Page): Promise<() => void> {
  let release = (): void => undefined;
  const released = new Promise<void>((resolve) => (release = resolve));
  await page.route(`**${DASHBOARD_PATH}`, async (route) => {
    await released;
    await route.fallback();
  });
  return release;
}

/** Longer than Chart.js's default 1000ms, so nothing is left animating. */
const INITIAL_ANIMATION_OVER_MS = 1500;

test.describe('dashboard charts', () => {
  // The bug followed whether a chart card is a whole number of pixels wide, not
  // the screen: 390 and 1280 are, 1440 is not. See `redraw` in charts-section.ts.
  for (const width of [390, 1280, 1440]) {
    /**
     * The canvases against themselves, because the aria-labels cannot see this:
     * they are computed from the signal, so they were right the whole time the
     * bitmap was wrong. An answer that lands after the initial animation has
     * always drawn correctly, which makes it the reference for one that lands
     * during it, and the backend-down render proves the two are not both the
     * fixture. The answer is held until the first paint rather than delayed by
     * a guess, so it lands mid-animation however fast this machine is.
     */
    test(`draw the API's data at ${width}px when it answers mid-animation`, async ({ context }) => {
      const open = async (): Promise<Page> => {
        const page = await context.newPage();
        await page.setViewportSize({ width, height: 844 });
        return page;
      };

      const offline = await open();
      await stubBackendDown(offline);
      await offline.goto('/dashboard');
      await expectDataSource(offline, 'simulated');
      await firstPaint(offline);
      await offline.waitForTimeout(INITIAL_ANIMATION_OVER_MS);
      const fixture = await chartPixels(offline);
      await offline.close();

      const late = await open();
      await stubBackendUp(late, [], CHART_DASHBOARD);
      const releaseLate = await holdDashboardAnswer(late);
      await late.goto('/dashboard');
      await firstPaint(late);
      await late.waitForTimeout(INITIAL_ANIMATION_OVER_MS);
      releaseLate();
      await expect(late.locator('#roomMixChart')).toHaveAttribute('aria-label', /1 out of service/);
      await expect.poll(async () => chartPixels(late)).not.toEqual(fixture);
      const reference = await chartPixels(late);
      await late.close();

      for (const id of CHART_IDS) {
        expect(reference[id], `${id} must differ from the fixture`).not.toBe(fixture[id]);
      }

      const page = await open();
      await stubBackendUp(page, [], CHART_DASHBOARD);
      const release = await holdDashboardAnswer(page);
      await page.goto('/dashboard');
      await firstPaint(page);
      release();
      await expect(page.locator('#roomMixChart')).toHaveAttribute('aria-label', /1 out of service/);

      // Polled because an animation may still be finishing. The first poll of
      // `/metrics` after this is 15s away, well past this timeout, so nothing
      // but the answer under test can correct the canvas.
      await expect
        .poll(
          async () => {
            const pixels = await chartPixels(page);
            return CHART_IDS.filter((id) => pixels[id] !== reference[id]);
          },
          { timeout: INITIAL_ANIMATION_OVER_MS * 2 }
        )
        .toEqual([]);
    });
  }
});

test.describe('dashboard with the backend down', () => {
  test('falls back to the committed fixture and says so', async ({ page }) => {
    await stubBackendDown(page);
    await page.goto('/dashboard');

    await expectDataSource(page, 'simulated');
    await expect(page.locator('.data-source')).toContainText('backend unreachable');
    await expect(page.locator('.dashboard-note')).toContainText('Committed snapshot');
    await expectMetricsRendered(page, OFFLINE_DASHBOARD.metrics);
  });
});
