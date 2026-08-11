/**
 * Backend stubbing for the dashboard smoke tests.
 *
 * Every URL here is derived from `environment.prod.ts` rather than written out
 * literally, because that is the file the running artefact actually contains:
 * `ng build` swaps it in via `fileReplacements` and Playwright serves that
 * build. Hard-coding the surface would mean these tests carry on stubbing
 * something the app no longer calls — at which point the "backend up" test
 * stubs nothing, the page makes a real request, and the suite starts passing or
 * failing on somebody else's uptime.
 *
 * Two things about production drive the shape of this file. The API is
 * same-origin (a Python function on the same Vercel project), so there is no
 * API host to match on. And it has no WebSocket, so updates arrive as repeated
 * reads of `/api/metrics` rather than as pushed frames.
 */
import type { Page } from '@playwright/test';
import type { IDashboardData, IMetrics } from '../../src/app/services/dashboard-api.service';
import fixture from '../../src/app/services/offline-dashboard.fixture.json';
import { environment } from '../../src/environments/environment.prod';

const OFFLINE_DASHBOARD = fixture as IDashboardData;

/** Escape a literal string for embedding in a RegExp source. */
function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The pathname the app will request, whether the environment addresses the API
 * relatively (`/api/health`, as production does) or absolutely (a full URL, as
 * a split-host deployment would). The base is required for the relative case
 * and ignored for the absolute one.
 */
function pathOf(url: string): string {
  return new URL(url, 'http://localhost').pathname;
}

const HEALTH_PATH = pathOf(environment.healthUrl);
const DASHBOARD_PATH = pathOf(`${environment.apiUrl}/dashboard`);
const METRICS_PATH = pathOf(`${environment.apiUrl}/metrics`);

/**
 * Everything the app addresses on the API, on any origin.
 *
 * Matched on pathname rather than on a fixed origin: same-origin requests carry
 * whatever host and port Playwright's preview server happened to pick, and
 * pinning that here would couple these tests to it. Leaving the origin open
 * also means a regression that starts calling some *other* host still lands in
 * this handler and gets the 404 below, rather than reaching the internet.
 */
const API_REQUESTS = new RegExp(
  `^https?://[^/]+${escapeForRegExp(pathOf(environment.apiUrl))}(/|$)`
);

/**
 * Harmless while the API is same-origin, and load-bearing if it ever stops
 * being: a fulfilled cross-origin response still goes through the browser's
 * CORS check, and without this header it would be rejected before the app saw
 * it — quietly degrading the "backend up" test into a second copy of the
 * "backend down" test, passing and proving nothing.
 */
const CORS_HEADERS = { 'access-control-allow-origin': '*' };

/**
 * What a healthy API serves in these tests: the committed fixture with every
 * headline figure changed.
 *
 * The changes are the point. If the stub echoed the fixture, an assertion on
 * the rendered numbers would be satisfied by the offline fallback too, and the
 * test could not tell the REST path working from the REST path being skipped
 * entirely. Each value below appears on screen only if it came down the wire.
 */
export const LIVE_DASHBOARD: IDashboardData = {
  ...OFFLINE_DASHBOARD,
  metrics: {
    ...OFFLINE_DASHBOARD.metrics,
    // Kept clear of `.5` boundaries: the grid renders currency through
    // `| currency: 'USD': 'symbol': '1.0-0'`, and a value sitting exactly on a
    // half would make the expected string depend on the rounding mode rather
    // than on anything this test is trying to prove.
    occupancy: 41.7,
    guestsInHouse: 38,
    revenueToday: 4712.4,
    arrivalsToday: 7,
    departuresToday: 9,
    occupiedRooms: 25,
    availableRooms: 35,
    adr: 188.4,
    revpar: 78.6,
  },
};

/** A later snapshot, as a subsequent poll would read it. Distinct again. */
export const POLLED_METRICS: IMetrics = {
  ...LIVE_DASHBOARD.metrics,
  occupancy: 93.4,
  occupiedRooms: 56,
  availableRooms: 4,
};

/** The offline fixture, for asserting on the fallback the app ships with. */
export { OFFLINE_DASHBOARD };

/**
 * Serve a healthy backend.
 *
 * @param metricsUpdates Snapshots to hand out to successive reads of
 *   `/metrics`, one per read, holding the last one once they run out. Default
 *   empty: every read answers with the same figures as the dashboard payload,
 *   so a test asserting on that payload cannot race an update that overwrites
 *   it. The app polls once immediately on connecting, so a single entry here is
 *   enough to exercise the update path without waiting out an interval.
 */
export async function stubBackendUp(page: Page, metricsUpdates: IMetrics[] = []): Promise<void> {
  const pending = [...metricsUpdates];
  let latest: IMetrics = LIVE_DASHBOARD.metrics;

  await stubSocket(page, (ws) => ws.close());

  await page.route(API_REQUESTS, async (route) => {
    const { pathname } = new URL(route.request().url());

    if (pathname === HEALTH_PATH) {
      await route.fulfill({ json: { status: 'ok' }, headers: CORS_HEADERS });
      return;
    }

    if (pathname === DASHBOARD_PATH) {
      await route.fulfill({ json: LIVE_DASHBOARD, headers: CORS_HEADERS });
      return;
    }

    if (pathname === METRICS_PATH) {
      latest = pending.shift() ?? latest;
      await route.fulfill({ json: latest, headers: CORS_HEADERS });
      return;
    }

    // A call these tests did not anticipate. Answering 404 rather than letting
    // it through keeps the run hermetic and makes the surprise visible in the
    // trace instead of silently reaching the internet.
    await route.fulfill({
      status: 404,
      headers: CORS_HEADERS,
      json: { detail: `Unstubbed request to ${pathname}` },
    });
  });
}

/**
 * Serve a backend that is not there.
 *
 * Requests are aborted rather than answered with a 500 because that is the
 * shape of the real failure: a host that does not resolve makes `fetch` reject,
 * which is a different branch in `checkBackendHealth` from a response with a
 * bad status.
 */
export async function stubBackendDown(page: Page): Promise<void> {
  await stubSocket(page, (ws) => ws.close());
  await page.route(API_REQUESTS, (route) => route.abort('failed'));
}

/**
 * Mock the socket, if this environment has one at all.
 *
 * Production sets `wsUrl` to null — a serverless function cannot hold a socket
 * open — so there is usually nothing to route and this is a no-op. It stays
 * because the guard is the interesting part: a regression that opens a socket
 * against a deployment without one should fail against a mock here rather than
 * escape to a real host, and a future environment that restores `wsUrl` gets
 * that protection back without anyone remembering to re-add it.
 */
async function stubSocket(page: Page, handler: (ws: { close: () => void }) => void): Promise<void> {
  if (environment.wsUrl === null) {
    return;
  }
  await page.routeWebSocket(environment.wsUrl, handler);
}
