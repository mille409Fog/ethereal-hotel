# EtherealHotel

[![Code Quality](https://github.com/mille409Fog/ethereal-hotel/actions/workflows/code-quality.yml/badge.svg)](https://github.com/mille409Fog/ethereal-hotel/actions/workflows/code-quality.yml)

**Live demo:** https://ethereal-hotel-pink.vercel.app/

A professional portfolio and real-time dashboard application built with Angular 22, showcasing modern development practices and enterprise-grade code quality standards.

## 🌟 Features

- **Real-Time Dashboard**: Live data visualization with RxJS observables and Chart.js
- **Responsive Design**: Mobile-first approach with smooth animations
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

# Run all quality checks
npm run code-quality
```

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

## 📋 Code Quality Standards

This project implements professional code quality tools and practices:

- ✅ **ESLint**: Strict TypeScript and Angular linting rules, enforced at zero warnings
- ✅ **Prettier**: Consistent code formatting
- ✅ **Vitest**: Unit tests with coverage thresholds that fail the build when they regress
- ✅ **Husky**: Git hooks for pre-commit validation
- ✅ **Lint-staged**: Automatic formatting of staged files
- ✅ **Commitlint**: Conventional commit message validation
- ✅ **CI/CD Pipeline**: Automated testing and builds

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

### Test Coverage

`npm test` reports coverage and fails below the thresholds set in `angular.json` under
`test.options.coverageThresholds`. They start at today's numbers so the build ratchets upward
rather than blocking work:

| Metric | Threshold |
| --- | --- |
| Statements | 64% |
| Branches | 75% |
| Functions | 52% |
| Lines | 62% |

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
│   ├── main.py              # FastAPI application
│   ├── requirements.txt     # Python dependencies
│   ├── run.bat             # Windows startup script
│   └── README.md           # Backend documentation
├── .github/
│   └── workflows/           # CI/CD pipelines
├── .husky/                  # Git hooks
├── ARCHITECTURE.md         # System architecture & data flow
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

The project includes VS Code settings for automatic formatting and linting on save.

### Pre-commit Hooks

When you commit code, Husky automatically:
1. Formats staged files with Prettier
2. Runs ESLint and fixes auto-fixable issues
3. Validates commit message format

If issues are found, the commit will be blocked until they're resolved.

## 📚 Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
