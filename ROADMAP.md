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

## 2. Python static analysis to match the frontend's
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

## 3. Accessibility as a first-class concern
**Effort:** M · **Why:** There is not a single `@angular-eslint/template/accessibility-*` rule in
the ESLint config, and the dashboard mutates numbers on screen every 2 seconds with no `aria-live`
region — a screen reader user gets silence. Accessibility is a standard senior interview probe and
one of the cheapest ways to separate a portfolio from the pile, precisely because most portfolios
skip it.

- Turn on the `@angular-eslint/template` accessibility rule set and fix what it finds.
- `aria-live="polite"` on the metrics region; announce backend connect/disconnect transitions.
- Keyboard: visible focus states, a skip-to-content link, verified tab order through the nav.
- `prefers-reduced-motion` honored by the scroll-reveal directive and the CSS animations.
- Run axe (via Playwright from Item 5, or `@axe-core/cli`) in CI against the built app.

**DoD:**
- [ ] Accessibility lint rules enabled; template lint passes with zero warnings.
- [ ] Automated axe scan of `/` and `/dashboard` reports zero critical or serious violations, run
      in CI.
- [ ] The site is fully operable by keyboard alone, and animations stop under reduced-motion.
- [ ] README documents the a11y approach in two or three sentences — say it, or nobody notices.

---

## 4. End-to-end smoke test
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

## 5. Repo hygiene and a claims audit
**Effort:** S · **Why:** Small inaccuracies compound. Each one individually is trivial; together
they signal that nobody re-read the repo after writing it.

- **Delete `backend/test_api.py` and `backend/websocket_test.py`.** They're the manual scripts the
  real `backend/tests/` suite replaced. Worse, `npm run test:backend` still points at the *stale*
  script instead of `pytest` — so the documented command runs the obsolete tests.
- **README says "Python 3.9+". The code requires 3.10+** (`float | None` in `schemas.py` is
  PEP 604). CI runs 3.11. Pick one and state it everywhere. `backend/README.md` and
  `ARCHITECTURE.md` both still say 3.9+.
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

- **Backend engineering depth: broadcaster, service layer, full CRUD** — `main.py` went from 285
  lines holding everything to 80 lines of wiring: `config.py` (env-driven settings + logging),
  `schemas.py` (the wire contract), `routers/` (health, metrics, bookings, stream) and `services/`
  (`bookings.py` for the rules, `broadcaster.py` for the stream). Services import no FastAPI and
  raise domain errors — `InvalidBookingDates`, `ReferenceNotFound`, `BookingNotFound` — which the
  router maps to status codes, so HTTP knowledge stays in the HTTP layer. **The per-client DB poll
  is gone:** one `asyncio` task computes a snapshot per tick and fans it out through
  `manager.broadcast(...)`, which is now the live path rather than dead code. Measured against a
  real running app with two clients on the stream: **7 queries per tick, not 14** — the query count
  is the same for one client as for five, and a tick with nobody connected skips the database
  entirely. Clients still get one snapshot on connect so a freshly opened dashboard renders
  without waiting out a tick. `GET /api/bookings?limit=&offset=&status=` returns
  `{items, total, limit, offset}`, ordered check-in-desc and tie-broken on id so paging is stable.
  `print()` replaced by `logging` throughout the service, level from `LOG_LEVEL` (an unknown value
  warns and falls back to INFO rather than failing a deploy). Tests 9 → 18, including one that
  counts SQL against the engine so a per-client poll cannot quietly return. Known gap: the two
  legacy scripts `test_api.py` / `websocket_test.py` still contain `print()` — they are deleted by
  Item 5, and are already broken anyway (they reference the retired `activeUsers` payload).
  *(2026-08-10)*
- **CI enforces the standards the README advertises** — `npm run lint` runs with `--max-warnings 0`
  and the tree sits at zero; Vitest reports coverage and fails below thresholds committed in
  `angular.json` (statements 64 / branches 75 / functions 52 / lines 62, set at the day's real
  numbers so they ratchet upward rather than block). `prefer-on-push-component-change-detection`
  promoted from `warn` to `error`, which every component already satisfies. **Both gates were
  verified to actually fire, not merely exist:** one stray `console.log` fails lint, and a
  temporarily raised threshold fails the test run. Three rules are off by design, each with a
  comment giving the reason — `component-class-suffix` (the style guide dropped the suffix),
  `template/no-call-expression` (predates signals), and `max-lines-per-function` in specs (a
  `describe` callback's length isn't a complexity signal). README's "recommended" and "strict"
  wording rewritten to describe what CI actually blocks. Known friction: the coverage margins are
  thin by construction — functions sits at 52.11% against a 52% floor, so the first uncovered
  helper someone adds will trip the build. Raise the floors or widen them the moment that becomes
  annoying; a gate people route around is worse than no gate. *(2026-08-10)*
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
