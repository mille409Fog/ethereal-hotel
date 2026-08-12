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
  for (const gate of ['code-quality', 'test', 'code-quality:py', 'test:backend', 'e2e', 'audit']) {
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
    return ['docs/analytics.md or the analytics service is missing; ROADMAP item 10 shipped both.'];
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

// `npm audit --audit-level=high` and pip-audit's `--ignore-vuln` are both ways
// of saying "this advisory is open and we are shipping anyway". That is a
// defensible thing to say, exactly once you have said why — ROADMAP item 11 put
// it plainly: an open advisory with no note is worse than no scanner. So the
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
// least context to work out what was meant. ROADMAP item 6 required that every
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
// on purpose — ROADMAP item 9 specifies `npm run resume:pdf` as the thing it
// will add. Checking them would punish planning.
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
