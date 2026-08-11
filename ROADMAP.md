# EtherealHotel — Improvement Roadmap

Work these in order. Each item has a **Definition of Done (DoD)** so a separate instance can
implement it and this instance can verify it. Effort is a rough estimate.

The bar for every item: _would a senior engineer reviewing this repo in an interview see judgment,
or see a tutorial?_ Prefer finishing one thing convincingly over starting three.

---

## 1. Finish the backend deployment (carried over — the only unfinished item from v1)

**Effort:** M · **Why:** `environment.prod.ts` points at `ethereal-hotel-api.onrender.com`, which
404s. The live site therefore shows failed requests in DevTools and runs on mock data. A dead URL
in production source is worse than no URL: it reads as unfinished rather than scoped.

- Deploy the FastAPI app (Render / Fly.io — `backend/Dockerfile` exists) and set `ALLOWED_ORIGINS`
  to the Vercel origin.
- Point `environment.prod.ts` at the real backend URL.
- Note the free-tier cold start (~30s on Render) in the README so a reviewer hitting a slow first
  load reads it as a known tradeoff, not a bug.

**DoD:**

- [ ] `curl https://<backend>/` returns the health JSON.
- [ ] The live Vercel site shows real data with a clean network tab — no 404s, no CORS errors.
- [ ] If the deploy is deliberately skipped, `environment.prod.ts` no longer references a dead host
      and the README says "simulated data in the hosted demo" explicitly.

---

## 3. End-to-end smoke test

**Effort:** M · **Why:** Unit tests cover the service and the fallback logic in isolation, but
nothing proves the app _boots and renders_. An E2E test is also the only honest way to verify the
mock-fallback path end to end, which is the path the hosted demo actually runs on today.

- Playwright, two specs: the landing page renders the hero and nav; `/dashboard` loads and displays
  metrics with the backend stubbed both up and down.
- Run against the production build in CI (`npm run build` → serve `dist/` → test), not the dev
  server, so it catches build-only breakage.
- Attach traces/screenshots as CI artifacts on failure.

**DoD:**

- [x] `npm run e2e` passes locally and in CI against a production build.
- [x] The suite fails if the dashboard renders empty or the fallback path breaks.
- [x] Failure artifacts (trace + screenshot) are uploaded by the workflow.

**Done.** `e2e/landing.spec.ts` and `e2e/dashboard.spec.ts`, with the backend stubbed at the network
layer in both directions (`e2e/support/backend.ts`) so the suite is hermetic and never depends on
the real API host. Both failure modes in the second box were confirmed by mutation rather than
assumed — zeroing the fallback metrics and making the health check swallow its error each fail the
dashboard spec and nothing else. The a11y and smoke suites now share one CI job, since they need
identical setup and `npm run e2e` covers both; `npm run a11y` still scopes to the audit locally.

---

## 4. Repo hygiene and a claims audit

**Effort:** S · **Why:** Small inaccuracies compound. Each one individually is trivial; together
they signal that nobody re-read the repo after writing it.

- **Delete `backend/test_api.py` and `backend/websocket_test.py`.** They're the manual scripts the
  real `backend/tests/` suite replaced. Worse, `npm run test:backend` still points at the _stale_
  script instead of `pytest` — so the documented command runs the obsolete tests.
- **README says "Python 3.9+". The code requires 3.10+** (`float | None` in `schemas.py` is
  PEP 604). CI runs 3.11. Pick one and state it everywhere. `backend/README.md` and
  `ARCHITECTURE.md` both still say 3.9+.
- **README says "Node.js (v20+)"; `package.json` `engines` says `^22.22.3 || ^24.15.0 || >=26`.**
- **`backend/.env.example` and `backend/README.md` document a `.env` file that is never loaded.**
  Nothing calls `load_dotenv()` — `config.py` reads `os.getenv` directly, and `python-dotenv` was
  an unused dependency (removed in the static-analysis pass). Either wire up dotenv in `config.py`
  or say plainly that configuration comes from real environment variables only.
- **README says "Angular 22 with signals"-adjacent claims** — re-check them now that the signals
  work has landed; the OnPush claim is finally true, so verify the rest are too rather than
  assuming.
- Add a real `LICENSE` file and a short `CONTRIBUTING.md`. Both are cheap and both are things
  reviewers check for reflexively on a public repo.
- Add 2–3 screenshots or a short GIF to the README. Most people decide whether to clone in about
  eight seconds, and no amount of prose competes with one image of the dashboard.

**DoD:**

- [ ] Legacy manual test scripts deleted; `npm run test:backend` runs `pytest`.
- [ ] Every version claim in the README matches what CI and `engines` actually enforce.
- [ ] No feature is described in the README that isn't demonstrably in the code.
- [ ] README opens with a screenshot of the dashboard above the fold.

---

## Explicitly out of scope (for now)

More charts, more animations, more frameworks, auth for auth's sake. Depth beats breadth — one
domain modeled honestly, deployed, tested and accessible outranks five half-built features.
