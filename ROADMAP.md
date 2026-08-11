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

- [x] Legacy manual test scripts deleted; `npm run test:backend` runs `pytest` (18 passing).
- [x] Every version claim in the README matches what CI and `engines` actually enforce.
- [x] No feature is described in the README that isn't demonstrably in the code.
- [x] README opens with a screenshot of the dashboard above the fold.

**Done (2026-08-11).** Notes on what the audit actually turned up:

- `engines` is `^22.22.3 || ^24.15.0` — the `|| >=26` above was never in the file. The README's
  "Node.js (v20+)" is now the real range, with `.nvmrc` (22.22.3, what CI installs) and the
  Vercel 24.x deploy both named.
- Python floor is **3.11**, not 3.10 — CI, `backend/Dockerfile` (`python:3.11-slim`), ruff
  `target-version` and mypy `python_version` all already agreed on 3.11. Stated in README,
  `backend/README.md` and `ARCHITECTURE.md`.
- **`.env` resolved by deletion.** `backend/.env.example` documented five variables
  (`HOST`, `PORT`, `RELOAD`, `API_PREFIX`, `DEBUG`) that *no code reads at all* — `main.py`
  hardcodes host/port/reload. Deleted rather than wiring up dotenv; both READMEs now say
  configuration comes from real environment variables and list the four that exist.
- **`tsconfig.json` was missing `strict: true`** while the README claimed "TypeScript strict
  mode". Enabling it produced exactly one error (`e2e/a11y.spec.ts`, an `impact` that is
  optional as well as nullable), now fixed — so the claim is true rather than removed.
- Two other claims were false and are corrected: "async pipe for observables" (no such rule is
  configured; it's `no-negated-async`) and "takeUntil pattern" (the code uses
  `takeUntilDestroyed(DestroyRef)`).
- `requests` / `types-requests` dropped from `requirements-dev.txt` — they existed only for the
  deleted smoke script.
- Added `.gitattributes` (`* text=auto eol=lf`). Two committed files were CRLF on disk, so the
  documented `npm run format:check` failed on Windows while CI stayed green.

Verified green: `format:check`, `lint`, `test` (70 passing), `code-quality:py`,
`test:backend` (18 passing), `e2e` (13 passing), `build`.

---

## Explicitly out of scope (for now)

More charts, more animations, more frameworks, auth for auth's sake. Depth beats breadth — one
domain modeled honestly, deployed, tested and accessible outranks five half-built features.
