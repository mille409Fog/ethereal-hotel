# EtherealHotel

[![Code Quality](https://github.com/mille409Fog/ethereal-hotel/actions/workflows/code-quality.yml/badge.svg)](https://github.com/mille409Fog/ethereal-hotel/actions/workflows/code-quality.yml)

**Live demo:** https://ethereal-hotel-pink.vercel.app/

A professional portfolio and real-time dashboard application built with Angular 22, showcasing modern development practices and enterprise-grade code quality standards.

## 🌟 Features

- **Real-Time Dashboard**: Live data visualization with RxJS observables and Chart.js
- **Responsive Design**: Mobile-first approach with smooth animations
- **Accessible**: WCAG 2.1 AA, verified in CI by axe — see [Accessibility](#-accessibility)
- **Code Quality**: Automated linting, formatting, and pre-commit hooks
- **CI/CD Pipeline**: GitHub Actions for automated testing and deployment
- **Modern Stack**: Angular 22 with TypeScript 6.0

## 🚀 Quick Start

### Prerequisites

- Node.js (v20+)
- npm (v11+)
- Python 3.9+ (for backend)

### Installation

#### Frontend Setup

```bash
# Clone the repository
git clone <repository-url>
cd ethereal-hotel

# Install dependencies
npm install

# Start development server
npm start
```

Navigate to `http://localhost:4200/` to view the application.

#### Backend Setup

```bash
# Navigate to backend directory
cd backend

# Run the setup and start script (Windows)
run.bat

# Or manually:
# Create virtual environment
python -m venv venv

# Activate virtual environment (Windows)
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start backend server
python main.py
```

Backend will be available at:
- REST API: `http://localhost:8000`
- WebSocket: `ws://localhost:8000/ws`
- API Docs: `http://localhost:8000/docs`

## 📜 Available Scripts

### Development
```bash
# Start development server
npm start

# Build for production
npm run build

# Watch mode for development
npm run watch
```

### Testing
```bash
# Run unit tests with Vitest, printing a coverage summary.
# Fails if coverage drops below the thresholds in angular.json.
npm test

# Build, serve dist/, and run the accessibility suite against it:
# an axe scan of / and /dashboard, plus keyboard and reduced-motion checks.
# Needs `npx playwright install --only-shell chromium` once.
npm run a11y
```

### Code Quality
```bash
# Run ESLint (--max-warnings 0: a single new warning fails the command)
npm run lint

# Fix ESLint issues automatically
npm run lint:fix

# Format code with Prettier
npm run format

# Check code formatting
npm run format:check

# Run all frontend quality checks
npm run code-quality
```

The backend has the same three gates, run through the same npm entry points so
you don't have to remember two sets of commands:

```bash
# Ruff — lint (--fix to auto-fix) and format, replacing black/isort/flake8
npm run lint:py
npm run lint:py:fix
npm run format:py
npm run format:py:check

# Mypy in strict mode
npm run typecheck:py

# All three at once
npm run code-quality:py
```

These wrap `ruff` and `mypy` from `backend/venv` via `scripts/py-tool.mjs`, so
they work whether or not you have the virtualenv activated. Both tools read
their configuration from `pyproject.toml` at the repo root.

## 🛠️ Tech Stack

### Frontend
- **Framework**: Angular 22
- **Language**: TypeScript 6.0
- **State Management**: RxJS 7.8
- **Charts**: Chart.js 4.5
- **Build Tool**: Angular CLI 22
- **Testing**: Vitest 4.0
- **Code Quality**: ESLint + Prettier + Husky
- **CI/CD**: GitHub Actions

### Backend
- **Framework**: FastAPI 0.115
- **Language**: Python 3.9+
- **Server**: Uvicorn (ASGI)
- **Validation**: Pydantic 2.9
- **Real-time**: WebSockets
- **API Docs**: Auto-generated (Swagger/ReDoc)
- **Code Quality**: Ruff (lint + format) + mypy (strict)

## 📋 Code Quality Standards

This project implements professional code quality tools and practices:

Both languages are gated, not just the TypeScript half:

- ✅ **ESLint**: Strict TypeScript and Angular linting rules, enforced at zero warnings
- ✅ **Prettier**: Consistent code formatting
- ✅ **Ruff**: Python linting *and* formatting, enforced at zero errors
- ✅ **Mypy**: Python type checking in strict mode
- ✅ **axe**: Accessibility scan of both routes in CI, blocking on serious and critical findings
- ✅ **Vitest**: Unit tests with coverage thresholds that fail the build when they regress
- ✅ **Pytest**: 18 backend tests against an isolated, deterministically seeded database
- ✅ **Husky**: Git hooks for pre-commit validation
- ✅ **Lint-staged**: Automatic formatting of staged files, TypeScript and Python alike
- ✅ **Commitlint**: Conventional commit message validation
- ✅ **Dependabot**: Weekly grouped updates for pip, npm and GitHub Actions
- ✅ **CI/CD Pipeline**: Automated testing and builds

## ♿ Accessibility

Accessibility is enforced here rather than asserted. The
`@angular-eslint/template` accessibility rule set runs at **error** severity, and every commit is
scanned by **axe** against the production build on both `/` and `/dashboard` — the CI job fails on
any serious or critical finding, and both routes currently report **zero violations at every
severity**. Alongside the scan, Playwright checks the things axe cannot: that the first Tab reaches
a skip link, that the nav is traversable and moves focus to the section it targets, and that under
`prefers-reduced-motion` the animations stop and no content stays stranded behind a fade-in.

Two decisions worth naming, because both went against the obvious version:

- **The metrics grid is deliberately not an `aria-live` region.** The socket pushes a snapshot every
  two seconds; announcing six cards at that cadence produces speech a listener can never get ahead
  of, which is worse than silence, not better. Instead one throttled `role="status"` region speaks a
  plain-language digest at most every 30 seconds ("Occupancy 85.0 percent. 51 of 60 sellable rooms
  occupied…"), and a second announces backend connect/disconnect transitions — so a screen reader
  user learns when the figures stop being real.
- **The brand red is now two tokens.** `--color-blood` (`#9d2235`) reached only ~2:1 as text on this
  background. It stays for borders, fills and glows; `--color-blood-text` carries anything anyone
  has to read, and the focus ring moved to it as well, since a 2:1 focus indicator fails
  WCAG 1.4.11 and is genuinely hard to find on a dark theme.

### Git Commit Convention

This project follows [Conventional Commits](https://www.conventionalcommits.org/):

```bash
# Examples
git commit -m "feat: add user authentication"
git commit -m "fix: resolve dashboard loading issue"
git commit -m "docs: update README"
```

**Commit Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, `build`, `revert`

### Coding Standards

Enforced by ESLint (`eslint.config.mjs`) and Prettier (`.prettierrc`). `npm run lint` runs with
`--max-warnings 0`, so every rule below is a build failure, not a suggestion:

- **TypeScript**: no `any`, explicit return types and accessibility modifiers, prefer `const`,
  max function complexity 10 / length 100 lines.
- **Angular**: `app-` selector prefix, lifecycle interfaces, OnPush change detection,
  `trackBy` in `*ngFor`.
- **Templates**: `[(ngModel)]` banana-in-box syntax, async pipe for observables, no duplicate attributes.
- **General**: no `console.log` (use `console.warn`/`console.error`), no `debugger`, strict equality
  (`===`), always use curly braces, prefer arrow functions and template literals.

Two rules are deliberately **off**, each with a comment in `eslint.config.mjs` explaining why:
`@angular-eslint/component-class-suffix` (the Angular style guide dropped the mandatory `Component`
suffix) and `@angular-eslint/template/no-call-expression` (it predates signals, and a signal read is
a memoized call expression).

#### Python

Enforced by Ruff and mypy, both configured in `pyproject.toml` at the repo root. CI runs
`ruff check`, `ruff format --check` and `mypy` on every push, so these are build failures too:

- **Ruff lint**: pyflakes, pycodestyle, isort, pep8-naming, pyupgrade, bugbear, blind-except,
  comprehensions, simplify and tidy-imports. `RUF100` is on, so a stale `# noqa` is itself an error.
- **Ruff format**: 88-column Black-compatible formatting. `.editorconfig` matches it.
- **Mypy**: `strict = true` plus `warn_unreachable`. Every function in `backend/` is annotated —
  the metrics payloads are `TypedDict`s, so a typo in a metric key fails the type check rather than
  reaching the frontend as a missing field.

Four exceptions are configured, each with a comment in `pyproject.toml` giving the reason rather
than being switched off silently:

| Rule | Where | Why |
| --- | --- | --- |
| `B008` | FastAPI `Depends`/`Query` | Calling them in argument defaults *is* the DI syntax |
| `N815` | `schemas.py` | camelCase fields are the wire contract the Angular `IMetrics` consumes |
| `N818` | `services/bookings.py` | `ReferenceNotFound` reads better than `ReferenceNotFoundError`; the base class carries the suffix |
| formatting | `**/*.md` | Ruff formats Python blocks inside Markdown; the ```python blocks in these docs are illustrative payload shapes, not code |

### Test Coverage

`npm test` reports coverage and fails below the thresholds set in `angular.json` under
`test.options.coverageThresholds`. They start at today's numbers so the build ratchets upward
rather than blocking work:

| Metric | Threshold |
| --- | --- |
| Statements | 90% |
| Branches | 88% |
| Functions | 74% |
| Lines | 90% |

When new tests push the real numbers up, raise the thresholds to match.

## 🏗️ Project Structure

```
ethereal-hotel/
├── src/
│   ├── app/
│   │   ├── dashboard/        # Real-time dashboard feature
│   │   ├── booking/          # Projects showcase
│   │   ├── crm/             # Experience section
│   │   ├── concierge/       # Skills section
│   │   ├── resume/          # Resume section
│   │   ├── directives/      # Reusable directives
│   │   ├── services/        # Shared services
│   │   └── ...
│   └── ...
├── backend/
│   ├── main.py                  # FastAPI application
│   ├── requirements.txt         # Runtime Python dependencies
│   ├── requirements-dev.txt     # Tests + ruff/mypy
│   ├── run.bat                  # Windows startup script
│   └── README.md                # Backend documentation
├── scripts/
│   └── py-tool.mjs              # Resolves ruff/mypy for npm + lint-staged
├── .github/
│   ├── workflows/               # CI/CD pipelines
│   └── dependabot.yml           # pip + npm + github-actions updates
├── .husky/                      # Git hooks
├── pyproject.toml               # Ruff + mypy configuration
├── ARCHITECTURE.md              # System architecture & data flow
└── ...
```

## 🔍 Key Features Demonstrated

### 1. Real-Time Data Handling
- RxJS observables for reactive programming
- Automatic memory management with takeUntil pattern
- Live metric updates every 2 seconds

### 2. Modern Angular Patterns
- Standalone components (Angular 22)
- Lazy loading with route-based code splitting
- OnPush change detection strategy (lint-enforced on every component)

### 3. Professional Development Workflow
- Pre-commit hooks prevent broken code
- Automated CI/CD pipeline
- Conventional commit messages
- Comprehensive linting rules

### 4. Code Organization
- Feature-based folder structure
- Reusable components and directives
- Separation of concerns
- TypeScript strict mode

## 🧪 Testing

This project uses Vitest for fast, modern unit testing:

```bash
npm test
```

## ⚙️ Configuration

### Frontend (Angular environments)

The API base URLs are **not hardcoded**. They live in Angular environment files:

- `src/environments/environment.ts` — development (defaults to `http://localhost:8000`).
- `src/environments/environment.prod.ts` — production (your deployed backend URL).

`angular.json` swaps `environment.ts` for `environment.prod.ts` on production builds
(`fileReplacements`). To point the deployed frontend at your backend, edit
`environment.prod.ts` and set `apiUrl`, `wsUrl`, and `healthUrl` to your backend origin,
then rebuild/redeploy. Until a backend is live, the dashboard falls back to
`src/app/services/offline-dashboard.fixture.json` — a committed snapshot of a real seeded
database, not generated numbers — and labels itself "simulated data" in the header.

### Backend (CORS origins)

Allowed CORS origins are read from the `ALLOWED_ORIGINS` env var (comma-separated). When
unset, it defaults to the local dev servers. In production, set it to your frontend origin:

```bash
export ALLOWED_ORIGINS="https://ethereal-hotel-pink.vercel.app"
```

## 🚢 Deployment

- **Frontend** → Vercel (live at https://ethereal-hotel-pink.vercel.app/).
  Build command `npm run build`, output directory `dist/ethereal-hotel/browser`.
- **Backend** → Fly.io / Render using `backend/Dockerfile`. Set `ALLOWED_ORIGINS`
  to the Vercel origin so the browser can call the API.

### Build for Production

```bash
npm run build
```

The build artifacts will be stored in the `dist/` directory, optimized for production deployment.

## 👨‍💻 Development

### VS Code Setup

Recommended extensions (defined in `.vscode/extensions.json`):
- Angular Language Service
- ESLint
- Prettier
- EditorConfig
- Ruff (Python lint + format, same config as CI)
- Pylance (`pyrightconfig.json` resolves the backend's imports and venv)

The project includes VS Code settings for automatic formatting and linting on save.

### Pre-commit Hooks

When you commit code, Husky runs lint-staged over the staged files only:

1. `.ts` / `.html` → ESLint `--fix`, then Prettier
2. `.css` / `.scss` / `.json` → Prettier
3. `.py` → `ruff check --fix`, then `ruff format`
4. The commit message is validated against Conventional Commits

Anything auto-fixable is fixed and re-staged, so badly formatted code cannot land. Anything
that *isn't* auto-fixable — an undefined name, a bare `except`, an ESLint error — fails the
hook and blocks the commit until it's resolved.

The Python steps need `ruff`, which `scripts/py-tool.mjs` looks for in `backend/venv`, then in
an activated `$VIRTUAL_ENV`, then on `PATH`. If it isn't found the hook says so and points at
`backend/requirements-dev.txt` rather than failing with "command not found".

## 📚 Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
