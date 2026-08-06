# Code Quality Standards

This document outlines the code quality tools and standards used in the Ethereal Hotel project.

## Tools

### ESLint
- **Purpose**: Static code analysis for TypeScript and Angular
- **Configuration**: `eslint.config.mjs`
- **Rules**: Strict TypeScript and Angular-specific rules

### Prettier
- **Purpose**: Code formatting
- **Configuration**: `.prettierrc`
- **Standards**: Consistent code style across the project

### Husky
- **Purpose**: Git hooks automation
- **Configuration**: `.husky/` directory
- **Hooks**: Pre-commit checks

### Lint-staged
- **Purpose**: Run linters on staged files only
- **Configuration**: `package.json` (lint-staged section)

## Available Scripts

### Linting
```bash
# Run ESLint on all files
npm run lint

# Run ESLint and auto-fix issues
npm run lint:fix
```

### Formatting
```bash
# Format all files
npm run format

# Check if files are formatted correctly
npm run format:check
```

### Combined Quality Check
```bash
# Run all code quality checks
npm run code-quality
```

### Pre-commit Hook
The pre-commit hook automatically runs on every commit and:
1. Formats staged files with Prettier
2. Lints staged files with ESLint
3. Auto-fixes issues when possible

If there are errors that can't be auto-fixed, the commit will be blocked.

## Code Standards

### TypeScript
- ✅ No `any` types (use proper typing)
- ✅ Explicit return types on functions
- ✅ Explicit accessibility modifiers on class members
- ✅ Interface naming convention: prefix with `I` (e.g., `IUser`)
- ✅ Use `const` over `let` when possible
- ✅ Maximum function complexity: 10
- ✅ Maximum function length: 100 lines

### Angular
- ✅ Component selector prefix: `app-`
- ✅ Use lifecycle interfaces (OnInit, OnDestroy, etc.)
- ✅ Prefer OnPush change detection strategy
- ✅ No empty lifecycle methods
- ✅ Use `trackBy` functions in `*ngFor`
- ✅ No method calls in templates (use getters or variables)

### HTML Templates
- ✅ Banana-in-box syntax: `[(ngModel)]` not `([ngModel])`
- ✅ Use async pipe for observables
- ✅ Maximum template complexity: 3
- ✅ No duplicate attributes

### General
- ✅ No `console.log` (use `console.warn` or `console.error`)
- ✅ No `debugger` statements
- ✅ Use strict equality (`===` not `==`)
- ✅ Always use curly braces for control statements
- ✅ Prefer arrow functions
- ✅ Use template literals over string concatenation

## Continuous Integration

GitHub Actions automatically runs code quality checks on:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop` branches

The CI pipeline:
1. Checks code formatting with Prettier
2. Runs ESLint
3. Executes tests
4. Builds the application

## IDE Setup

### VS Code
Install these extensions for the best experience:
- ESLint (dbaeumer.vscode-eslint)
- Prettier (esbenp.prettier-vscode)
- Angular Language Service (Angular.ng-template)

### Settings
Add to `.vscode/settings.json`:
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

## Troubleshooting

### ESLint errors after pulling changes
```bash
npm install
```

### Pre-commit hook not running
```bash
npm run prepare
```

### Format all files to match standards
```bash
npm run format
npm run lint:fix
```

## Contributing

Before submitting a PR:
1. Run `npm run code-quality` to ensure all checks pass
2. Fix any linting or formatting issues
3. Ensure all tests pass with `npm test`
4. Verify the build succeeds with `npm run build`
