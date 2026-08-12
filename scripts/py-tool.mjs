// Run a Python dev tool (ruff, mypy, pytest, pip-audit) from npm scripts and
// lint-staged.
//
//     node scripts/py-tool.mjs ruff check backend/
//     node scripts/py-tool.mjs mypy backend/
//
// Unlike eslint/prettier these aren't in node_modules. They normally live in
// backend/venv, which lint-staged has no way to find and which isn't on PATH
// unless the developer happens to have activated it. This resolves the tool in
// the order that is true most often, then falls back to PATH:
//
//   1. backend/venv        — the repo's own environment (see backend/README.md)
//   2. $VIRTUAL_ENV        — some other venv the developer has activated
//   3. PATH                — a global install (pipx, uv tool, Homebrew, ...)
//
// If none of those hit, exit with a message that names the fix rather than the
// bare "command not found" the shell would produce.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const [tool, ...args] = process.argv.slice(2);
if (!tool) {
  console.error('usage: node scripts/py-tool.mjs <ruff|mypy|pytest|pip-audit> [args...]');
  process.exit(2);
}

// Windows venvs use Scripts/ and an .exe suffix; POSIX venvs use bin/.
const isWindows = process.platform === 'win32';
const binDir = isWindows ? 'Scripts' : 'bin';
const exe = isWindows ? `${tool}.exe` : tool;

const candidates = [
  path.join(repoRoot, 'backend', 'venv', binDir, exe),
  process.env.VIRTUAL_ENV && path.join(process.env.VIRTUAL_ENV, binDir, exe),
].filter(Boolean);

const resolved = candidates.find((candidate) => existsSync(candidate)) ?? tool;

const result = spawnSync(resolved, args, {
  stdio: 'inherit',
  cwd: repoRoot, // both tools read their config from pyproject.toml at the root
});

if (result.error?.code === 'ENOENT') {
  console.error(
    `\n${tool} was not found.\n\n` +
      'Install the backend development dependencies to get it:\n\n' +
      '    cd backend && pip install -r requirements-dev.txt\n',
  );
  process.exit(1);
}

process.exit(result.status ?? 1);
