/**
 * Stamps a static HTML file per route into the build output, so that a social
 * crawler sees the card belonging to the route it was handed.
 *
 * Why this exists rather than a `Meta` call in a route guard: the site is
 * client-rendered, and `vercel.json` rewrites every unmatched path to
 * `/index.html`. Slack, LinkedIn and iMessage do not execute JavaScript, so a
 * `<title>` set by the Angular router — or a description set through Angular's
 * `Meta` service — is invisible to all three. Pasting `/dashboard` into a
 * channel would render the home page's card, describing the wrong page over a
 * link to the right one. Setting those tags at runtime would satisfy a reader
 * of the source and nobody else, which is the failure this repo exists to
 * argue against.
 *
 * So each route gets a real file. `dashboard/index.html` is byte-identical to
 * `index.html` — same hashed bundles, same everything — except for the block
 * between the ROUTE-META markers. Vercel resolves it off the filesystem before
 * the SPA rewrite is consulted, and `vercel.json` names the mapping explicitly
 * so the behaviour does not rest on that ordering. Angular boots from it
 * exactly as it boots from the root document: `<base href="/">` keeps the
 * relative bundle URLs resolving against the origin, and the router sees the
 * same path it would have seen anyway.
 *
 * The home page is rewritten from `src/route-meta.json` too, rather than
 * trusted from whatever `src/index.html` happened to say, so there is one
 * authority for all four cards instead of one authority and one copy.
 *
 * Runs from `npm run build`, after `ng build`. A bare `ng build` skips it and
 * silently ships four identical cards.
 *
 * Usage: node scripts/emit-route-meta.mjs [--dist <dir>]
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Read `--name value` from argv, or fall back. Mirrors scripts/serve-dist.mjs. */
function readFlag(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

const distDir = path.resolve(repoRoot, readFlag('dist', 'dist/ethereal-hotel/browser'));

const START = '<!-- ROUTE-META:START -->';
const END = '<!-- ROUTE-META:END -->';

/**
 * Escape a value for use inside a double-quoted HTML attribute.
 *
 * The descriptions are prose from `route-meta.json` and prose acquires
 * punctuation. An unescaped `"` would close the attribute early and hand a
 * crawler a truncated description plus whatever the remainder parsed as.
 */
function attr(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The replacement block, markers included so the result stays re-stampable. */
function metaBlock({ title, description, url }) {
  return [
    START,
    `<title>${attr(title)}</title>`,
    `<meta name="description" content="${attr(description)}">`,
    `<link rel="canonical" href="${attr(url)}">`,
    `<meta property="og:url" content="${attr(url)}">`,
    `<meta property="og:title" content="${attr(title)}">`,
    `<meta property="og:description" content="${attr(description)}">`,
    `<meta name="twitter:title" content="${attr(title)}">`,
    `<meta name="twitter:description" content="${attr(description)}">`,
    END,
  ].join('');
}

const meta = JSON.parse(await readFile(path.join(repoRoot, 'src', 'route-meta.json'), 'utf8'));
const indexPath = path.join(distDir, 'index.html');

let template;
try {
  template = await readFile(indexPath, 'utf8');
} catch {
  process.stderr.write(`No build found at ${indexPath}.\nRun \`ng build\` first.\n`);
  process.exit(1);
}

// Failing here beats carrying on: a silent no-op ships three extra files that
// all claim to be the home page, which is a worse bug than the one this script
// was written to fix, and an invisible one until a link is already public.
const start = template.indexOf(START);
const end = template.indexOf(END);
if (start === -1 || end === -1) {
  process.stderr.write(
    `Could not find the ROUTE-META markers in ${indexPath}.\n` +
      `They are written in src/index.html; if the build has started stripping HTML\n` +
      `comments, this script needs a different anchor.\n`
  );
  process.exit(1);
}

const before = template.slice(0, start);
const after = template.slice(end + END.length);

for (const route of Object.values(meta.routes)) {
  const url = `${meta.siteUrl}/${route.path}`;
  const html = before + metaBlock({ ...route, url }) + after;

  // Home writes back over the root document; every other route gets a
  // directory with an index, which is the shape both Vercel and
  // scripts/serve-dist.mjs resolve for an extensionless URL.
  const outPath = route.path ? path.join(distDir, route.path, 'index.html') : indexPath;

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, html);
  process.stdout.write(`wrote ${path.relative(repoRoot, outPath)}\n`);
}
