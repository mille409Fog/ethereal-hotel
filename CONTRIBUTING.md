# Contributing

Thanks for taking a look. This is a portfolio project, so the bar is less "ship features
fast" and more "every claim in the repo is true and every gate is real." Contributions are
welcome on that basis.

## Setup

You need **Node.js 22.22.3+ or 24.15.0+** (`.nvmrc` pins 22.22.3, which is what CI uses) and
**Python 3.11+**.

```bash
npm install

cd backend
python -m venv venv
venv\Scripts\activate          # macOS/Linux: source venv/bin/activate
pip install -r requirements-dev.txt
```

`requirements-dev.txt` includes the runtime deps plus pytest, ruff and mypy — the same set CI
installs. The npm scripts find `ruff`/`mypy`/`pytest` inside `backend/venv` on their own
(`scripts/py-tool.mjs`), so you don't have to keep the virtualenv activated to run them.

## Running it

```bash
npm start           # Angular dev server on :4200
npm run start:backend   # FastAPI on :8000
```

The dashboard works without the backend — it falls back to a committed snapshot of a seeded
database and labels itself "simulated data".

## Before you open a PR

Run the same gates CI does. All five must pass:

```bash
npm run code-quality      # Prettier + ESLint (--max-warnings 0)
npm test                  # Vitest + coverage thresholds
npm run test:scripts      # node --test over scripts/*.test.mjs
npm run code-quality:py   # ruff format --check, ruff check, mypy --strict
npm run test:backend      # pytest
```

`npm run e2e` additionally builds and runs the Playwright suite (smoke + accessibility). It
needs a browser once: `npx playwright install --only-shell chromium`.

## The résumé

The site's experience, skills and contact sections and the downloadable PDF are one structure:
`src/app/resume/resume.data.ts`. Edit that, then:

```bash
npm run resume:pdf        # re-render public/jacob-miller-resume.pdf
npm run resume:check      # what CI runs — fails if the committed PDF is stale
```

`resume:check` runs in the Playwright job because it needs the same Chromium. Never edit the PDF
directly, and never edit it in a word processor — it is a build output, and the check will catch
it.

The check compares the PDF's **text layer and page size**, not its bytes: Chromium renders the same
résumé to 210KB here and 97KB on the Linux CI runner, so a byte comparison could only ever pass on
the machine that produced the committed file. `scripts/pdf-text.mjs` has the measurements. On
failure it prints where the two documents first diverge, with context either side.

`resume:pdf` still leaves the file looking modified in `git status`, because Chromium stamps the
render time into every PDF it writes. `resume:check` — not `git diff` — is what tells you whether
anything really changed. If it passes, `git checkout -- public/jacob-miller-resume.pdf` and keep
the diff clean.

`npm run lighthouse` builds, serves `dist/` on :4173 and audits `/` and `/dashboard`, failing
below the thresholds in `lighthouserc.json`. It drives whatever Chrome you already have and
fetches the Lighthouse CLI at a pinned version rather than installing it — `lighthouse` depends
on `puppeteer-core`, which carries an open high-severity advisory with no fix, and a measurement
tool that never ships is not worth suppressing the dependency audit for.

**On Windows that command audits correctly and then dies cleaning up.** Chrome's crash handler
outlives the `taskkill` that `chrome-launcher` uses and keeps a handle on the temp profile
directory, so `destroyTmp()` throws `EPERM` *after* the audit has run and the report has been
written. `lhci` treats that non-zero exit as a failed collection and never reaches its assertion
step. It is a race rather than a setting — `--disable-breakpad` and `--disable-crash-reporter`
change how often it happens and not whether it can — and the flags cannot be routed through
`lhci` anyway: it writes `chromeFlags` into a `--cli-flags-path` file, where yargs' own default
for `--chrome-flags` overrides them.

So on Windows, read the scores from a direct run instead. The report is written before the
cleanup fails, so it is there regardless of the exit code:

```bash
node scripts/serve-dist.mjs &                     # or run it in a second terminal
npx lighthouse http://localhost:4173/dashboard --preset=desktop --view
```

The thresholds are enforced by the CI job, which runs on Linux and does not hit this.

`npm run audit` runs the dependency scanners CI runs — `npm audit` at high and above, then
`pip-audit` over both Python lists. You only need it when you have touched a dependency, but a
PR that adds one will fail on it if the pin carries a known advisory. Anything left open has to
carry a dated `# EXCEPTION` note in `.github/workflows/supply-chain.yml`; `npm run check:docs`
fails if it does not, and fails again if the note outlives the thing it excused.

A pre-commit hook runs lint-staged over your staged files and will auto-fix what it can.
Anything it can't fix — an ESLint error, an undefined name — blocks the commit.

## Standards worth knowing up front

- **Commits follow [Conventional Commits](https://www.conventionalcommits.org/)**, enforced by
  commitlint. `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, `ci:`, `build:`,
  `perf:`, `style:`, `revert:`.
- **Coverage thresholds only go up.** They live in `angular.json` under
  `test.options.coverageThresholds` and are set at today's numbers. If your tests raise the
  real figures, raise the thresholds to match in the same PR.
- **Accessibility is a build gate, not a review note.** The template a11y rules are errors and
  axe scans both routes in CI, failing on serious/critical findings. If a change trips it,
  fix the markup rather than narrowing the scan.
- **Suppressions need a reason.** The handful of disabled rules in `eslint.config.mjs` and
  `pyproject.toml` each carry a comment explaining why. A new `# noqa` or `eslint-disable`
  should do the same — `RUF100` will flag it if it later becomes stale.
- **Don't document what isn't wired.** The repo has been through a claims audit; if you add a
  config knob to a README, make sure something reads it.

## Reporting a bug

Open an issue with what you did, what you expected, and what happened — plus the browser and
Node/Python versions if it's environment-specific. A failing test case is the most useful
thing you can attach.
