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
    '.github/workflows/supply-chain.yml',
    'backend/requirements.txt',
    'backend/requirements-dev.txt',
    'backend/tests/test_dependency_pins.py',
    'pyproject.toml',
    'eslint.config.mjs',
    'angular.json',
    'lighthouserc.json',
    'src/app/app.routes.ts',
    'src/app/resume/resume.data.ts',
    'scripts/resume-fonts',
    'public/jacob-miller-resume.pdf',
  ];
  return referenced
    .filter((file) => !exists(file))
    .map((file) => `CLAUDE.md references ${file}, which no longer exists.`);
});

// The doc map's size column, which CLAUDE.md has always claimed was checked and
// which was not: four of its six rows had drifted, one of them by 3K. The number
// is a routing hint — "is this a page or an afternoon" — so it is asserted to
// the nearest kilobyte with a kilobyte of slack either side. That is wide enough
// that ordinary edits do not fail the build and narrow enough to catch a
// document that has doubled, which is the only thing the column is for.
check('the doc map states each document\'s real size', () => {
  const ROW = /^\|\s*`([\w./-]+\.md)`\s*\|\s*(\d+)K\s*\|/gm;
  const problems = [];

  for (const [, file, claimed] of CLAUDE_MD.matchAll(ROW)) {
    if (!exists(file)) continue; // reported by the existence check above
    const actual = Math.round(readFileSync(path.join(repoRoot, file)).length / 1024);
    if (Math.abs(actual - Number(claimed)) > 1) {
      problems.push(
        `CLAUDE.md's doc map calls ${file} ${claimed}K; it is ${actual}K. ` +
          `Update the table — the column is there to say whether a file is a page or an afternoon.`
      );
    }
  }

  return problems;
});

// The résumé's whole point is that it exists once. CLAUDE.md says the PDF is
// generated from `resume.data.ts` and that the site's sections read the same
// structure — claims that stop being true the moment somebody pastes a job back
// into a component, which is exactly how it got to four copies the first time.
check('the résumé still has a single source', () => {
  const problems = [];

  const scripts = JSON.parse(read('package.json')).scripts;
  for (const script of ['resume:pdf', 'resume:check']) {
    if (!(script in scripts)) {
      problems.push(`CLAUDE.md documents \`npm run ${script}\`; package.json has no such script.`);
    }
  }

  // Every section that shows résumé content must read it, not restate it.
  for (const consumer of [
    'src/app/experience/experience.ts',
    'src/app/skills/skills.ts',
    'src/app/resume/resume.ts',
  ]) {
    if (!exists(consumer)) {
      problems.push(`${consumer} is gone; CLAUDE.md says it reads the résumé structure.`);
    } else if (!/from '(\.\.\/resume|\.)\/resume\.data'/.test(read(consumer))) {
      problems.push(
        `${consumer} no longer imports resume.data. CLAUDE.md says the résumé lives in one ` +
          `place; either restore the import or stop making the claim.`
      );
    }
  }

  // The renderer embeds these by name. A missing face silently falls back to a
  // system font, which wraps the lines one way on one machine and another way
  // on the next.
  if (exists('scripts/render-resume.mjs')) {
    const renderer = read('scripts/render-resume.mjs');

    // CLAUDE.md claims the gate compares the PDF's *text*. That claim is only
    // true while the renderer actually rests on the extractor: a check that
    // went back to comparing bytes would pass every other assertion here and
    // fail every CI run, which is the exact failure this replaced.
    if (!exists('scripts/pdf-text.mjs')) {
      problems.push(
        'scripts/pdf-text.mjs is gone; CLAUDE.md says the résumé gate compares the PDF text.'
      );
    } else if (!/from '\.\/pdf-text\.mjs'/.test(renderer)) {
      problems.push(
        'scripts/render-resume.mjs no longer imports pdf-text.mjs. CLAUDE.md says the gate ' +
          'compares text rather than bytes; either restore the import or stop making the claim.'
      );
    }

    // The one rule pdf-text.mjs exists to obey. Positions differ across
    // platforms, so a comparison that reads one is unsatisfiable in CI.
    if (exists('scripts/pdf-text.mjs')) {
      const extractor = read('scripts/pdf-text.mjs');
      const readsPositions = /parseFloat|Number\(\s*(?:kern|offset|advance|tx|ty)/i.test(extractor);
      if (readsPositions) {
        problems.push(
          'scripts/pdf-text.mjs looks like it reads a coordinate. Glyph advances differ between ' +
            'platforms; CLAUDE.md says the extractor never reads one.'
        );
      }
    }

    for (const [, file] of renderer.matchAll(/'([\w-]+\.woff2)'/g)) {
      if (!exists(path.join('scripts', 'resume-fonts', file))) {
        problems.push(`scripts/render-resume.mjs embeds ${file}, which is not in scripts/resume-fonts/.`);
      }
    }
    // OFL 1.1 requires the licence travel with the font.
    for (const licence of ['OFL-Cinzel.txt', 'OFL-CrimsonPro.txt']) {
      if (!exists(path.join('scripts', 'resume-fonts', licence))) {
        problems.push(`scripts/resume-fonts/${licence} is missing; the OFL requires it be kept.`);
      }
    }
  }

  return problems;
});

// Things CLAUDE.md asserts are *absent*. This has bitten the repo before: a
// root requirements.txt silently overrides the interpreter pin on Vercel.
check('claimed-absent paths are still absent', () => {
  const problems = [];
  if (exists('requirements.txt')) {
    problems.push(
      'A root requirements.txt exists. CLAUDE.md and test_dependency_pins.py both say ' +
        'there must not be one — it overrides requires-python on Vercel and pins the ' +
        'build to 3.14, where pydantic-core has no wheel.'
    );
  }
  return problems;
});

// AUBADE is specified as a separate work that shares this deployment and
// nothing else, and CLAUDE.md repeats that in three places. It is the single
// easiest claim in the repository to break by accident and the hardest to
// notice: importing one helper from `src/app/` costs nothing, breaks no test,
// and is invisible in a diff that is mostly shader. So the boundary is a gate.
//
// Three separate properties, because they fail in different ways:
//
//   1. Imports only ever point out of `src/aubade/`, never in.
//   2. The renderer is behind a dynamic `import()`. A static one still works —
//      it just puts 34KB of shader into the router's graph and lets a WebGL
//      context exist before anyone asked for the route, which is AUBADE's
//      second non-negotiable gone with nothing on fire.
//   3. The route is wired everywhere a route has to be wired here: the shared
//      metadata, the router, and vercel.json.

/** Files under `src/aubade/`, recursively. */
const aubadeSources = (dir = 'src/aubade') =>
  readdirSync(path.join(repoRoot, dir), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? aubadeSources(`${dir}/${entry.name}`)
      : entry.name.endsWith('.ts')
        ? [`${dir}/${entry.name}`]
        : []
  );

check('AUBADE stays a separate work', () => {
  if (!exists('src/aubade')) {
    return ['src/aubade/ is gone, but CLAUDE.md and AUBADE.md both describe it.'];
  }

  const problems = [];

  for (const file of aubadeSources()) {
    for (const [, specifier] of read(file).matchAll(/from\s+'([^']+)'/g)) {
      if (specifier.includes('app/') || specifier.endsWith('/styles.css')) {
        problems.push(
          `${file} imports '${specifier}'. Nothing in src/aubade/ may import from src/app/ — ` +
            `AUBADE shares this deployment and nothing else, and a shared helper is how a ` +
            `separate work quietly becomes a subsection of the portfolio.`
        );
      }
    }
  }

  for (const file of readdirSync(path.join(repoRoot, 'src/app'), { recursive: true })) {
    const relative = `src/app/${String(file).replace(/\\/g, '/')}`;
    if (!relative.endsWith('.ts') || !exists(relative)) continue;
    if (/from\s+'[^']*aubade\/(?!aubade')/.test(read(relative))) {
      problems.push(
        `${relative} imports from src/aubade/. The only permitted reference is the lazy ` +
          `loadComponent in app.routes.ts; everything else points the other way.`
      );
    }
  }

  if (exists('src/aubade/aubade.ts')) {
    const component = read('src/aubade/aubade.ts');
    if (!/await import\('\.\/renderer'\)/.test(component)) {
      problems.push(
        "src/aubade/aubade.ts no longer defers the renderer behind `await import('./renderer')`. " +
          'CLAUDE.md and the README both say the shaders reach a browser only when someone opens ' +
          'the route, and that only holds while the import is dynamic.'
      );
    }
    if (/^import\s+\{[^}]*LobbyRenderer/m.test(component)) {
      problems.push(
        'src/aubade/aubade.ts imports LobbyRenderer as a value. It must stay an `import type`, ' +
          'which the compiler erases — a value import pulls the shaders back into this chunk.'
      );
    }
  }

  const meta = JSON.parse(read('src/route-meta.json'));
  if (meta.routes.aubade?.path !== 'aubade') {
    problems.push('src/route-meta.json no longer defines the /aubade route.');
  }
  if (!read('src/app/app.routes.ts').includes('meta.aubade.path')) {
    problems.push('/aubade is not registered in app.routes.ts.');
  }

  return problems;
});

// The clock, and the five hours it drives.
//
// AUBADE's first failure mode is the piece becoming a demo reel — six rooms of
// unrelated effects with a hotel painted on — and the stated fix is that every
// room responds to the same solar state. That is a claim about wiring, and
// wiring is exactly the kind of thing that survives a refactor as a dangling
// import nobody notices, because a lobby lit by a constant looks fine.
//
// So three properties, each of which fails silently on its own:
//
//   1. Every state has a rig and a committed frame. A state added to
//      `solar/state.ts` and forgotten in `rooms/light-rig.ts` is an unlit room
//      at one hour of the day, in one part of the world.
//   2. The route actually reads the clock. Nothing else notices if it stops.
//   3. The `?t=` back door stays behind `isDevMode()`. A visitor who can type
//      `?t=open` has been handed the whole work, and the refusal — which is the
//      concept — becomes a URL parameter.

/** The state names `solar/state.ts` declares, read out of the union type. */
const solarStates = () => {
  const source = read('src/aubade/solar/state.ts');
  const union = source.match(/export type AubadeState =([^;]+);/);
  return union === null ? [] : [...union[1].matchAll(/'([a-z]+)'/g)].map(([, name]) => name);
};

check('the lobby is lit by the clock, at every hour', () => {
  for (const file of ['src/aubade/rooms/light-rig.ts', 'src/aubade/desk.ts']) {
    if (!exists(file)) {
      return [`${file} is gone; CLAUDE.md and AUBADE.md both say the lobby reads the solar state.`];
    }
  }

  const problems = [];
  const states = solarStates();

  if (states.length === 0) {
    return ['Could not read the AubadeState union out of src/aubade/solar/state.ts.'];
  }

  const rigs = read('src/aubade/rooms/light-rig.ts');
  const copy = read('src/aubade/desk.ts');

  for (const state of states) {
    if (!new RegExp(`^\\s{2}${state}:\\s*\\{`, 'm').test(rigs)) {
      problems.push(
        `LIGHT_RIGS has no rig for '${state}'. Every solar state needs one — a missing entry ` +
          `is an unlit room at one hour of the day, in one part of the world.`
      );
    }
    if (!new RegExp(`^\\s{2}${state}:\\s*\\{`, 'm').test(copy)) {
      problems.push(`DESK_COPY has no line for '${state}'; the plate would render \`undefined\`.`);
    }
    // The phase's Definition of Done. `npm run verify:shader -- --out
    // docs/images/aubade-lobby.webp` writes all five in one run.
    if (!exists(`docs/images/aubade-lobby-${state}.webp`)) {
      problems.push(
        `docs/images/aubade-lobby-${state}.webp is missing. AUBADE's day-and-night phase ` +
          `requires a committed frame per state; regenerate with ` +
          `\`npm run verify:shader -- --out docs/images/aubade-lobby.webp\`.`
      );
    }
  }

  // Both routes read the sun through `hour.ts`, so that is where the reading
  // and the back door's gate both have to be.
  const hour = read('src/aubade/hour.ts');
  if (!/from '\.\/solar'/.test(hour) || !/readClock/.test(hour)) {
    problems.push(
      'src/aubade/hour.ts no longer calls readClock. CLAUDE.md and AUBADE.md both say the ' +
        'lobby is lit by the real sun; without this it is lit by whatever constant was left ' +
        'behind, which looks entirely fine and is the concept gone.'
    );
  }

  for (const route of ['src/aubade/aubade.ts', 'src/aubade/reader/reader.ts']) {
    if (!/readTheSun/.test(read(route))) {
      problems.push(
        `${route} no longer reads the sun. Both AUBADE routes state the solar hour — the lobby ` +
          `by lighting the room with it and the Reader's Edition by writing it out in words — ` +
          `and a route that stopped would look entirely fine.`
      );
    }
  }

  // The back door, wherever it is read from. This used to name `aubade.ts`
  // alone, which was true until there were two routes; the point of gating it
  // by import rather than by filename is that the third one is covered before
  // it is written.
  if (exists('src/aubade/fake-clock.ts')) {
    for (const file of aubadeSources()) {
      if (file.endsWith('.spec.ts') || file.endsWith('fake-clock.ts')) continue;
      const source = read(file);
      if (/from '[^']*\/fake-clock'/.test(source) && !/isDevMode\(\)/.test(source)) {
        problems.push(
          `${file} reads the \`?t=\` fake clock without gating it on isDevMode(). In production ` +
            `that hands every visitor the night rooms from the address bar, and the refusal ` +
            `that AUBADE is built on becomes a URL parameter.`
        );
      }
    }
  }

  return problems;
});

// The Reader's Edition, and the one property of it that cannot be seen at
// runtime: that no code able to create a WebGL context is reachable from it.
//
// AUBADE's first non-negotiable is a text version of the work, and the phase
// that landed it has a Definition of Done ending "no WebGL context created on
// that route at all". Three layers check that, because each is blind to the
// others' failures. A unit test proves mounting the component asks for nothing.
// An e2e test counts `getContext` calls against the real page. Neither would
// notice a `renderer.ts` import added to a file three hops up the graph, which
// would work perfectly, cost the route its whole reason for existing, and show
// up in a diff as one line.
//
// So this walks the import graph from `reader.ts` and fails if it can reach the
// renderer. The walk follows relative imports only — a package import cannot
// reach `src/aubade/gl/`, and following them would mean resolving node_modules
// for no gain.

/** Resolve a relative import specifier to a repo path, or `null`. */
const resolveImport = (fromFile, specifier) => {
  const base = path.posix.join(path.posix.dirname(fromFile), specifier);
  for (const candidate of [`${base}.ts`, `${base}/index.ts`]) {
    if (exists(candidate)) return candidate;
  }
  return null;
};

/** Every module reachable from `entry` by relative import, `entry` included. */
const importGraph = (entry) => {
  const seen = new Set();
  const queue = [entry];

  while (queue.length > 0) {
    const file = queue.pop();
    if (seen.has(file) || !exists(file)) continue;
    seen.add(file);

    for (const [, specifier] of read(file).matchAll(/from\s+'(\.[^']*)'/g)) {
      const target = resolveImport(file, specifier);
      if (target !== null && !seen.has(target)) queue.push(target);
    }
  }

  return seen;
};

check('the Reader’s Edition can reach no WebGL at all', () => {
  const entry = 'src/aubade/reader/reader.ts';
  if (!exists(entry)) {
    return [
      `${entry} is gone. It is AUBADE's first non-negotiable — the text version of the work — ` +
        `and CLAUDE.md, AUBADE.md and the a11y suite all describe it.`,
    ];
  }

  const problems = [];

  // Anything that can hold a context, or compile a shader, or ask for either.
  const forbidden = /^src\/aubade\/(gl|rooms|camera)\//;
  for (const module of importGraph(entry)) {
    if (forbidden.test(module) || module === 'src/aubade/renderer.ts') {
      problems.push(
        `${entry} can reach ${module} through its imports. The Reader's Edition exists so that ` +
          `there is a version of AUBADE with no WebGL on it at all; a reachable renderer means ` +
          `a chunk that can create a context, which is the phase's Definition of Done gone with ` +
          `nothing visibly broken.`
      );
    }
  }

  if (/<canvas/i.test(read('src/aubade/reader/reader.html'))) {
    problems.push('src/aubade/reader/reader.html has a canvas on it. That route has no pixels.');
  }

  // Wired where a route has to be wired. The generic route checks cover
  // vercel.json and the static card; these two are the ones specific to it.
  const meta = JSON.parse(read('src/route-meta.json'));
  if (meta.routes.aubadeReader?.path !== 'aubade/reader') {
    problems.push('src/route-meta.json no longer defines the /aubade/reader route.');
  }
  if (!read('src/app/app.routes.ts').includes('meta.aubadeReader.path')) {
    problems.push('/aubade/reader is not registered in app.routes.ts.');
  }

  // "Reachable from a visible link on every screen" — and the lobby is two of
  // them, the plate over the room and the prose one scroll down. One link at
  // the bottom satisfies the letter of the requirement and none of the point.
  const lobby = read('src/aubade/aubade.html');
  const links = [...lobby.matchAll(/href="\/aubade\/reader"/g)].length;
  if (links < 2) {
    problems.push(
      `src/aubade/aubade.html links to /aubade/reader ${links} time(s). AUBADE's first ` +
        `non-negotiable asks for a visible link on every screen, and the lobby is two screens.`
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

  const supplyChain = read('.github/workflows/supply-chain.yml');
  expect(
    supplyChain.includes('--audit-level=high'),
    'CLAUDE.md says the supply-chain job fails on npm advisories at high and above; ' +
      'supply-chain.yml no longer passes --audit-level=high.'
  );
  expect(
    supplyChain.includes('pip-audit') &&
      read('backend/requirements-dev.txt').includes('pip-audit=='),
    'CLAUDE.md documents pip-audit as a gate run from a pin. It is no longer both ' +
      'pinned in backend/requirements-dev.txt and invoked by supply-chain.yml.'
  );

  const scripts = JSON.parse(read('package.json')).scripts;
  for (const gate of [
    'code-quality',
    'test',
    'test:scripts',
    'code-quality:py',
    'test:backend',
    'e2e',
    'audit',
  ]) {
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
      problems.push(
        `src/index.html is missing an absolute ${property}. A relative one renders blank.`
      );
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

// Analytics is the one feature here whose correctness is a promise to somebody
// else. `docs/analytics.md` tells a reader exactly which events this site
// sends; an event added in TypeScript and forgotten in that table turns a
// privacy note into a false one, and unlike a broken card nobody ever sees it
// happen. So the table is checked against the union it describes, in both
// directions, and the parts of the claim that are structural — the script tag,
// the same-origin path, the absence of a consent banner's prerequisites — are
// checked against the files that would have to change for them to stop holding.
check('the analytics doc lists exactly the events the code sends', () => {
  if (!exists('docs/analytics.md') || !exists('src/app/services/analytics.service.ts')) {
    return ['docs/analytics.md or the analytics service is missing; the analytics item shipped both.'];
  }

  const problems = [];
  const service = read('src/app/services/analytics.service.ts');
  const doc = read('docs/analytics.md');

  // The event names as the code will actually send them: the string literals
  // in the ANALYTICS_EVENTS object, not the property keys, since the string is
  // what Vercel groups by.
  const block = service.slice(
    service.indexOf('ANALYTICS_EVENTS = {'),
    service.indexOf('} as const;')
  );
  const sent = [...block.matchAll(/:\s*'([a-z_]+)'/g)].map(([, name]) => name);

  if (sent.length === 0) {
    return ['Could not read the event names out of ANALYTICS_EVENTS. Did its shape change?'];
  }

  for (const event of sent) {
    if (!doc.includes(`\`${event}\``)) {
      problems.push(
        `analytics.service.ts sends \`${event}\`, which docs/analytics.md does not list. ` +
          `A privacy note that undercounts what is collected is worse than none.`
      );
    }
  }
  for (const [, event] of doc.matchAll(/^\|\s*`([a-z_]+)`\s*\|/gm)) {
    if (!sent.includes(event)) {
      problems.push(
        `docs/analytics.md documents \`${event}\`, which the code no longer sends. ` +
          `Delete the row — it describes collection that does not happen.`
      );
    }
  }

  return problems;
});

check('the analytics claims that are structural still hold', () => {
  if (!exists('docs/analytics.md')) return []; // reported above
  const problems = [];
  const index = read('src/index.html');

  // Same-origin is the entire basis for "no third-party host" and, with the
  // cookie-free provider, for shipping no consent banner. A tag pointing
  // anywhere else invalidates the note rather than just moving a file.
  const tag = index.match(/<script[^>]*src="([^"]*insights[^"]*)"[^>]*>/);
  if (!tag) {
    problems.push(
      'src/index.html no longer loads the Vercel Analytics script. docs/analytics.md ' +
        'describes what this site collects; if that is now nothing, delete the note.'
    );
  } else if (!tag[1].startsWith('/_vercel/')) {
    problems.push(
      `The analytics script is loaded from "${tag[1]}", which is not the same-origin ` +
        `/_vercel/ path. docs/analytics.md's "no third-party host" claim, and the decision ` +
        `not to ship a consent banner, both rest on that path.`
    );
  }

  // The event properties are typed as scalars, which the note leans on as the
  // reason no free text can be sent. A widened type would make that a guess.
  const service = read('src/app/services/analytics.service.ts');
  if (!/AnalyticsProperties\s*=\s*Record<string,[^>]*>/.test(service)) {
    problems.push(
      'AnalyticsProperties is no longer a Record of scalars. docs/analytics.md cites that ' +
        'type as the reason nothing a visitor typed can be sent; widen it and that stops ' +
        'being true by construction.'
    );
  }

  // The resume link is the only call site for `resume_downloaded`, and the file
  // it points at is not imported by anything, so nothing else would catch it
  // going missing.
  const resume = read('src/app/resume/resume.html');
  const href = resume.match(/href="\/([^"]+\.pdf)"/);
  if (!href) {
    problems.push(
      'The contact section no longer links a resume PDF, but analytics.service.ts still ' +
        'defines `resume_downloaded`. One of the two is stale.'
    );
  } else if (!exists(`public/${href[1]}`)) {
    problems.push(
      `The contact section links /${href[1]}, which is not in public/. The link 404s in ` +
        `production, and the download event counts clicks on it.`
    );
  }

  return problems;
});

// A performance budget is a promise about a number, and a promise about a number
// is the easiest kind to keep loosely: the README says the site holds itself to
// 90, someone finds the gate inconvenient, the config quietly says 80, and the
// README goes on saying 90 because nothing reads it. That is worse than never
// having claimed a number, because now the claim is doing the reassuring and the
// gate is doing nothing.
//
// So the three places that carry these numbers are checked against each other:
// README.md states them, lighthouserc.json asserts the Lighthouse categories,
// and angular.json's production budgets cap the bundle. The README is the
// *source* of the expected values here, the same way CLAUDE.md is elsewhere in
// this file — editing the sentence a reader sees is what updates the check.
//
// The severity is part of the claim, not decoration. The ROADMAP asked for a
// budget that **fails** the build rather than warning, so an assertion demoted
// from `error` to `warn` counts as an unenforced claim even when its number is
// still right.

/** How the README states a Lighthouse threshold: `**performance 90**`. */
const CATEGORY_CLAIM = /\*\*(performance|accessibility|best practices) (\d+)\*\*/g;

/** How the README states a bundle ceiling: `**all scripts at 650 kB**`. */
const BUDGET_CLAIM = /\*\*(initial payload|all scripts) at (\d+) kB\*\*/g;

/** README label → the `type` angular.json uses for that budget. */
const BUDGET_TYPES = { 'initial payload': 'initial', 'all scripts': 'allScript' };

/**
 * Find performance and size numbers README.md states that nothing enforces.
 *
 * Both directions, like `unjustifiedSuppressions` below: a number the README
 * states but no config asserts is a false promise, and a Lighthouse category
 * asserted but never stated is a gate the reader was not told about.
 *
 * @param {string} readme - the full text of README.md. It states each Lighthouse
 *   threshold as `**<category> <score>**` (`**performance 90**`, where the score
 *   is out of 100 and the category is one of `performance`, `accessibility`,
 *   `best practices`), and each bundle ceiling as `**<label> at <n> kB**`
 *   (`**initial payload at 15 kB**`, `**all scripts at 650 kB**`).
 * @param {Record<string, [string, {minScore: number}]>} assertions -
 *   lighthouserc.json's `ci.assert.assertions`. Keys are Lighthouse audit ids;
 *   the category ones look like `categories:best-practices` — the README's
 *   label with its spaces turned into hyphens. Each value is a
 *   `[severity, options]` pair, where `severity` must be `'error'` for the job
 *   to fail rather than warn, and `options.minScore` is a fraction of 1.
 * @param {Array<{type: string, maximumWarning?: string, maximumError?: string}>} budgets -
 *   the production `budgets` array from angular.json. `type` is Angular's budget
 *   type (`initial`, `allScript`, `any`, `anyComponentStyle`); the sizes are
 *   strings like `'650kB'`. Only `maximumError` fails a build — `maximumWarning`
 *   prints and carries on — and only the two types the README names are this
 *   function's business.
 * @returns {string[]} one message per claim that is not enforced, each naming
 *   the number the README states, what the config actually says, and which file
 *   to fix; empty when every stated number is enforced as an error and every
 *   asserted category is stated.
 */
const unenforcedBudgetClaims = (readme, assertions, budgets) => {
  const problems = [];

  // Direction one: every Lighthouse number the README states has to be asserted,
  // at `error`, at that number.
  const stated = new Set();

  for (const [, label, score] of readme.matchAll(CATEGORY_CLAIM)) {
    const key = `categories:${label.replace(/ /g, '-')}`;
    stated.add(key);

    const assertion = assertions[key];
    if (!assertion) {
      problems.push(
        `README.md says the build fails below ${label} ${score}, but lighthouserc.json ` +
          `asserts nothing for \`${key}\`. Add the assertion or drop the claim — a number ` +
          `nothing checks is doing the reassuring while the gate does nothing.`
      );
      continue;
    }

    const [severity, options] = assertion;
    if (severity !== 'error') {
      problems.push(
        `lighthouserc.json asserts \`${key}\` at "${severity}", so a regression prints and ` +
          `the job passes anyway. README.md says the build **fails** below ${label} ` +
          `${score}; put it back to "error" or stop claiming it fails.`
      );
    }

    const enforced = Math.round(options.minScore * 100);
    if (enforced !== Number(score)) {
      problems.push(
        `README.md states ${label} ${score}; lighthouserc.json enforces ${enforced}. ` +
          `Whichever one moved, move the other — the README is the one a reader believes.`
      );
    }
  }

  // The other direction: a threshold the reader was never told about. Not a lie,
  // but the README's Gates section is where this site says what it holds itself
  // to, and a gate missing from it is one nobody can hold it to.
  for (const key of Object.keys(assertions)) {
    if (key.startsWith('categories:') && !stated.has(key)) {
      problems.push(
        `lighthouserc.json asserts \`${key}\`, which README.md never states. Add it to the ` +
          `Gates section, or drop an assertion the site does not claim.`
      );
    }
  }

  // The bundle ceilings. `maximumWarning` prints and carries on, so a budget
  // without a `maximumError` is not a ceiling no matter what number it names.
  for (const [, label, size] of readme.matchAll(BUDGET_CLAIM)) {
    const type = BUDGET_TYPES[label];
    const budget = budgets.find((entry) => entry.type === type);

    if (!budget) {
      problems.push(
        `README.md caps the ${label} at ${size} kB, but angular.json has no \`${type}\` ` +
          `budget in the production configuration. Add it or drop the claim.`
      );
      continue;
    }

    if (!budget.maximumError) {
      problems.push(
        `angular.json's \`${type}\` budget sets no maximumError, so exceeding it warns and ` +
          `builds. README.md caps the ${label} at ${size} kB as a ceiling that fails.`
      );
      continue;
    }

    const enforced = Number(budget.maximumError.replace(/kB$/i, ''));
    if (enforced !== Number(size)) {
      problems.push(
        `README.md caps the ${label} at ${size} kB; angular.json's \`${type}\` budget ` +
          `errors at ${budget.maximumError}. Update whichever is stale.`
      );
    }
  }

  return problems;
};

check('the performance numbers the README states are the ones enforced', () => {
  if (!exists('lighthouserc.json')) {
    return [
      'lighthouserc.json is missing, but README.md states the thresholds it holds and ' +
        'code-quality.yml runs a job against it. Restore it or drop the claim.',
    ];
  }

  const { assertions } = JSON.parse(read('lighthouserc.json')).ci.assert;
  const { budgets } =
    JSON.parse(read('angular.json')).projects['ethereal-hotel'].architect.build.configurations
      .production;

  return unenforcedBudgetClaims(read('README.md'), assertions, budgets);
});

// `npm audit --audit-level=high` and pip-audit's `--ignore-vuln` are both ways
// of saying "this advisory is open and we are shipping anyway". That is a
// defensible thing to say, exactly once you have said why — the supply-chain
// item put it plainly: an open advisory with no note is worse than no scanner. So the
// note is required rather than encouraged. And, like the stale-claims check
// below, it fails in the other direction too: a note left behind after its
// suppression is gone is how a file of reasons becomes a file of fiction.
//
// The format, one per suppression, anywhere in the workflow:
//
//     # EXCEPTION <token> (<YYYY-MM-DD>) — <why, at least a sentence of it>
//
// where <token> is `audit-level=<level>` for npm's severity floor, or the
// advisory ID handed to `--ignore-vuln`. Continuation lines are plain comments.

// A note is found loosely and then verified strictly. One strict pattern would
// have been shorter and wrong: a malformed note would simply not match, and a
// suppression whose note is unreadable would read as a suppression with no note
// at all — or worse, slip through silently. Finding candidates first is what
// makes "this note does not parse" a thing the check can say.
const NOTE_CANDIDATE = /^\s*#\s*EXCEPTION\b.*$/gm;
const NOTE_WELL_FORMED = /^\s*#\s*EXCEPTION\s+(\S+)\s+\((\d{4}-\d{2}-\d{2})\)\s+—\s+(.+)$/;

// A reason shorter than this is a gesture at one. The number is arbitrary; the
// principle is that a suppression nobody can evaluate is one nobody revisits.
const MINIMUM_REASON = 20;

/**
 * Find suppressions in the supply-chain workflow that are not justified.
 *
 * @param {string} workflow - the full text of .github/workflows/supply-chain.yml
 * @returns {string[]} one message per problem, each naming the token it is
 *   about and what would fix it; empty when every suppression has a well-formed
 *   note and every note still has a suppression.
 */
const unjustifiedSuppressions = (workflow) => {
  const problems = [];

  // What the file actually suppresses, read off the `run:` lines. `low` is
  // npm's floor and suppresses nothing, so it is not one — a note explaining it
  // would be a note about nothing.
  const suppressed = new Set([
    ...[...workflow.matchAll(/--audit-level=(\w+)/g)]
      .filter(([, level]) => level !== 'low')
      .map(([, level]) => `audit-level=${level}`),
    ...[...workflow.matchAll(/--ignore-vuln\s+(\S+)/g)].map(([, id]) => id),
  ]);

  // What the file claims to have thought about, read off the comments.
  const explained = new Set();

  for (const line of workflow.match(NOTE_CANDIDATE) ?? []) {
    const note = line.match(NOTE_WELL_FORMED);
    if (note === null) {
      problems.push(
        `This EXCEPTION note does not parse: "${line.trim()}". The format is ` +
          '`# EXCEPTION <token> (<YYYY-MM-DD>) — <reason>`, and the separator is an em dash.'
      );
      continue;
    }

    const [, token, date, reason] = note;
    explained.add(token);

    // The pattern above already guarantees the shape, so this is the only thing
    // left to be wrong about a date: 2026-13-40 is well-formed and not a day.
    if (Number.isNaN(new Date(date).valueOf())) {
      problems.push(
        `The EXCEPTION note for ${token} is dated ${date}, which is not a real date.`
      );
    }
    if (reason.trim().length < MINIMUM_REASON) {
      problems.push(
        `The EXCEPTION note for ${token} offers "${reason.trim()}" as its reason. ` +
          `Say what is open and why it is acceptable, in enough words to be argued with.`
      );
    }
  }

  // The two directions. The second is the one that rots quietly: a note is
  // written once, in a hurry, and outlives the thing it excused by years.
  for (const token of suppressed) {
    if (!explained.has(token)) {
      problems.push(
        `${token} is suppressed with no \`# EXCEPTION\` note. Add one naming what stays ` +
          `open and why, or drop the suppression — an open advisory with no note is ` +
          `worse than no scanner.`
      );
    }
  }
  for (const token of explained) {
    if (!suppressed.has(token)) {
      problems.push(
        `An \`# EXCEPTION\` note explains ${token}, which this workflow no longer ` +
          `suppresses. Delete the note; it has outlived what it excused.`
      );
    }
  }

  return problems;
};

check('every advisory suppression carries a dated exception', () => {
  if (!exists('.github/workflows/supply-chain.yml')) return []; // reported above
  return unjustifiedSuppressions(read('.github/workflows/supply-chain.yml'));
});

// A document that tells a reader to run a command which does not exist is the
// cheapest kind of wrong to ship and the most expensive kind to hit: the reader
// is following instructions, in a fresh clone, at the exact moment they have the
// least context to work out what was meant. The docs-rewrite item required that every
// code block in the docs actually runs, and then cut those docs down to the
// commands worth keeping — this is what holds that true afterwards, because the
// realistic way it breaks is a script being renamed in package.json by someone
// who never opened the Markdown.
//
// Scope is `npm run <name>` only. Bare `npm test` and `npm start` are already
// covered by the gate list in the config check above, and shell commands
// (`docker build`, `curl`, `python main.py`) are not this script's to resolve.

// Documents that *instruct* a reader. ROADMAP.md and AUBADE.md are deliberately
// absent: they describe intentions, and both name scripts that do not exist yet
// on purpose — the ROADMAP's resume item specifies `npm run resume:pdf` as the
// thing it will add. Checking them would punish planning.
const INSTRUCTIONAL_DOCS = [
  'README.md',
  'ARCHITECTURE.md',
  'CONTRIBUTING.md',
  'CLAUDE.md',
  'backend/README.md',
];

/**
 * Find `npm run` invocations in the documentation that package.json cannot
 * satisfy.
 *
 * @param {Record<string, string>} docs - file path → that file's full Markdown
 *   text. Paths are repo-relative and used only to name the file in messages.
 * @param {Record<string, string>} scripts - the `scripts` object from
 *   package.json; only its keys matter.
 * @returns {string[]} one message per undefined script, naming the document it
 *   was found in and the script it asked for; empty when every documented
 *   `npm run` resolves.
 */
const missingNpmScripts = (docs, scripts) => {
  const problems = [];

  for (const [file, text] of Object.entries(docs)) {
    // Deduped per file: a command documented in three places is one broken
    // instruction, not three, and three copies of the same message would bury
    // whatever else this run found.
    const asked = new Set(
      [...text.matchAll(/npm run ([a-z0-9][\w:-]*)/g)].map(([, name]) => name)
    );

    for (const name of asked) {
      if (!(name in scripts)) {
        problems.push(
          `${file} tells the reader to run \`npm run ${name}\`, which package.json does ` +
            `not define. Add the script or fix the document — whoever hits this is ` +
            `following instructions in a fresh clone, with the least context of anyone ` +
            `to work out what was meant.`
        );
      }
    }
  }

  return problems;
};

check('every `npm run` the docs mention exists in package.json', () => {
  const docs = Object.fromEntries(
    INSTRUCTIONAL_DOCS.filter(exists).map((file) => [file, read(file)])
  );
  return missingNpmScripts(docs, JSON.parse(read('package.json')).scripts);
});

// ---------------------------------------------------------------------------

// The README's images, and what the animated one costs.
//
// A broken image on the front page is a worse first impression than no image,
// and these are easier to break than most: they are generated by
// `npm run capture:stream`, which needs a container runtime and a network, so no
// gate regenerates them and nothing else would notice a rename.
//
// The size ceiling is the other half. GitHub inlines the capture on the
// repository's front page, so every visitor pays for it whether or not they
// watch it. `scripts/capture-stream.mjs` refuses to write a file over 2MB; this
// asserts the same number against what is actually committed, so replacing the
// file by hand cannot quietly land four megabytes on the landing page.
const MAX_ANIMATION_BYTES = 2 * 1024 * 1024;

// Root-level documents only: their relative links resolve against the repo root,
// so a match can be checked with `exists` directly. `docs/analytics.md` would
// need its own directory prefixed and embeds nothing today.
const ILLUSTRATED_DOCS = ['README.md', 'ARCHITECTURE.md', 'CONTRIBUTING.md'];

check('the images the docs embed exist, and the capture stays inside its budget', () => {
  const problems = [];

  for (const file of ILLUSTRATED_DOCS.filter(exists)) {
    for (const [, target] of read(file).matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)) {
      if (/^https?:/.test(target)) continue; // not ours to keep alive
      if (!exists(target)) {
        problems.push(
          `${file} embeds ${target}, which does not exist. The two transport captures are ` +
            `written by \`npm run capture:stream\` — regenerate rather than hand-replacing, ` +
            `or the caption stops describing the picture.`
        );
      }
    }
  }

  const capture = 'docs/images/websocket-stream.webp';
  if (exists(capture)) {
    const bytes = readFileSync(path.join(repoRoot, capture)).length;
    if (bytes > MAX_ANIMATION_BYTES) {
      problems.push(
        `${capture} is ${(bytes / 1024 / 1024).toFixed(2)}MB, over the ` +
          `${MAX_ANIMATION_BYTES / 1024 / 1024}MB ceiling that ` +
          `scripts/capture-stream.mjs enforces at capture time. Re-run ` +
          `\`npm run capture:stream\` with a lower --quality or fewer --frames.`
      );
    }
  }

  return problems;
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
