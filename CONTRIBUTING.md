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

Run the same gates CI does. All four must pass:

```bash
npm run code-quality      # Prettier + ESLint (--max-warnings 0)
npm test                  # Vitest + coverage thresholds
npm run code-quality:py   # ruff format --check, ruff check, mypy --strict
npm run test:backend      # pytest
```

`npm run e2e` additionally builds and runs the Playwright suite (smoke + accessibility). It
needs a browser once: `npx playwright install --only-shell chromium`.

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
