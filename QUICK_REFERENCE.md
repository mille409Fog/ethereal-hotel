# Code Quality Quick Reference Card

## 🚀 Essential Commands

```bash
# Development
npm start                    # Start dev server
npm run build               # Build for production
npm test                    # Run tests

# Code Quality
npm run lint                # Check code quality
npm run lint:fix            # Auto-fix issues
npm run format              # Format all files
npm run format:check        # Check formatting
npm run code-quality        # Run all checks

# Git Workflow
git add .
git commit -m "feat: description"   # Auto-runs pre-commit hook
git push
```

## 📋 Commit Message Format

**Pattern**: `type(scope): subject`

**Types**: `feat` | `fix` | `docs` | `style` | `refactor` | `perf` | `test` | `chore` | `ci` | `build` | `revert`

**Examples**:
```bash
✅ git commit -m "feat: add user authentication"
✅ git commit -m "fix: resolve dashboard loading issue"
✅ git commit -m "docs: update README with examples"
✅ git commit -m "refactor: simplify chart rendering logic"
✅ git commit -m "test: add unit tests for dashboard"
```

## 🔧 Troubleshooting

### Pre-commit Hook Fails
```bash
npm run lint:fix    # Fix linting issues
npm run format      # Format files
git add .           # Re-stage fixed files
git commit -m "..."  # Try again
```

### Husky Not Running
```bash
npm run prepare     # Reinitialize Husky
```

### VS Code Not Auto-formatting
1. Install "Prettier" extension
2. Reload VS Code
3. Verify `.vscode/settings.json` exists

## 📁 Key Files

- `eslint.config.mjs` - Linting rules
- `.prettierrc` - Formatting rules
- `commitlint.config.mjs` - Commit rules
- `.husky/` - Git hooks
- `CODE_QUALITY.md` - Full documentation

## ✅ Pre-PR Checklist

- [ ] `npm run code-quality` passes
- [ ] `npm test` passes
- [ ] `npm run build` succeeds
- [ ] Commit messages follow convention
- [ ] Code is formatted and linted

## 🎯 Current Status

✅ ESLint: 0 errors, 46 warnings (non-blocking)
✅ Prettier: All files formatted
✅ Build: Successful
✅ Tests: Configured (Vitest)
✅ CI/CD: GitHub Actions configured

---

**Keep this file handy for quick reference!**
