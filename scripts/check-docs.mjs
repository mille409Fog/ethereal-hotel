// Keep CLAUDE.md's factual claims from drifting away from the repository.
//
//     npm run check:docs
//
// CLAUDE.md exists so an agent arriving cold can orient in one file instead of
// reading ~100KB of Markdown. That only works while the file is true, and an
// orientation document is the single worst place for a stale fact: it is read
// first, trusted most, and re-checked never. The rest of this repo does not
// leave that to memory — `backend/tests/test_dependency_pins.py` fails when the
// two dependency lists drift — so neither does this.
//
// The rule for what belongs here: **only falsifiable claims**. Prose about why
// the dashboard degrades honestly cannot be checked by a script and should not
// be. A path, a version pin, a port, a count, or a quoted config value can be,
// and each one below is read from the repository and compared against what
// CLAUDE.md says about it. Where possible CLAUDE.md is the *source* of the
// expected value — parsed out of the document rather than duplicated here — so
// that editing the document is what updates the check.
//
// If this fails, exactly one of two things is true: the code moved and the
// document needs updating, or the document was wrong to begin with. Both are
// worth knowing, which is why this exits non-zero rather than warning.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFileSync(path.join(repoRoot, relative), 'utf8');
const exists = (relative) => existsSync(path.join(repoRoot, relative));

const CLAUDE_MD = read('CLAUDE.md');

/** Every check is `[name, () => string[]]`, returning one message per problem. */
const checks = [];
const check = (name, fn) => checks.push([name, fn]);

// ---------------------------------------------------------------------------

// Paths CLAUDE.md sends the reader to. A doc map whose entries 404 is worse
// than no doc map, because the reader spends their time discovering that.
check('files CLAUDE.md points at still exist', () => {
  const referenced = [
    'ROADMAP.md',
    'README.md',
    'ARCHITECTURE.md',
    'AUBADE.md',
    'CONTRIBUTING.md',
    'backend/README.md',
    'api/index.py',
    'backend/main.py',
    'src/environments/environment.prod.ts',
    'scripts/py-tool.mjs',
    'scripts/emit-route-meta.mjs',
    'e2e/support/backend.ts',
    '.gitattributes',
    '.github/workflows/code-quality.yml',
    'backend/requirements.txt',
    'backend/tests/test_dependency_pins.py',
    'pyproject.toml',
    'eslint.config.mjs',
    'angular.json',
    'src/app/app.routes.ts',
  ];
  return referenced
    .filter((file) => !exists(file))
    .map((file) => `CLAUDE.md references ${file}, which no longer exists.`);
});

// Things CLAUDE.md asserts are *absent*. Both have bitten this repo before: a
// root requirements.txt silently overrides the interpreter pin on Vercel, and
// AUBADE.md is a spec for a project that has not been started.
check('claimed-absent paths are still absent', () => {
  const problems = [];
  if (exists('requirements.txt')) {
    problems.push(
      'A root requirements.txt exists. CLAUDE.md and test_dependency_pins.py both say ' +
        'there must not be one — it overrides requires-python on Vercel and pins the ' +
        'build to 3.14, where pydantic-core has no wheel.'
    );
  }
  if (exists('src/aubade') && CLAUDE_MD.includes('no `src/aubade/` exists yet')) {
    problems.push(
      'src/aubade/ now exists, but CLAUDE.md still says it does not. Update the ' +
        'AUBADE.md row of the doc map — the project has been started.'
    );
  }
  return problems;
});

// The sizes in the doc map are how a reader decides what to open. A generous
// tolerance keeps ordinary edits from failing the build while still catching a
// document that has doubled or been gutted.
check('doc-map sizes are within 25% of actual', () => {
  const rows = [...CLAUDE_MD.matchAll(/^\|\s*`([^`]+\.md)`\s*\|\s*(\d+)K\s*\|/gm)];
  if (rows.length === 0) {
    return ['Could not find the doc-map table in CLAUDE.md. Did its format change?'];
  }
  return rows.flatMap(([, file, statedK]) => {
    if (!exists(file)) return []; // reported by the existence check above
    const actualK = read(file).length / 1024;
    const stated = Number(statedK);
    const drift = Math.abs(actualK - stated) / stated;
    return drift <= 0.25
      ? []
      : [
          `CLAUDE.md lists ${file} as ${stated}K; it is now ${actualK.toFixed(0)}K. ` +
            `Update the size, and re-read the row while you are there — a document ` +
            `that changed that much probably changed what it is good for.`,
        ];
  });
});

// CLAUDE.md states this count and tells the reader the other docs get it wrong.
// It would be an unusually poor joke for this file to join them.
check('the backend test count CLAUDE.md states is correct', () => {
  const stated = CLAUDE_MD.match(/There are (\d+) test functions/);
  if (!stated) return ['CLAUDE.md no longer states a backend test count. Remove this check.'];

  const testsDir = path.join(repoRoot, 'backend', 'tests');
  const actual = readdirSync(testsDir)
    .filter((file) => file.startsWith('test_') && file.endsWith('.py'))
    .reduce(
      (total, file) =>
        total +
        (read(path.join('backend', 'tests', file)).match(/^(?:async )?def test_/gm) ?? []).length,
      0
    );

  return Number(stated[1]) === actual
    ? []
    : [
        `CLAUDE.md says there are ${stated[1]} backend test functions; there are ${actual}. ` +
          `Update the number, or drop the sentence — CLAUDE.md already advises against ` +
          `restating it.`,
      ];
});

// Version pins, ports and config values quoted in CLAUDE.md as load-bearing.
check('quoted config values still match the files they came from', () => {
  const problems = [];
  const expect = (condition, message) => {
    if (!condition) problems.push(message);
  };

  expect(
    read('.nvmrc').trim() === '22.22.3',
    `CLAUDE.md says .nvmrc pins 22.22.3; it pins ${read('.nvmrc').trim()}.`
  );
  expect(
    read('.python-version').trim() === '3.12',
    `CLAUDE.md says the Vercel function runs 3.12; .python-version says ${read('.python-version').trim()}.`
  );

  const ci = read('.github/workflows/code-quality.yml');
  expect(
    ci.includes("'3.11'") && ci.includes("'3.12'"),
    'CLAUDE.md says the CI matrix runs Python 3.11 and 3.12; code-quality.yml no longer does both.'
  );

  expect(
    /wsUrl:\s*null/.test(read('src/environments/environment.prod.ts')),
    'CLAUDE.md says wsUrl is null in production (the instruction to poll); it no longer is.'
  );

  expect(
    /^\*\s+text=auto\s+eol=lf$/m.test(read('.gitattributes')),
    'CLAUDE.md bases its CRLF warning on `* text=auto eol=lf` in .gitattributes, which is gone.'
  );

  expect(
    read('playwright.config.ts').includes('4173'),
    'CLAUDE.md lists 4173 as the Playwright static-server port; playwright.config.ts disagrees.'
  );

  // The paths themselves moved to src/route-meta.json, which app.routes.ts and
  // scripts/emit-route-meta.mjs both read; assert against that, and that the
  // router still wires each one up.
  const routes = read('src/app/app.routes.ts');
  const routeMeta = JSON.parse(read('src/route-meta.json'));
  for (const route of ['dashboard', 'booking']) {
    expect(
      routeMeta.routes[route]?.path === route,
      `CLAUDE.md calls /${route} one of the two routes carrying the technical argument; ` +
        `src/route-meta.json no longer defines it.`
    );
    expect(
      routes.includes(`meta.${route}.path`),
      `CLAUDE.md calls /${route} one of the two routes carrying the technical argument; ` +
        `it is no longer registered in app.routes.ts.`
    );
  }

  const scripts = JSON.parse(read('package.json')).scripts;
  for (const gate of ['code-quality', 'test', 'code-quality:py', 'test:backend', 'e2e']) {
    expect(
      gate in scripts,
      `CLAUDE.md documents \`npm run ${gate}\` as a gate; package.json has no such script.`
    );
  }

  expect(
    scripts.build.includes('emit-route-meta'),
    'CLAUDE.md warns that bare `ng build` drops the per-route social cards, on the basis ' +
      'that `npm run build` chains scripts/emit-route-meta.mjs. It no longer does.'
  );
  // The a11y run serves the build directory directly, so a build that skipped
  // the stamping would scan pages the deployment does not serve.
  for (const script of ['e2e', 'a11y']) {
    expect(
      !/(^|&&\s*)ng build/.test(scripts[script]),
      `package.json's \`${script}\` calls \`ng build\` directly, which skips ` +
        `scripts/emit-route-meta.mjs. Use \`npm run build\` so Playwright serves the same ` +
        `files Vercel does.`
    );
  }

  return problems;
});

// The social-preview set. Everything here fails silently and off-site: a card
// is rendered by Slack or LinkedIn, from a crawl this repo never sees, and the
// first sign of a broken one is a link that has already been pasted somewhere
// that matters. So the parts that can be checked from here are.
check('the social preview set is intact', () => {
  const problems = [];
  const meta = JSON.parse(read('src/route-meta.json'));

  for (const asset of ['og-image.png', 'favicon.ico', 'favicon.svg', 'apple-touch-icon.png']) {
    if (!exists(`public/${asset}`)) {
      problems.push(`public/${asset} is missing; index.html links it. Run \`npm run gen:social\`.`);
    }
  }

  if (exists('public/og-image.png')) {
    const png = readFileSync(path.join(repoRoot, 'public/og-image.png'));
    // IHDR is the first chunk of every PNG: width and height are big-endian
    // u32s at byte 16 and 20.
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    if (width !== 1200 || height !== 630) {
      problems.push(
        `public/og-image.png is ${width}×${height}. Facebook, LinkedIn and Slack all ` +
          `size their large card at 1200×630; anything else is letterboxed or cropped.`
      );
    }
    // The ROADMAP set this ceiling. Crawlers give the fetch a short budget and
    // some skip the image entirely rather than wait for it.
    const KB = png.length / 1024;
    if (KB > 300) {
      problems.push(`public/og-image.png is ${KB.toFixed(0)}KB; the ceiling is 300KB.`);
    }
  }

  // og:image and og:url are read by a crawler with no page context, so a
  // relative path resolves against nothing. This is the single most common way
  // a card silently renders blank.
  const index = read('src/index.html');
  for (const [property, pattern] of [
    ['og:image', /property="og:image" content="(https:\/\/[^"]+)"/],
    ['twitter:image', /name="twitter:image" content="(https:\/\/[^"]+)"/],
  ]) {
    if (!pattern.test(index)) {
      problems.push(`src/index.html is missing an absolute ${property}. A relative one renders blank.`);
    }
  }
  for (const tag of ['twitter:card" content="summary_large_image', 'rel="apple-touch-icon"']) {
    if (!index.includes(tag)) {
      problems.push(`src/index.html no longer contains \`${tag}\`.`);
    }
  }

  // src/index.html carries the home page's card so that `ng serve` and any
  // reader of the source see the truth; the build overwrites it from the JSON
  // either way. If the two disagree, one of them is lying to somebody.
  const block = index.slice(
    index.indexOf('<!-- ROUTE-META:START -->'),
    index.indexOf('<!-- ROUTE-META:END -->')
  );
  if (!block) {
    problems.push(
      'src/index.html has no ROUTE-META block. scripts/emit-route-meta.mjs needs those ' +
        'markers to stamp per-route cards, and exits non-zero without them.'
    );
  } else {
    if (!block.includes(`<title>${meta.routes.home.title}</title>`)) {
      problems.push(
        `src/index.html's <title> does not match route-meta.json's home title. The build ` +
          `would replace it with the JSON's; make the source agree rather than leaving it stale.`
      );
    }
    if (!block.includes(meta.routes.home.description)) {
      problems.push("src/index.html's description does not match route-meta.json's home entry.");
    }
  }

  // Vercel resolves these off the filesystem before the SPA rewrite, so the
  // explicit entries are belt to that braces — but a route added to the JSON
  // and forgotten here is a card that quietly falls back to the home page's.
  const vercel = read('vercel.json');
  const rewrites = JSON.parse(vercel).rewrites;
  const catchAll = rewrites.findIndex((r) => r.destination === '/index.html');
  for (const route of Object.values(meta.routes)) {
    if (!route.path) continue;
    const at = rewrites.findIndex((r) => r.source === `/${route.path}`);
    if (at === -1) {
      problems.push(
        `vercel.json has no rewrite for /${route.path}, which route-meta.json defines. ` +
          `Without it the route depends on Vercel resolving the directory index itself.`
      );
    } else if (catchAll !== -1 && at > catchAll) {
      problems.push(
        `vercel.json's rewrite for /${route.path} sits after the SPA catch-all, so it ` +
          `never matches. Move it above the /(.*) entry.`
      );
    }
  }

  return problems;
});

// The stale-claims section is a warning about *other* documents, so it has the
// opposite failure mode from everything above: it goes wrong when someone does
// the right thing. Retiring each warning as it is fixed is what stops this
// section from becoming the stale thing it warns about.
check('the stale claims CLAUDE.md warns about are still stale', () => {
  if (!exists('ARCHITECTURE.md')) return [];
  const architecture = read('ARCHITECTURE.md');
  const warnings = [
    ['# Global styles', 'the `styles/` and `assets/` entries in its project tree'],
    ['MetricCard', 'the `MetricCard` components in its dashboard hierarchy'],
    ['Can be added with Playwright', 'its claim that E2E tests "can be added"'],
    ['## 🚀 Future Enhancements', 'its "Future Enhancements" checklist'],
  ];

  return warnings
    .filter(([marker]) => !architecture.includes(marker))
    .map(
      ([, description]) =>
        `ARCHITECTURE.md no longer has ${description} — that was fixed. Delete the ` +
        `corresponding warning from the "Stale claims" section of CLAUDE.md so the ` +
        `section does not outlive the problem.`
    );
});

// ---------------------------------------------------------------------------

const failures = checks.flatMap(([name, fn]) => fn().map((problem) => ({ name, problem })));

if (failures.length === 0) {
  process.stdout.write(`CLAUDE.md: ${checks.length} checks passed.\n`);
  process.exit(0);
}

process.stderr.write(`\nCLAUDE.md has drifted from the repository:\n\n`);
for (const { name, problem } of failures) {
  process.stderr.write(`  [${name}]\n  ${problem}\n\n`);
}
process.stderr.write(
  `Fix the document or the code, whichever is wrong. The checks live in\n` +
    `scripts/check-docs.mjs; if a claim has stopped being worth checking, delete it\n` +
    `from both places rather than loosening it.\n\n`
);
process.exit(1);
