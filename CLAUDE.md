# Orientation

Read this first. It exists so you don't have to read 80KB of Markdown to make a five-line change.

## What this repo is

A portfolio site for Jacob Miller, deployed at https://ethereal-hotel-pink.vercel.app/. Angular 22
frontend, FastAPI backend, one Vercel project serving both. It looks like a hotel operations
product; it is a hiring artifact. That distinction decides most arguments:

- **The bar is truthfulness, not feature count.** Every number on screen is derived from real
  database rows. Every claim in the docs is supposed to be executable. When the app can't do
  something, it says so on screen rather than simulating it — see the three dashboard badge states
  in README's Configuration table.
- **Two routes carry the whole technical argument**: `/dashboard` (reads, degrades from WebSocket →
  polling → committed fixture) and `/booking` (writes, renders server-side validation on the field
  that caused it). Everything else is a portfolio section.
- The owner writes and thinks in long form. `ROADMAP.md` and `AUBADE.md` are the actual planning
  documents — they carry reasoning, not just tasks. Read the relevant one before proposing work.

## Where to look — don't read them all

| File                | Size | Read it when                                                                                                                          |
| ------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `ROADMAP.md`        | 13K  | **Any question of "what should I build".** Numbered items with Definitions of Done, plus a "Deliberately not doing" list. Start here. |
| `README.md`         | 28K  | You need the deployment story, env vars, the a11y decisions, or the coverage gate.                                                    |
| `ARCHITECTURE.md`   | 25K  | You need API endpoint shapes, the error contract, or the data-flow diagrams. **See "Stale claims" below.**                            |
| `backend/README.md` | 16K  | You are working inside `backend/` — DB schema, seeding, streaming design, Alembic.                                                    |
| `AUBADE.md`         | 17K  | Only if the task touches `/aubade` (a separate WebGL project, spec'd but **not built** — no `src/aubade/` exists yet).                |
| `CONTRIBUTING.md`   | 3K   | Shortest accurate summary of setup + the four gates. Good substitute for README §Quick Start.                                         |

Code-level intent lives in module docstrings and file-header comments, and it is unusually dense
here: `api/index.py`, `backend/main.py`, `src/environments/environment.prod.ts`,
`scripts/py-tool.mjs`, `e2e/support/backend.ts` and `.gitattributes` each open by explaining why
they are the way they are. Read the header before changing the file; the answer is usually there.

## The four gates

CI (`.github/workflows/code-quality.yml`) runs these. Run them before claiming done:

```bash
npm run code-quality      # Prettier --check + ESLint --max-warnings 0
npm test                  # Vitest + coverage thresholds from angular.json
npm run code-quality:py   # ruff format --check, ruff check, mypy --strict
npm run test:backend      # pytest
```

`npm run e2e` (build + Playwright smoke/axe) is a fifth CI job. It needs
`npx playwright install --only-shell chromium` once. It stubs the backend at the network layer, so
it needs no running server.

A sixth job runs `npm run check:docs`, which fails when this file's claims stop matching the repo.
See §Keeping this file honest — if you change something documented here, that check is how you find
out.

## Traps that have cost previous instances time

- **Never rewrite files with `sed`/`perl`/PowerShell redirection.** `.gitattributes` sets
  `* text=auto eol=lf`; scripted rewrites reintroduce CRLF, `npm run format:check` fails, and
  `git checkout --` does not reliably revert it. Use the Edit and Write tools.
- **`ruff`/`mypy`/`pytest` are not on PATH.** They live in `backend/venv`. Go through the npm
  scripts, which resolve them via `scripts/py-tool.mjs` (venv → `$VIRTUAL_ENV` → PATH). Both tools
  read config from the **root** `pyproject.toml`, and `mypy` takes no path argument — `files` in
  pyproject names both trees and a CLI path silently overrides it.
- **Node version affects the coverage gate.** V8 attributes function coverage differently across
  versions; `.nvmrc` pins 22.22.3 (what CI installs) and thresholds sit deliberately below actual.
  If `npm test` fails on coverage alone, check your Node version before touching thresholds.
  Thresholds only ever go up.
- **Python runs at two versions on purpose.** Container + CI + ruff/mypy target 3.11; the Vercel
  function runs 3.12 (Vercel offers no 3.11). The CI matrix runs both. Runtime deps are declared
  twice — `backend/requirements.txt` and `[project.dependencies]` in `pyproject.toml` — and
  `backend/tests/test_dependency_pins.py` fails if they drift. Update both.
- **Do not create a root `requirements.txt`.** It overrides `requires-python`/`.python-version` on
  Vercel and pins the build to 3.14, where `pydantic-core` has no wheel. This has broken the deploy
  before.
- **The Vercel project must stay on Node 24.x.** Its default 22.x is too old for Angular 22.
- Windows box. `run.bat` and `start-dev.bat` exist alongside their `.sh` twins. Ports in play:
  4200 (ng serve), 8000 (FastAPI), 4173 (`scripts/serve-dist.mjs` for Playwright).

## Stale claims — verify before repeating

The docs have drifted in known places. Don't propagate these, and fix them if you're in the file:

- **`ARCHITECTURE.md` is the least current.** Its project tree lists `src/styles/` and `src/assets/`
  (neither exists); its Dashboard hierarchy lists a `MetricCard` component that was never built;
  §Testing Strategy says E2E "can be added with Playwright" — `e2e/` has existed for several commits;
  §State Management says RxJS where the app is signals-over-RxJS-transport. Its "Future Enhancements"
  checklist is slated for deletion by ROADMAP item 6.
- **Backend test counts disagree** across README (26 in one place, 22 in two) and ARCHITECTURE (18).
  There are 26 test functions in `backend/tests/` today. Prefer not restating the count at all.
- **`ROADMAP.md` corrects itself in place** rather than being rewritten — item 1 is gone (done) and
  the prose above item 2 explains that its own premise was stale when written. Read the preamble,
  not just the headings.

## Conventions

- **Conventional Commits**, enforced by commitlint. History is mostly `feat:` with a short lowercase
  phrase (`feat: resolving internal contradictions`). Husky + lint-staged auto-fix staged files.
- Angular: standalone components, no `NgModule`, signals (`signal`/`computed`/`input()`), built-in
  control flow (`@for`/`@if`), OnPush — all lint-enforced. No `any`, explicit return types.
- Backend layering is strict: `routers/` validates and delegates, `services/` holds rules and raises
  domain errors with **no FastAPI imports**, `db/` owns persistence. Keep it.
- **Suppressions carry a reason.** Every disabled rule in `eslint.config.mjs` and `pyproject.toml`
  has a comment explaining itself; `RUF100` fails a stale `# noqa`. Match that if you add one.
- **Don't document what isn't wired.** The repo has been through a claims audit. If you add a config
  knob to a doc, make sure something reads it.

## Don't helpfully add these

`ROADMAP.md` §"Deliberately not doing" is binding: no auth/JWT, no Kubernetes/Prometheus/
multi-tenancy, no additional CRUD screens, no frontend rewrite. Also load-bearing and easy to
mistake for bugs:

- `wsUrl: null` in `environment.prod.ts` is an instruction to poll, not an unfinished config.
- The fixed RNG seed in `api/index.py` is what stops two function instances serving two different
  hotels. Bookings are still laid out around `date.today()` so the demo doesn't decay.
- The metrics grid is deliberately **not** an `aria-live` region — a throttled `role="status"`
  digest replaces it. README §Accessibility has the reasoning.
- Health is mounted twice (`/` and `/api/health`) on purpose: one handler, two deployment shapes.

## Keeping this file honest

**This document is gated.** `npm run check:docs` (`scripts/check-docs.mjs`, its own CI job) reads
the repository and fails when a factual claim here stops being true — a path that moved, a version
pin that changed, a route that was renamed, the test count, the doc sizes in the table above. It
also fails in the other direction: when one of the "stale claims" it warns about gets **fixed**, it
tells you to delete the warning, so that section retires itself instead of becoming the stale thing.

Run it after any change that touches this file's subject matter. It takes about 50ms and installs
nothing.

**When you add a claim here, add the check.** Prefer claims that can be falsified by a script — a
path, a pin, a port, a count, a quoted config value — over ones that cannot. If a claim is worth
writing down for the next agent, it is worth failing a build over, and if it isn't checkable it
probably belongs in `ROADMAP.md` as reasoning rather than here as fact.

The script deliberately does not check prose. These are the parts it cannot see, so they are on you:

| If you change…                                   | Re-read and revise                                               |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| What `/dashboard` or `/booking` actually do      | §What this repo is — the two-routes claim is the whole framing   |
| A degradation path, badge, or fallback           | §What this repo is, §Don't helpfully add these                   |
| Deployment target, `create_app` flags, Vercel    | §Traps — the Python split and the `requirements.txt` landmine    |
| A gate, threshold, or CI job                     | §The four gates                                                  |
| Anything in `ROADMAP.md` §Deliberately not doing | §Don't helpfully add these — it mirrors that list                |
| Finishing a ROADMAP item that removes a section  | §Stale claims, and the doc-map row for whatever the item rewrote |

**Two failure modes to avoid.** Do not let this file grow into a seventh long document — it earns
its place by being the short one, and anything over ~150 lines has stopped routing and started
duplicating. And do not loosen a check to make it pass: if a claim has stopped being worth
asserting, delete it from `CLAUDE.md` and from `scripts/check-docs.mjs` together.
