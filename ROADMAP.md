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

## 2. Deploy it (live URL + env-based config)
**Effort:** M · **Why:** A portfolio you can't click is half a portfolio.

- Frontend to Vercel/Netlify/Cloudflare Pages; backend to Fly.io/Render.
- Replace hardcoded `http://localhost:8000` in `src/app/services/dashboard-api.service.ts`
  with Angular environment config (`environment.ts` / `environment.prod.ts`).
- Backend CORS reads allowed origins from an env var.

**DoD:**
- [ ] No hardcoded `localhost` URLs in committed frontend source; API base comes from env.
- [ ] Backend CORS origins come from config/env, not a hardcoded list.
- [ ] README has a working live link (and a working CI badge — see item 3).

---

## 3. Cut the documentation theater
**Effort:** S · **Why:** ~15 root markdown files (`BACKEND_COMPLETE.md`,
`IMPLEMENTATION_COMPLETE.md`, `BEFORE_AND_AFTER.md`, `SETUP_SUMMARY.md`, etc.) read as filler and
lower signal.

- Keep: `README.md`, `ARCHITECTURE.md`, `backend/README.md`, this `ROADMAP.md`.
- Remove the rest (fold anything genuinely useful into the kept files).
- Fix the README badge URL (`yourusername` placeholder is broken).

**DoD:**
- [ ] Root has ≤4 markdown docs plus this roadmap.
- [ ] README badge points at the real repo and renders.

---

## 4. Real tests + meaningful CI
**Effort:** M · **Why:** Only two `.spec` files and a manual `test_api.py` exist. A green badge
should mean something.

- Backend: `pytest` covering REST endpoints and a WebSocket message; run in CI.
- Frontend: unit-test `DashboardApiService` and the dashboard's backend→mock fallback.
- CI fails on test failure, not just lint.

**DoD:**
- [ ] `pytest` suite exists and passes; wired into the GitHub Actions workflow.
- [ ] Frontend tests cover the service and the fallback path in `dashboard.ts`.
- [ ] CI job runs both test suites.

---

## 5. Harden existing code
**Effort:** M · **Why:** Self-contained fixes that demonstrate real engineering judgment.

- **WebSocket reconnection:** `dashboard-api.service.ts` reuses one `Subject`; once it `.error()`s
  it's permanently dead and there's no reconnect. Add reconnect with backoff and a per-connection
  stream.
- **FastAPI deprecation:** replace `@app.on_event("startup"/"shutdown")` in `backend/main.py` with
  the `lifespan` context manager.
- **`broadcast()` bug:** `backend/main.py` can mutate `active_connections` mid-iteration on send
  failure. Iterate over a copy and prune dead sockets safely.

**DoD:**
- [ ] Killing/restarting the backend causes the frontend to reconnect automatically.
- [ ] No `@app.on_event` usage remains; lifespan handler is used.
- [ ] `broadcast()` handles a failing/closed socket without corrupting the connection list.

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
