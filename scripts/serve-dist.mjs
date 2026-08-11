/**
 * Minimal static server for the production build, used by the Playwright
 * accessibility run (see `playwright.config.ts`).
 *
 * Deliberately dependency-free rather than pulling in `serve`/`http-server`:
 * the only two things this needs beyond `fs` are a correct `Content-Type` and
 * an SPA fallback, and the fallback is not optional — `/dashboard` is a client
 * route with no file behind it, so a naive static server answers 404 and the
 * scan would silently audit an error page instead of the dashboard.
 *
 * Usage: node scripts/serve-dist.mjs [--root <dir>] [--port <port>]
 */
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

function readFlag(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

const root = resolve(readFlag('root', 'dist/ethereal-hotel/browser'));
const port = Number(readFlag('port', '4173'));

// Fail loudly here rather than serving 404s. Playwright would otherwise report
// only "timed out waiting for the web server", which sends you looking at the
// wrong thing entirely.
if (!existsSync(root)) {
  process.stderr.write(`No build found at ${root}.\nRun \`npm run build\` first.\n`);
  process.exit(1);
}

/** Resolve a URL path to a file inside `root`, or null if it escapes or is missing. */
async function resolveFile(urlPath) {
  // normalize() collapses `..` before the prefix check, so `/../../etc/passwd`
  // cannot walk out of the build directory.
  const candidate = join(root, normalize(decodeURIComponent(urlPath)));
  if (candidate !== root && !candidate.startsWith(root + sep)) {
    return null;
  }

  try {
    const stats = await stat(candidate);
    return stats.isDirectory() ? null : candidate;
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  const urlPath = new URL(req.url ?? '/', 'http://localhost').pathname;

  // Any path without a file behind it is a client route: hand back index.html
  // and let the Angular router sort it out.
  const file = (await resolveFile(urlPath)) ?? (await resolveFile('/index.html'));

  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Not found. Is ${root} built?`);
    return;
  }

  res.writeHead(200, { 'Content-Type': MIME_TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});

server.listen(port, () => {
  process.stdout.write(`Serving ${root} on http://localhost:${port}\n`);
});
