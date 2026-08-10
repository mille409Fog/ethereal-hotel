# EtherealHotel — Improvement Roadmap

Work these in order. Each item has a **Definition of Done (DoD)** so a separate instance can
implement it and this instance can verify it. Effort is a rough estimate.

The bar for every item: *would a senior engineer reviewing this repo in an interview see judgment,
or see a tutorial?* Prefer finishing one thing convincingly over starting three.

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

## 2. Make CI enforce the standards the README advertises
**Effort:** S · **Why:** `npm run lint` currently reports **30 warnings, 0 errors**, and CI passes.
The README lists "Strict TypeScript and Angular linting rules" and "OnPush change detection
(recommended)" while neither is enforced. A green badge over 30 ignored warnings is a credibility
problem, not a feature.

- Add `--max-warnings 0` to the `lint` script, then drive the count to zero. Most are trivial
  (missing accessibility modifiers, missing return types) and sit in spec files and `test-setup.ts`.
- **Judgment call worth documenting:** 14 of the 30 are
  `@angular-eslint/component-class-suffix` ("class names should end with Component"). The modern
  Angular style guide *dropped* that suffix, and this repo already follows the newer convention
  (`Dashboard`, `Navigation`). The right fix is to turn the rule **off** with a one-line comment
  explaining why — not to rename 14 classes backwards. Showing you know which lint rules are stale
  reads better than blind compliance. (The signals work already set the precedent: it turned
  `template/no-call-expression` off, with a comment, because that rule predates signal reads.)
- Enable coverage in the Vitest config with a threshold that fails the build (start at whatever
  today's number is, so it ratchets rather than blocks).
- Bump `prefer-on-push-component-change-detection` to `error` — every component now complies, so
  the rule can be enforced without a single code change.

**DoD:**
- [ ] `npm run lint` exits non-zero on a single new warning; the current tree is clean.
- [ ] `npm run test` reports coverage and fails below the configured threshold.
- [ ] CI runs both and the badge reflects a build that would actually catch a regression.

---

## 3. Backend engineering depth: broadcaster, service layer, full CRUD
**Effort:** M · **Why:** `main.py` is a 285-line file holding schemas, CORS config, connection
management, business logic and routes. It works, but it's the shape reviewers expect from a demo,
not from someone who has maintained a service. Three concrete tells:

- **Every WebSocket client independently polls the DB every 2s.** Ten viewers on the live demo =
  ten identical queries per tick. Replace with a single background task that computes metrics once
  and calls `manager.broadcast(...)` — which also fixes the fact that `broadcast()` is currently
  **dead code** (the previous roadmap admitted this and shipped it anyway).
- **No `GET /api/bookings`.** You can create and delete bookings but not list them, which makes the
  API awkward to demo and obviously incomplete. Add it with pagination and a status filter.
- **`print()` as logging.** Swap for the `logging` module with a configurable level, so the
  deployed service produces something a platform's log viewer can filter.

Then split: `routers/` for endpoints, `schemas.py` for Pydantic models, `services/` for the
booking logic currently inlined in the route handlers.

**DoD:**
- [ ] One shared broadcast task; N connected clients produce O(1) DB queries per tick (verify by
      logging query counts with 2+ clients connected).
- [ ] `GET /api/bookings?limit=&offset=&status=` returns paginated results, covered by a test.
- [ ] `main.py` is under ~80 lines: app construction and wiring only.
- [ ] No bare `print()` in `backend/`; log level reads from an env var.

---

## 4. Python static analysis to match the frontend's
**Effort:** S · **Why:** The frontend has ESLint, Prettier, Husky, lint-staged and commitlint. The
backend has *nothing* — no formatter, no linter, no type checker in CI. A reviewer who works in
Python will notice the asymmetry immediately, and it undercuts the "code quality" framing the whole
repo is built around.

- Add `pyproject.toml` with **ruff** (lint + format, replaces black/isort/flake8) and **mypy** in
  strict-ish mode. `pyrightconfig.json` already exists for the editor — CI needs its own gate.
- Wire `ruff check`, `ruff format --check` and `mypy` into the `backend` CI job.
- Extend `lint-staged` to run ruff on staged `.py` files so the pre-commit hook covers both halves
  of the repo.
- Pin dependencies properly and add Dependabot for `pip`, `npm` and `github-actions`.

**DoD:**
- [ ] `ruff check backend/` and `mypy backend/` pass locally and run in CI.
- [ ] Committing a badly formatted `.py` file is blocked by the pre-commit hook.
- [ ] `.github/dependabot.yml` exists and covers all three ecosystems.

---

## 5. Accessibility as a first-class concern
**Effort:** M · **Why:** There is not a single `@angular-eslint/template/accessibility-*` rule in
the ESLint config, and the dashboard mutates numbers on screen every 2 seconds with no `aria-live`
region — a screen reader user gets silence. Accessibility is a standard senior interview probe and
one of the cheapest ways to separate a portfolio from the pile, precisely because most portfolios
skip it.

- Turn on the `@angular-eslint/template` accessibility rule set and fix what it finds.
- `aria-live="polite"` on the metrics region; announce backend connect/disconnect transitions.
- Keyboard: visible focus states, a skip-to-content link, verified tab order through the nav.
- `prefers-reduced-motion` honored by the scroll-reveal directive and the CSS animations.
- Run axe (via Playwright from Item 6, or `@axe-core/cli`) in CI against the built app.

**DoD:**
- [ ] Accessibility lint rules enabled; template lint passes with zero warnings.
- [ ] Automated axe scan of `/` and `/dashboard` reports zero critical or serious violations, run
      in CI.
- [ ] The site is fully operable by keyboard alone, and animations stop under reduced-motion.
- [ ] README documents the a11y approach in two or three sentences — say it, or nobody notices.

---

## 6. End-to-end smoke test
**Effort:** M · **Why:** Unit tests cover the service and the fallback logic in isolation, but
nothing proves the app *boots and renders*. An E2E test is also the only honest way to verify the
mock-fallback path end to end, which is the path the hosted demo actually runs on today.

- Playwright, two specs: the landing page renders the hero and nav; `/dashboard` loads and displays
  metrics with the backend stubbed both up and down.
- Run against the production build in CI (`npm run build` → serve `dist/` → test), not the dev
  server, so it catches build-only breakage.
- Attach traces/screenshots as CI artifacts on failure.

**DoD:**
- [ ] `npm run e2e` passes locally and in CI against a production build.
- [ ] The suite fails if the dashboard renders empty or the fallback path breaks.
- [ ] Failure artifacts (trace + screenshot) are uploaded by the workflow.

---

## 7. Repo hygiene and a claims audit
**Effort:** S · **Why:** Small inaccuracies compound. Each one individually is trivial; together
they signal that nobody re-read the repo after writing it.

- **Delete `backend/test_api.py` and `backend/websocket_test.py`.** They're the manual scripts the
  real `backend/tests/` suite replaced. Worse, `npm run test:backend` still points at the *stale*
  script instead of `pytest` — so the documented command runs the obsolete tests.
- **README says "Python 3.9+". The code requires 3.10+** (`float | None` in `main.py` is PEP 604).
  CI runs 3.11. Pick one and state it everywhere.
- **README says "Node.js (v20+)"; `package.json` `engines` says `^22.22.3 || ^24.15.0 || >=26`.**
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

---

## Already shipped
Kept as a one-line ledger; the full DoDs are in git history.

- **Signals + OnPush throughout** — `signal()`/`computed()` for component state, `input()` for every
  component input, `inject()` everywhere, `takeUntilDestroyed(destroyRef)` replacing the `destroy$`
  Subject, and `ChangeDetectionStrategy.OnPush` on all 14 components. `ChartsSection` swapped
  `ngOnChanges` for an `effect()`. **This turned out to be a bug fix, not just modernization:** the
  app has no zone.js, so under zoneless change detection the old mutable-field writes scheduled no
  render at all — with a healthy backend the dashboard sat permanently on "Connecting to the API…"
  and the metrics never moved. Verified against the live backend before and after. Lint dropped
  60 → 30 warnings; `template/no-call-expression` turned off with a comment, since it predates
  signal reads. *(2026-08-10)*
- **Hotel domain surfaced in the UI** — dashboard renders occupancy, ADR, RevPAR,
  arrivals/departures and room inventory; charts show guests in house, nightly room revenue and
  tonight's room mix. Legacy `activeUsers / revenue / requests / uptime` retired from both ends of
  the contract, `historicalUsers` renamed `historicalGuests`. The `Math.random()` fallback is
  replaced by a committed snapshot of real seeded output, labelled "simulated data" in the header.
  *(2026-08-10)*
- **Real persistence** — SQLite + SQLAlchemy + Alembic, `Room`/`Guest`/`Booking`, seed script; all
  dashboard metrics derived from rows, not RNG. *(2026-08-09)*
- **Frontend deployed + env-based config** — Vercel, `environment.ts`/`environment.prod.ts`,
  `ALLOWED_ORIGINS` for CORS. Backend deploy remains open as Item 1. *(2026-08-09)*
- **Documentation cut** — ~15 root markdown files reduced to README, ARCHITECTURE, ROADMAP.
  *(2026-08-09)*
- **Real tests + CI** — 9 pytest tests (REST + WebSocket, isolated seeded DB), 23 frontend specs;
  both wired into GitHub Actions and failing the build on error. *(2026-08-09)*
- **Hardening** — WebSocket reconnect with exponential backoff, FastAPI `lifespan` replacing
  `on_event`, `broadcast()` no longer mutates its list mid-iteration. *(2026-08-09)*
- **Credibility sweep** — placeholders removed from shipped pages; titles verified accurate.
  *(2026-08-09)*
