# EtherealHotel

[![Code Quality](https://github.com/yourusername/ethereal-hotel/actions/workflows/code-quality.yml/badge.svg)](https://github.com/yourusername/ethereal-hotel/actions/workflows/code-quality.yml)

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
# Run unit tests with Vitest
npm test
```

### Code Quality
```bash
# Run ESLint
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

- ✅ **ESLint**: Strict TypeScript and Angular linting rules
- ✅ **Prettier**: Consistent code formatting
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

For detailed information, see [CODE_QUALITY.md](./CODE_QUALITY.md).

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
├── CODE_QUALITY.md         # Code quality guide
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
- OnPush change detection strategy (recommended)

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

## 🚢 Deployment

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
