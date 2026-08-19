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
- **`/aubade` is not part of that argument and must not be folded into it.** It is a separate work
  living in `src/aubade/`, sharing this deployment and nothing else — no styles, no services, no
  tokens, and imports that only ever point one way. `AUBADE.md` is its spec; treat it as a second
  repository that happens to be in this folder.
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

| File                | Size | Read it when                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ROADMAP.md`        | 4K   | **Any question of "what should I build".** Numbered items with Definitions of Done, plus a "Deliberately not doing" list. Start here.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `README.md`         | 6K   | Almost never — it is a one-page shop window that links here and to `ARCHITECTURE.md`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `ARCHITECTURE.md`   | 25K  | The reference doc: API shapes, the error contract, transports and badges, deployment, env vars, a11y.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `backend/README.md` | 15K  | You are working inside `backend/` — DB schema, seeding, streaming design, Alembic.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `AUBADE.md`         | 24K  | Only if the task touches `/aubade` (a separate WebGL project). Seven phases have landed: the clock (`src/aubade/solar/`), the lobby, the five solar states that light it, the Reader's Edition (`src/aubade/reader/`), the descent to Floor −1 (`descent.ts`, `rooms/corridor-rig.ts`), the Cellar on Floor −3 (`cellar.ts`, `rooms/cellar-rig.ts`, `adapted()`), and the Projection Room on Floor −4 (`projection.ts`, `bench.ts`, `rooms/projection-rig.ts`, `projected()`). The Library on Floor −2 is half landed: the room, and now the sentence (`sentence.ts`, `scripts/build-sentence-atlas.mjs`, `MAT_FRIEZE`) in **four** writing systems of the eight. The item stays on the list, because the other four are cut on authorship rather than on code — see `docs/aubade-credits.md`. |
| `CONTRIBUTING.md`   | 6K   | Setup and the five gates. This is where "how do I run it" lives; the README only links here.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

**`ROADMAP.md` deletes items as they land** rather than checking them off, and renumbers what is
left from 1 so the list always reads 1, 2, 3, 4. The reasoning that survived a finished item moved
into the code or the config it describes. Two consequences: the numbers are positions in a queue,
not stable ids, so never cite one from outside the file — describe the item instead — and any
cross-reference _inside_ the file has to be re-pointed when you renumber. Read the preamble before
proposing work; it carries the constraints the items assume.

The docs no longer carry a known-stale list: a finished ROADMAP item rewrote `README.md` down to one
page and made `ARCHITECTURE.md` the reference doc, fixing the drift that section used to warn about. Two
habits are what let that rot set in, so avoid both. Don't explain what FastAPI or RxJS _are_ — the
reader knows. And don't restate the backend test count in another document: it was quoted in three
places and disagreed with itself in all three. There are 26 test functions in `backend/tests/`
today, this sentence is the only place that says so, and `check:docs` keeps it honest.

Code-level intent lives in module docstrings and file-header comments, and it is unusually dense
here: `api/index.py`, `backend/main.py`, `src/environments/environment.prod.ts`,
`scripts/py-tool.mjs`, `e2e/support/backend.ts` and `.gitattributes` each open by explaining why
they are the way they are. Read the header before changing the file; the answer is usually there.
`src/aubade/rooms/hotel.frag.ts` is the densest and the one where it matters most: GLSL has no
types, no linter and no reviewer, so its header carries the coordinate conventions and the three
decisions that buy the frame rate.

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
it needs no running server. Two more commands ride in that job because they need the same Chromium:
`npm run resume:check` re-renders the résumé and fails when the committed PDF has drifted from
`src/app/resume/resume.data.ts`, and `npm run verify:shader` compiles AUBADE's GLSL and renders a
frame. That last one exists because the shaders are the only code here whose compiler would
otherwise first run in production — `tsc` cannot read them and the unit tests drive a stub context
that never looks at the source. Add `-- --out some.png` to look at the frame; it renders through
SwiftShader, so it says nothing about speed.

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
  `scripts/resume-fonts/` because text metrics decide the layout, and a render using whatever fonts
  are installed would wrap the lines differently on this box and on CI. It was a hand-built
  LibreOffice document until a ROADMAP item replaced it; that is the drift being prevented.
- **The résumé gate compares the PDF's text, not its bytes.** Chromium's output is deterministic
  per machine and structurally different across machines — 210KB in 364 objects on Windows, 97KB in
  163 on Linux CI, because Skia cannot embed Crimson Pro and decomposes it into a platform-specific
  number of Type3 fonts. A byte comparison could never pass in CI and re-rendering could never fix
  it. `scripts/pdf-text.mjs` reads the text layer, which _is_ identical everywhere; its one rule is
  that it never reads a coordinate, because glyph advances are not.
- **GLSL lives inside a template literal, so a backtick in a shader comment ends the string** and
  the error lands thirty lines away. Same family: GLSL ES 3.00 reserves `half`, `sample`, `input`,
  `output` and a long tail more, and rejects them with a line number and no reason. Run
  `npm run verify:shader` after any GLSL edit — four seconds, and it catches both.
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
- **Run `e2e/aubade.spec.ts` at `--workers=2` before believing a local failure.** SwiftShader is a
  CPU rasteriser and the default ten workers oversubscribe this box: measured at a clean `HEAD`,
  16 of 16 pass at two workers and 15 at ten, the straggler being whichever test has to fetch the
  renderer chunk and draw a first frame under the most contention. Two is also what a four-core CI
  runner gives itself, so it is the honest local reading. Do not "fix" a failure by shrinking
  viewports or raising timeouts on the strength of a local run — shrinking the viewport is what
  `renders the lobby` exists to resist, and the Linux CI job is what decides.
- **A 1280×720 frame costs about 1.5s here, and that number is a canary.** It read 13s once, and
  the box was not the reason — `mapScene` had grown a third floor in a way that named seven rooms
  where three would do, which cost ten times the frame and timed out twelve CI tests.
  `npm run verify:shader` prints a wall time for 25 frames (about 40s); a large jump in it is a
  shader regression, not a slow afternoon.
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
- **The lobby is lit by the real sun**, so five things about it look like duplication and are not.
  `rooms/light-rig.ts` holds five rigs for one shader — five compiles would stall a driver at the
  moment the sky changes — and `check:docs` fails if a state loses its rig or its committed frame
  in `docs/images/`. `src/aubade/reduced-motion.ts` duplicates its `src/app/` twin and
  `aubade/tokens.css` re-declares colours that already exist, because a shared helper is precisely
  how a separate work stops being one; `check:docs` gates the import direction.
- **Floor −1 runs the clock backwards.** `rooms/corridor-rig.ts` dims its sconces as the lobby's
  sky brightens — no window, so the sun reaches the corridor by turning its gas out and then
  coming down the lift shaft at noon. `verify:shader` asserts both opposite orderings.
- **Floor −2 does not run the clock at all, and that is the room.** In `rooms/library-rig.ts`
  five of six fields are one spread constant — the lamps are identical at every hour — and only
  `inkStrength` moves, to _exactly_ 0 at `shuttered`: a fully lit reading room with nothing
  written in it. So `verify:shader` asserts a third, different claim, mean luma **flat** and the
  frame's deviation falling, because a mean cannot see this floor's hour. The library carries its
  own `exposure` too: `uExposure` is Floor 0's field and `tonemap` applies it to the whole frame,
  so un-blended the lobby's noon stop reached two storeys down and brightened the library by 8%.
- **The lift is one uniform, and it counts floors.** `uDepth` is 0 in the lobby, 1 in the
  corridor, 2 in the library, 3 in the cellar, 4 in the projection box — depth is minus the floor,
  exactly — and `mapScene`
  branches on which _pair_ a ride is between, so a ride still evaluates two distance fields and a
  settled floor one. AUBADE's phase note named the alternative (the lift becomes a fade) and it was
  rejected. **`mapScene` must also name each room exactly once**, which is a claim about the
  compiler rather than the frame: it is inlined at seven sites, so a room written twice is a
  second copy of its field in all seven, and writing it as early returns over a two-armed mix
  cost SwiftShader ten times the frame for a lobby that had not changed. Every integer must be
  hit _exactly_, because the scene branch has no epsilon at all, and the
  mirror's second march only wakes inside `MORPH_EPSILON` of 1 — a two-sided band, not a
  threshold, or it stays awake down to a floor with no mirror in it. `MORPH_EPSILON` is declared
  twice (`descent.ts`, and GLSL, which cannot import) and `check:docs` fails on drift; a drifted
  pair looks fine and silently costs the mirror.
- **Floor −2's sentence is the piece's only asset, and it is a distance field rather than a
  picture.** `public/aubade-sentence.png` is four lines of type tabulated as a signed distance
  function, built by `scripts/build-sentence-atlas.mjs` and read by `MAT_FRIEZE`; the shader
  evaluates it, mixes two of them and takes a contour, exactly as it does with every wall in the
  building. Three things about it look like mistakes and are not. It is **single-channel SDF, not
  MSDF**, because MSDF's channels are meaningful only relative to one glyph's corners and
  interpolating them between two scripts destroys the corners they exist to protect — the morph is
  the floor, so true distance wins. It ships **four writing systems, not eight**, and the missing
  four are cut on authorship rather than shaping: Chromium does the shaping, so Arabic would very
  likely come out right, and "very likely right in a language nobody here reads" is what
  `docs/aubade-credits.md` exists to refuse. And every fetch is **`textureLod`, never `texture`** —
  `surfaceAlbedo` runs inside a branch on the material, where implicit derivatives are undefined,
  so the correct-looking version is correct only on the driver it was written on. `check:docs`
  holds all three, plus the two constants GLSL cannot import (`SENTENCE_TILES`,
  `SENTENCE_SPREAD`), plus the sentence obeying `uInk`. `verify:shader` renders the library in two
  scripts and requires two pictures at night and one at noon.
- **Floor −3 does not change, and the visitor does.** The Cellar's field is identical at every
  hour and for everybody; the ninety seconds are `adapted()`, a gain and a desaturation on the
  finished frame. `check:docs` fails if `uStillness` or `uAdaptation` appears inside
  `CELLAR_GLSL` — a room that knows how still you have been assembles itself, which is the thing
  this floor exists not to do — and if `adaptation` stops being **exactly 0** at `shuttered`. So
  its frames are a _pair_ rather than a series, and `verify:shader` asserts that shape: five
  identical `arriving` frames, a settled one 3× brighter and _less_ coloured, and the noon pair
  equal. `arriving` is deliberately uncommitted (five copies of one picture). Under
  `prefers-reduced-motion` the room is handed over already resolved — that path draws one frame,
  so the alternative is black for ever.
- **Floor −4 answers the sun with time, and the quantisation is deliberately not in the shader.**
  The projector runs at 24fps at astronomical night and slows to **exactly 0** at noon, where one
  frame burns through in the gate (`uBurn`, exactly 0 at every other hour). `filmFrameAt` in
  `projection.ts` is the quantiser and `renderer.ts` poses the _camera_ at its result, because a
  picture that steps under a viewpoint that glides is a filter rather than a room. So this floor is
  the one whose claim no single frame can carry: `verify:shader` renders it at two seconds and
  requires them to differ at night and to be identical at noon. `check:docs` holds the exact 0, the
  `filmFrameAt` call in the renderer, and the six `STACK_*` bits plus the three reel constants,
  each declared twice (`projection.ts` and GLSL, which cannot import).
- **The bench is six controls and not seven.** `bench.ts` switches gate weave, halation, grain,
  judder, splices and cue dots; the rate sits beside them as a readout and is not a control, because
  a visitor who could restart the projector at noon has been handed the floor's answer to the clock.
  `check:docs` fails if the template loses `throwSwitch`. The `@if` around the bench lives in
  `bench.html` rather than in `aubade.html` because it is the eleventh branch in a template capped
  at ten — that cap is real and has now shaped three files.
- **The absent reflection is one argument**: `shadeSurface`'s `carried`, 1 in the room and 0 in
  the mirror. Deliberately unphysical — a correct mirror would show the lit floor — so passing
  1.0 gives a beautiful corridor about nothing. No test sees that, so `check:docs` does.
- **`/aubade/reader` is a second route, not a section of the lobby.** Its whole point is that no
  WebGL context is created on it — `check:docs` walks its import graph and fails if it can reach
  `gl/`, `rooms/`, `camera/` or `renderer.ts`, so folding it back into `/aubade` costs the phase
  its Definition of Done. Both of the lobby's screens must link to it; that count is gated too.
- **`?t=` is dev-only on purpose.** A visitor who can type `?t=open` has been handed the whole work
  and the refusal stops being the concept. The invitation control is the production door, and it is
  mandatory. `check:docs` fails if the back door escapes `isDevMode()`.
- The renderer is behind a dynamic `import()` in `aubade.ts` so no WebGL code is fetched, and no
  context created, before someone opens the route. A static import would work and quietly cost
  AUBADE's second non-negotiable; `check:docs` fails if it happens.
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

| If you change…                                     | Re-read and revise                                               |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| What `/dashboard` or `/booking` actually do        | §What this repo is — the two-routes claim is the whole framing   |
| A degradation path, badge, or fallback             | §What this repo is, §Don't helpfully add these                   |
| Deployment target, `create_app` flags, Vercel      | §Traps — the Python split and the `requirements.txt` landmine    |
| A gate, threshold, or CI job                       | §The five gates                                                  |
| A Lighthouse threshold or an `angular.json` budget | §The five gates, and the README's Gates section — it states them |
| Anything in `ROADMAP.md` §Deliberately not doing   | §Don't helpfully add these — it mirrors that list                |
| Finishing a ROADMAP item that removes a section    | The doc-map row for whatever the item rewrote, and its size      |
| Finishing an AUBADE phase                          | Its doc-map row; delete the phase and renumber the rest          |

**Two failure modes to avoid.** Do not let this file grow into a seventh long document — it earns
its place by being the short one, and anything over ~250 lines has stopped routing and started
duplicating. And do not loosen a check to make it pass: if a claim has stopped being worth
asserting, delete it from `CLAUDE.md` and from `scripts/check-docs.mjs` together.
