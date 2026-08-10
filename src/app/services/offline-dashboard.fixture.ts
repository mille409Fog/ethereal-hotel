import { IDashboardData } from './dashboard-api.service';
import fixture from './offline-dashboard.fixture.json';

/**
 * A real snapshot of `GET /api/dashboard`, captured from a seeded database on
 * 2026-08-10 and committed verbatim.
 *
 * The dashboard falls back to this when the backend is unreachable (the hosted
 * demo runs this path until the API is deployed — see the backend-deployment
 * item in ROADMAP.md). It is a
 * *recording*, not a generator: no RNG, identical on every load, so the offline
 * demo shows the same numbers a live backend would have shown at capture time.
 * The UI labels it "simulated data" whenever it is on screen.
 *
 * To refresh it, re-run `python -m db.seed --reset` and dump
 * `compute_dashboard(db)` from `backend/db/metrics.py`.
 */
export const OFFLINE_DASHBOARD: IDashboardData = fixture;
