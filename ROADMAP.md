# EtherealHotel — Improvement Roadmap

Work these in order. Each item has a **Definition of Done (DoD)** so a separate instance can
implement it and this instance can verify it. Effort is a rough estimate.

---

## 1. Make the data real (persistence + real domain) — ✅ DONE (verified 2026-08-09)
**Effort:** L · **Why:** The dashboard currently streams `random.randint(...)`. Real data is the
single biggest credibility lever. Use the hotel domain that's already implied.

- Add SQLite + SQLAlchemy (+ Alembic for migrations) to the backend.
- Model `Room`, `Booking`, `Guest`.
- Seed script populates realistic data.
- Dashboard metrics become **derived** from records (occupancy %, revenue today, arrivals today),
  not RNG. Simulated events may still drive "live" motion, but off real rows.

**DoD:**
- [x] `backend/` has a DB layer (models, session, migrations) and a seed script.
- [x] `/api/dashboard` and `/api/metrics` compute values from the DB, not `random`.
- [x] Deleting/adding a booking changes the reported metrics.

---

## 2. Deploy it (live URL + env-based config) — 🟡 PARTIAL (verified 2026-08-09: frontend deployed, backend pending)
**Effort:** M · **Why:** A portfolio you can't click is half a portfolio.

- Frontend to Vercel/Netlify/Cloudflare Pages; backend to Fly.io/Render.
- Replace hardcoded `http://localhost:8000` in `src/app/services/dashboard-api.service.ts`
  with Angular environment config (`environment.ts` / `environment.prod.ts`).
- Backend CORS reads allowed origins from an env var.

**DoD:**
- [x] No hardcoded `localhost` URLs in committed frontend source; API base comes from env.
      (`environment.ts` dev / `environment.prod.ts` prod, swapped via `angular.json` fileReplacements.)
- [x] Backend CORS origins come from config/env, not a hardcoded list. (`ALLOWED_ORIGINS` env var.)
- [x] README has a working live link (frontend on Vercel) and a working CI badge (real repo).

**Remaining (blocks a true ✅ — handoff to backend-deploy instance):**
- [ ] Deploy the FastAPI backend (Render/Fly) and set `ALLOWED_ORIGINS` to the Vercel origin.
- [ ] Point `environment.prod.ts` at the real backend URL. It currently references a **dead**
      placeholder (`ethereal-hotel-api.onrender.com` → 404), which shows as failed requests in
      DevTools on the live site.
- [ ] Until then the hosted demo runs on **mock data** (health check fails → graceful fallback),
      so Item 1's real-data work is invisible in production. Either finish the deploy, or make
      `environment.prod.ts` fall back cleanly and note "simulated data" in the README.

---

## 3. Cut the documentation theater — ✅ DONE (verified 2026-08-09)
**Effort:** S · **Why:** ~15 root markdown files (`BACKEND_COMPLETE.md`,
`IMPLEMENTATION_COMPLETE.md`, `BEFORE_AND_AFTER.md`, `SETUP_SUMMARY.md`, etc.) read as filler and
lower signal.

- Keep: `README.md`, `ARCHITECTURE.md`, `backend/README.md`, this `ROADMAP.md`.
- Remove the rest (fold anything genuinely useful into the kept files).
- Fix the README badge URL (`yourusername` placeholder is broken).

**DoD:**
- [x] Root has ≤4 markdown docs plus this roadmap. (3: README, ARCHITECTURE, ROADMAP; backend/README kept.)
- [x] README badge points at the real repo and renders. (`mille409Fog/ethereal-hotel`; `yourusername`
      placeholder fixed. Note: badge shows "no status" until CI runs on the default branch — resolves
      naturally with Item 4.)

---

## 4. Real tests + meaningful CI — ✅ DONE (verified 2026-08-09)
**Effort:** M · **Why:** Only two `.spec` files and a manual `test_api.py` exist. A green badge
should mean something.

- Backend: `pytest` covering REST endpoints and a WebSocket message; run in CI.
- Frontend: unit-test `DashboardApiService` and the dashboard's backend→mock fallback.
- CI fails on test failure, not just lint.

**DoD:**
- [x] `pytest` suite exists and passes; wired into the GitHub Actions workflow.
      (`backend/tests/` — 9 tests over REST endpoints + the WebSocket stream, on an isolated
      seeded SQLite DB via `conftest.py`; new `backend` job runs `pytest` in CI.)
- [x] Frontend tests cover the service and the fallback path in `dashboard.ts`.
      (`dashboard-api.service.spec.ts` covers REST/health/WebSocket; `dashboard.spec.ts` covers
      backend-healthy, backend-unavailable, and WebSocket-error→mock fallback. 20 specs total.)
- [x] CI job runs both test suites. (`.github/workflows/code-quality.yml`: `frontend` job runs
      `npm run test`, `backend` job runs `pytest`; both fail the build on any test failure.
      Re-verified 2026-08-09: backend 9/9, frontend 20/20 pass locally.)

**CI trigger (fixed 2026-08-09):** the workflow now triggers on `push`/`pull_request` to
`[main, develop, development-alpha]`, so CI runs on the working branch and the badge picks up a
real status once this branch is pushed. (Badge on the default branch `main` will still read
"no status" until code lands on `main`.)

---

## 5. Harden existing code — ✅ DONE (verified 2026-08-09)
**Effort:** M · **Why:** Self-contained fixes that demonstrate real engineering judgment.

- **WebSocket reconnection:** `dashboard-api.service.ts` reuses one `Subject`; once it `.error()`s
  it's permanently dead and there's no reconnect. Add reconnect with backoff and a per-connection
  stream.
- **FastAPI deprecation:** replace `@app.on_event("startup"/"shutdown")` in `backend/main.py` with
  the `lifespan` context manager.
- **`broadcast()` bug:** `backend/main.py` can mutate `active_connections` mid-iteration on send
  failure. Iterate over a copy and prune dead sockets safely.

**DoD:**
- [x] Killing/restarting the backend causes the frontend to reconnect automatically.
      (Per-connection `Subject` + exponential backoff 1s→30s; `onerror` logs only so the stream
      survives; `onclose` drives reconnect. Covered by `dashboard-api.service.spec.ts`.)
- [x] No `@app.on_event` usage remains; lifespan handler is used. (`grep on_event` → none;
      `FastAPI(lifespan=...)`.)
- [x] `broadcast()` handles a failing/closed socket without corrupting the connection list.
      (Iterates a `list(...)` snapshot, prunes dead sockets on send failure.)

Notes: `broadcast()` is correct but currently unused (the `/ws` handler sends per-connection).
Re-verified 2026-08-09: backend 9/9, frontend 23/23 pass.

---

## 6. Fix credibility details
**Effort:** S · **Why:** Small overclaims undercut trust in an interview.

- Route title in `src/app/app.routes.ts` says "Senior Software Engineer" — reconsider to
  "Software Engineer" and let the work carry the signal.
- Sweep for other stale placeholders (author name, links, meta tags).

**DoD:**
- [ ] Title/labels reflect an accurate, defensible claim.
- [ ] No placeholder text (`yourusername`, lorem, TODO copy) in shipped pages.

---

## Explicitly out of scope (for now)
More charts, more animations, more frameworks. Depth (real data, deployment, tests) beats breadth.
