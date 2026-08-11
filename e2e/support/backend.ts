/**
 * Backend stubbing for the dashboard smoke tests.
 *
 * Every URL here is derived from `environment.prod.ts` rather than written out
 * literally, because that is the file the running artefact actually contains:
 * `ng build` swaps it in via `fileReplacements` and Playwright serves that
 * build. Hard-coding the host would mean these tests carry on stubbing
 * `onrender.com` after the backend deployment moves it — at which point the
 * "backend up" test stubs nothing, the page makes a real cross-origin call, and
 * the suite starts passing or failing on somebody else's uptime.
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

const API_ORIGIN = new URL(environment.healthUrl).origin;

/**
 * Everything the app addresses at the API origin.
 *
 * A RegExp rather than a glob so that the health URL itself — origin plus a
 * bare `/` — is unambiguously covered alongside the paths beneath it.
 */
const API_REQUESTS = new RegExp(`^${escapeForRegExp(API_ORIGIN)}/`);

const HEALTH_PATH = new URL(environment.healthUrl).pathname;
const DASHBOARD_PATH = new URL(`${environment.apiUrl}/dashboard`).pathname;

/**
 * A fulfilled response still goes through the browser's CORS check: the page is
 * served from `localhost:4173` and the API is a different origin, so without
 * this header the stubbed response is rejected before the app ever sees it and
 * the "backend up" test quietly degrades into a second copy of the "backend
 * down" test — passing, and proving nothing.
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

/** A later snapshot, as the live socket would push it. Distinct again. */
export const SOCKET_METRICS: IMetrics = {
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
 * @param socketFrames Metrics snapshots to push once the app opens the socket.
 *   Default empty: the socket connects and stays silent, so a test asserting on
 *   the REST payload cannot race a live update that overwrites it.
 */
export async function stubBackendUp(page: Page, socketFrames: IMetrics[] = []): Promise<void> {
  // No `connectToServer()`, so the socket is fully mocked and nothing leaves
  // the machine. The handler runs on connect, by which point the app has
  // already assigned `onmessage` — it does so synchronously after `new
  // WebSocket()` — so a frame sent here cannot arrive too early to be seen.
  await page.routeWebSocket(environment.wsUrl, (ws) => {
    for (const frame of socketFrames) {
      ws.send(JSON.stringify(frame));
    }
  });

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
 * Serve a backend that is not there — the path the hosted demo runs on today.
 *
 * Requests are aborted rather than answered with a 500 because that is the
 * shape of the real failure: a host that does not resolve makes `fetch` reject,
 * which is a different branch in `checkBackendHealth` from a response with a
 * bad status.
 */
export async function stubBackendDown(page: Page): Promise<void> {
  // The app returns from `ngOnInit` before opening a socket when the health
  // check fails, so this route should never fire. It is here so that a
  // regression which *does* open a socket fails against a mock instead of
  // reaching the real host.
  await page.routeWebSocket(environment.wsUrl, (ws) => ws.close());

  await page.route(API_REQUESTS, (route) => route.abort('failed'));
}
