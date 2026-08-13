# Orientation

Read this first. It exists so you don't have to read 80KB of Markdown to make a five-line change.

## What this repo is

A portfolio site for Jacob Miller, deployed at https://ethereal-hotel-pink.vercel.app/. Angular 22
frontend, FastAPI backend, one Vercel project serving both. It looks like a hotel operations
product; it is a hiring artifact. That distinction decides most arguments:

- **The bar is truthfulness, not feature count.** Every number on screen is derived from real
  database rows. Every claim in the docs is supposed to be executable. When the app can't do
  something, it says so on screen rather than simulating it — see the three dashboard badge states
  in ARCHITECTURE's §Transport and degradation.
- **Two routes carry the whole technical argument**: `/dashboard` (reads, degrades from WebSocket →
  polling → committed fixture) and `/booking` (writes, renders server-side validation on the field
  that caused it). Everything else is a portfolio section.
- The owner writes and thinks in long form. `ROADMAP.md` and `AUBADE.md` are the actual planning
  documents — they carry reasoning, not just tasks. Read the relevant one before proposing work.

## Jacob writes one piece of every commit

He is keeping his hands in the code without giving up the throughput of delegating: **every commit
contains one unit written by him, by hand.** Not by you. Skipping it silently is the one
unrecoverable mistake in this section.

**The unit is currently level 1.** It widens as his fluency returns — only he moves it, so never
promote him unasked, and never shrink it because a task looks hard.

| Level | What he writes                                       |
| ----- | ---------------------------------------------------- |
| 1     | One function or method, to a signature you hand him. |
| 2     | One class, component, or test case.                  |
| 3     | The whole file carrying the commit's idea.           |

The loop is the same at every level:

1. **Pick the unit first, and pick for signal** — the rule, the validation, the state transition —
   not the barrel export or a getter. Say which you picked and why; he may swap it.
2. **Build everything around it**, including the tests that will judge it, so his piece drops into a
   slot already shaped for it. Leave the body a `TODO`, never a guess he has to overwrite.
3. **Brief him on contract, not source**: signature and types, what goes in and comes back, the edge
   cases that matter, the nearest thing in the repo to model on (as `path:line`), the traps. Then
   **stop and wait.** Do not paste a working version "for reference" — that is writing it with extra
   steps.
4. **Review what he writes** as you would a PR, then run the gates.

**Abort is always available and costs nothing.** If he hands it back, write it — no re-offering, no
remarks on the choice. He can also call the ritual off for a whole session. Skip it unasked only for
wholly mechanical commits (formatting, dependency bumps, generated files). When unsure, ask.

## Where to look — don't read them all

| File                | Size | Read it when                                                                                                                          |
| ------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `ROADMAP.md`        | 4K   | **Any question of "what should I build".** Numbered items with Definitions of Done, plus a "Deliberately not doing" list. Start here. |
| `README.md`         | 5K   | Almost never — it is a one-page shop window that links here and to `ARCHITECTURE.md`.                                                 |
| `ARCHITECTURE.md`   | 25K  | The reference doc: API shapes, the error contract, transports and badges, deployment, env vars, a11y.                                 |
| `backend/README.md` | 15K  | You are working inside `backend/` — DB schema, seeding, streaming design, Alembic.                                                    |
| `AUBADE.md`         | 17K  | Only if the task touches `/aubade` (a separate WebGL project, spec'd but **not built** — no `src/aubade/` exists yet).                |
| `CONTRIBUTING.md`   | 5K   | Setup and the five gates. This is where "how do I run it" lives; the README only links here.                                          |

**`ROADMAP.md` deletes items as they land** rather than checking them off, and renumbers what is
left from 1 so the list always reads 1, 2, 3, 4. The reasoning that survived a finished item moved
into the code or the config it describes. Two consequences: the numbers are positions in a queue,
not stable ids, so never cite one from outside the file — describe the item instead — and any
cross-reference *inside* the file has to be re-pointed when you renumber. Read the preamble before
proposing work; it carries the constraints the items assume.

The docs no longer carry a known-stale list: a finished ROADMAP item rewrote `README.md` down to one
page and made `ARCHITECTURE.md` the reference doc, fixing the drift that section used to warn about. Two
habits are what let that rot set in, so avoid both. Don't explain what FastAPI or RxJS *are* — the
reader knows. And don't restate the backend test count in another document: it was quoted in three
places and disagreed with itself in all three. There are 26 test functions in `backend/tests/`
today, this sentence is the only place that says so, and `check:docs` keeps it honest.

Code-level intent lives in module docstrings and file-header comments, and it is unusually dense
here: `api/index.py`, `backend/main.py`, `src/environments/environment.prod.ts`,
`scripts/py-tool.mjs`, `e2e/support/backend.ts` and `.gitattributes` each open by explaining why
they are the way they are. Read the header before changing the file; the answer is usually there.

## The five gates

CI (`.github/workflows/code-quality.yml`) runs these. Run them before claiming done:

```bash
npm run code-quality      # Prettier --check + ESLint --max-warnings 0
npm test                  # Vitest + coverage thresholds from angular.json
npm run test:scripts      # node --test over scripts/*.test.mjs — no browser, no dependency
npm run code-quality:py   # ruff format --check, ruff check, mypy --strict
npm run test:backend      # pytest
```

`npm run e2e` (build + Playwright smoke/axe) is a separate CI job. It needs
`npx playwright install --only-shell chromium` once. It stubs the backend at the network layer, so
it needs no running server. `npm run resume:check` runs in that same job because it needs the same
Chromium — it re-renders the résumé and fails when the committed PDF has drifted from
`src/app/resume/resume.data.ts`.

Another job runs `npm run check:docs`, which fails when this file's claims stop matching the repo.
See §Keeping this file honest — if you change something documented here, that check is how you find
out.

A further job runs `npm run lighthouse`: it builds, serves `dist/` on 4173 and audits `/` and
`/dashboard`, failing below performance 90, accessibility 100 and best-practices 95 — the
thresholds live in `lighthouserc.json` and the README states them. It fetches `@lhci/cli` at a
version pinned in `package.json` instead of declaring it, because `lighthouse` → `puppeteer-core` →
`extract-zip` carries an unfixable high advisory that would otherwise force `npm run audit` down to
`critical` for every package at once. Do not "tidy" it into `devDependencies`. Size is gated
separately by `angular.json` budgets, which are set just above the current build and **fail** it,
not warn — the numbers in the README, `lighthouserc.json` and `angular.json` are checked against
each other by `check:docs`.

`.github/workflows/supply-chain.yml` is a second workflow. `npm run audit` is its local twin: npm
advisories at **high and above**, then `pip-audit` over both Python lists. CodeQL runs there too,
over both languages, and reports to the Security tab rather than failing. Anything the audits let
through carries a `# EXCEPTION <token> (<YYYY-MM-DD>) — <reason>` note in that workflow, and
`check:docs` fails when a suppression has no note, when a note has no real date or no reason, and
when a note outlives the suppression it explained. Do not add a suppression without the note; do
not leave the note behind when the suppression goes.

## Traps that have cost previous instances time

- **`public/jacob-miller-resume.pdf` is generated — never edit it, and never edit the résumé in
  two places.** Its single source is `src/app/resume/resume.data.ts`, which the experience, skills
  and contact sections also read; `npm run resume:pdf` re-renders the PDF and `npm run resume:check`
  fails CI when the committed one has drifted. The fonts it embeds are vendored in
  `scripts/resume-fonts/` because text metrics decide the PDF's bytes, and a render using whatever
  fonts are installed would differ between this box and CI. It was a hand-built LibreOffice document
  until a ROADMAP item replaced it; that is the drift being prevented.
- **Never rewrite files with `sed`/`perl`/PowerShell redirection.** `.gitattributes` sets
  `* text=auto eol=lf`; scripted rewrites reintroduce CRLF, `npm run format:check` fails, and
  `git checkout --` does not reliably revert it. Use the Edit and Write tools.
- **Build with `npm run build`, never bare `ng build`.** The npm script chains
  `scripts/emit-route-meta.mjs`, which stamps a static `<route>/index.html` per route so crawlers
  get that route's social card — the app is client-rendered, so a title set by the router is
  invisible to Slack and LinkedIn. `ng build` alone drops those files and every shared link
  silently falls back to the home page's card.
- **`ruff`/`mypy`/`pytest`/`pip-audit` are not on PATH.** They live in `backend/venv`. Go through
  the npm scripts, which resolve them via `scripts/py-tool.mjs` (venv → `$VIRTUAL_ENV` → PATH). Both tools
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
- **`npm run lighthouse` cannot pass locally on this box, and that is not a regression.** The
  audits run and the reports land in `.lighthouseci/`; then `chrome-launcher` fails to delete
  Chrome's temp profile (the crash handler outlives its `taskkill`), exits non-zero, and `lhci`
  calls the collection failed before asserting anything. It is a race, no flag closes it, and
  `lhci` cannot forward Chrome flags regardless. CONTRIBUTING has the direct-run command that
  shows the scores. The thresholds are enforced by the Linux CI job — do not loosen them, and do
  not conclude the site regressed, on the strength of a local `EPERM`.
- Windows box. `run.bat` and `start-dev.bat` exist alongside their `.sh` twins. Ports in play:
  4200 (ng serve), 8000 (FastAPI), 4173 (`scripts/serve-dist.mjs` for Playwright and Lighthouse).

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
  digest replaces it. ARCHITECTURE §Accessibility has the reasoning.
- Health is mounted twice (`/` and `/api/health`) on purpose: one handler, two deployment shapes.
- **There is no cookie banner because there is nothing to consent to.** Vercel Analytics is loaded
  from the same-origin `/_vercel/` path and sets no cookie; that is the reason it was chosen over
  Plausible, and `@vercel/analytics` is deliberately not a dependency — it drags SvelteKit and Vite 8
  into resolution and only `--legacy-peer-deps` gets past it. `docs/analytics.md` states what is
  collected; `check:docs` fails if the events there and in `analytics.service.ts` disagree.

## Keeping this file honest

**This document is gated.** `npm run check:docs` (`scripts/check-docs.mjs`, its own CI job) reads
the repository and fails when a factual claim here stops being true — a path that moved, a version
pin that changed, a route that was renamed, the test count, the doc sizes in the table above. It
also checks the other documents against themselves — every `npm run` they tell a reader to type has
to exist in `package.json`, so a renamed script cannot leave a dead instruction behind.

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
| A gate, threshold, or CI job                     | §The five gates                                                  |
| A Lighthouse threshold or an `angular.json` budget | §The five gates, and the README's Gates section — it states them |
| Anything in `ROADMAP.md` §Deliberately not doing | §Don't helpfully add these — it mirrors that list                |
| Finishing a ROADMAP item that removes a section  | The doc-map row for whatever the item rewrote, and its size      |

**Two failure modes to avoid.** Do not let this file grow into a seventh long document — it earns
its place by being the short one, and anything over ~250 lines has stopped routing and started
duplicating. And do not loosen a check to make it pass: if a claim has stopped being worth
asserting, delete it from `CLAUDE.md` and from `scripts/check-docs.mjs` together.
