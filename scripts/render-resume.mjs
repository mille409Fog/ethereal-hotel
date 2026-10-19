/**
 * Renders `src/app/resume/resume.data.ts` to `public/jacob-miller-resume.pdf`.
 *
 *     npm run resume:pdf      write the PDF
 *     npm run resume:check    fail if the committed PDF is stale
 *
 * The PDF used to be a LibreOffice document somebody edited by hand, which meant
 * the site and the résumé were two independent claims about the same career and
 * nothing kept them honest. Now there is one typed structure and this script,
 * and `resume:check` re-renders on every CI run and fails when the committed
 * file stops matching — the same bar the rest of the repo holds itself to, where
 * a claim worth making is a claim worth failing a build over.
 *
 * It renders through the Playwright Chromium the accessibility run already
 * installs, per the ROADMAP item's instruction not to add a PDF dependency.
 * `page.pdf()` emits real vector text, so the result is selectable and
 * searchable rather than a picture of a résumé.
 *
 * ## Why the page is an odd size
 *
 * A4 is 210×297mm and US Letter is 216×279.4mm; neither contains the other. A
 * PDF laid out for one gets silently scaled when printed on the other, which is
 * how a résumé arrives with 5% smaller type and margins that no longer agree
 * with each other. This renders at 210×279.4mm — the *intersection* — so the
 * page drops into either sheet at 100% with a hairline of extra margin and no
 * rescaling. It is the one page size that is genuinely presentable at both.
 *
 * ## Why the fonts are committed next door
 *
 * `scripts/resume-fonts/` holds the two brand faces as woff2, embedded into the
 * print HTML as data URIs. They are the same files `src/styles.css` serves to
 * the site, so the PDF and the page cannot drift onto different cuts of a face.
 * Two reasons to embed: a build gate should not need the network, and text
 * metrics decide the layout. Rendering with whatever fonts happen to be
 * installed would wrap the lines one way on the author's Windows box and another
 * way on ubuntu CI, at which point the one-page check below would mean something
 * different on each. Embedding the faces makes the *layout* the same everywhere.
 * Their OFL licences sit beside them, as that licence requires.
 *
 * It does not make the *bytes* the same everywhere, and a previous version of
 * this file claimed it did. It does not come close — the same source renders to
 * 210KB in 364 objects here and 97KB in 163 objects on the Linux CI image, which
 * is why `resume:check` compares the text layer rather than the file. The
 * measurements and the reason are in `scripts/pdf-text.mjs`.
 */
import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { RESUME, emphasis, formatPeriod } from '../src/app/resume/resume.data.ts';
import { comparable, extractText, pageSizes } from './pdf-text.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fontDir = path.join(repoRoot, 'scripts', 'resume-fonts');
const outputPath = path.join(repoRoot, 'public', 'jacob-miller-resume.pdf');

/**
 * A4 ∩ US Letter, in millimetres. See the header.
 *
 * Kept as numbers rather than CSS strings because the one-page check has to do
 * arithmetic with them: the height a page can actually hold is this height minus
 * the margins, and hardcoding that separately is how the check ended up
 * measuring against the wrong number and passing a two-page résumé.
 */
const PAGE_MM = { width: 210, height: 279.4 };
const MARGIN_MM = { top: 12, bottom: 11, left: 13, right: 13 };

/** The box the content actually gets, once the margins are taken out. */
const CONTENT_MM = {
  width: PAGE_MM.width - MARGIN_MM.left - MARGIN_MM.right,
  height: PAGE_MM.height - MARGIN_MM.top - MARGIN_MM.bottom,
};

const mm = (value) => `${value}mm`;

/** CSS pixels are 1/96in by definition, so this conversion is exact. */
const mmToPx = (value) => (value / 25.4) * 96;

// Print palette. The site is dark on purpose; a résumé is not. These are the
// hues from `src/styles.css` re-grounded for white paper: the site's ground
// becomes the ink, the greys sit in its jade hue at OKLCH lightness 0.40 and
// 0.50, and the accent is Dark cobalt, the same hue as the site's Light
// cobalt two rings down the `/aesthetic` wheel, since the pale one would all
// but vanish on paper. On white: text 14.98, secondary 9.16, muted 5.95,
// accent 6.27, all of which survive a cheap laser printer and a grayscale
// photocopy.
//
// The accent is spent in exactly one place, the section headings. An earlier
// layout also coloured the role, the company and the bullet markers, and a page
// where four things are blue has no colour that means anything.
const COLOR = {
  text: '#1a2a25',
  secondary: '#3d4b46',
  muted: '#586762',
  accent: '#0f63a5',
  rule: '#d0dad6',
};

const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
  );

/** Inline a woff2 as a data URI so the render needs no network and no system fonts. */
async function fontFace(family, file, weights) {
  const base64 = (await readFile(path.join(fontDir, file))).toString('base64');
  return `@font-face {
      font-family: '${family}';
      src: url(data:font/woff2;base64,${base64}) format('woff2');
      font-weight: ${weights};
      font-style: normal;
      font-display: block;
    }`;
}

/** A bullet with its `**…**` figures in bold — the only bold inside a job. */
function bulletHtml(line) {
  const runs = emphasis(line).map(({ text, strong }) =>
    strong ? `<strong>${escapeHtml(text)}</strong>` : escapeHtml(text)
  );
  return `<li>${runs.join('')}</li>`;
}

/**
 * The company leads, in bold, because it is what a skimming reader looks for
 * first; the title follows it on the same line rather than costing one of its
 * own. Dates keep the right edge to themselves, so they read as a column.
 */
function jobHtml(job) {
  return `<article class="job">
      <header class="entry-head">
        <h3><span class="company">${escapeHtml(job.company)}</span><span class="aside"
          >${escapeHtml(job.title)}</span><span class="aside muted">${escapeHtml(job.location)}</span></h3>
        <span class="period">${escapeHtml(formatPeriod(job))}</span>
      </header>
      <ul class="bullets">${job.bullets.map(bulletHtml).join('')}</ul>
    </article>`;
}

/** Same frame as a job, with the stack where the dates would be. */
function projectHtml(project) {
  return `<article class="project">
      <header class="entry-head">
        <h3><span class="company">${escapeHtml(project.name)}</span>${project.links
          .map((link) => `<span class="aside muted">${escapeHtml(link)}</span>`)
          .join('')}</h3>
        <span class="period">${project.stack.map(escapeHtml).join(' &middot; ')}</span>
      </header>
      <p class="project-summary">${escapeHtml(project.summary)}</p>
    </article>`;
}

function sectionHtml(title, body) {
  return `<section class="block">
      <h2>${escapeHtml(title)}</h2>
      ${body}
    </section>`;
}

export async function buildHtml() {
  const fonts = [
    await fontFace('Source Serif 4', 'source-serif-4-latin-var.woff2', '200 900'),
    await fontFace('Source Sans 3', 'source-sans-3-latin-var.woff2', '200 900'),
  ].join('\n');

  const { contact, education } = RESUME;

  const experience = RESUME.experience.map(jobHtml).join('');
  const projects = RESUME.projects.map(projectHtml).join('');

  const skills = `<dl class="skills">${RESUME.skills
    .map(
      (category) =>
        `<dt>${escapeHtml(category.name)}</dt><dd>${escapeHtml(category.skills.join(', '))}</dd>`
    )
    .join('')}</dl>`;

  const educationHtml = `<p class="degree"><strong>${escapeHtml(education.degree)}</strong>
      <span class="secondary">&mdash; ${escapeHtml(education.institution)}, ${education.year}</span
      ><span class="muted">${education.honors.map((honor) => ` &middot; ${escapeHtml(honor)}`).join('')}</span></p>
    <p class="secondary certs">${education.certifications.map(escapeHtml).join(' &middot; ')}</p>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(RESUME.name)} — ${escapeHtml(RESUME.role)}</title>
    <style>
      ${fonts}

      * { margin: 0; padding: 0; box-sizing: border-box; }

      body {
        font-family: 'Source Sans 3', sans-serif;
        font-size: 9.6pt;
        line-height: 1.3;
        color: ${COLOR.text};
        background: #fff;
        -webkit-font-smoothing: antialiased;
      }

      /* ----- Masthead ----- */
      .name {
        font-family: 'Source Serif 4', serif;
        font-weight: 600;
        font-size: 23pt;
        line-height: 1.05;
      }
      .role {
        font-size: 10.5pt;
        color: ${COLOR.secondary};
        letter-spacing: 0.06em;
        text-transform: uppercase;
        margin-top: 1.4mm;
      }
      /* Two deliberate lines — details, then links — rather than one long line
         left to wrap wherever it lands. The wrap point moved with the length of
         the email address and split a URL across lines; this is the same two
         lines every time. */
      .contact {
        margin-top: 2.4mm;
        padding-top: 2mm;
        border-top: 0.5pt solid ${COLOR.rule};
        font-size: 9pt;
        color: ${COLOR.secondary};
      }
      .contact p + p { margin-top: 0.8mm; color: ${COLOR.muted}; }
      .contact span + span::before {
        content: ' · ';
        color: ${COLOR.muted};
      }

      /* ----- Summary ----- */
      /* Two lines, and only what the experience below can back. */
      .summary {
        margin-top: 3.4mm;
        font-size: 9.8pt;
        color: ${COLOR.secondary};
      }

      /* ----- Section frame ----- */
      .block { margin-top: 4.4mm; }
      .block h2 {
        font-size: 9.5pt;
        font-weight: 600;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: ${COLOR.accent};
        padding-bottom: 1.2mm;
        border-bottom: 0.5pt solid ${COLOR.rule};
        margin-bottom: 2.2mm;
      }

      /* ----- Experience and projects ----- */
      .job, .project { margin-bottom: 3.2mm; }
      .job:last-child, .project:last-child { margin-bottom: 0; }
      .entry-head {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 6mm;
      }
      .entry-head h3 { font-size: 10pt; font-weight: 400; color: ${COLOR.secondary}; }
      .company { font-size: 10.8pt; font-weight: 650; color: ${COLOR.text}; }
      .aside::before { content: ' · '; color: ${COLOR.muted}; }
      .period {
        font-size: 9pt;
        color: ${COLOR.muted};
        white-space: nowrap;
      }
      .bullets { margin: 1.2mm 0 0 4.4mm; }
      .bullets li { margin-bottom: 0.5mm; padding-left: 0.8mm; }
      .bullets li::marker { color: ${COLOR.muted}; }
      .bullets strong { font-weight: 650; color: ${COLOR.text}; }
      .project-summary { margin-top: 0.8mm; color: ${COLOR.text}; }

      /* ----- Skills ----- */
      .skills {
        display: grid;
        grid-template-columns: 26mm 1fr;
        row-gap: 0.8mm;
        column-gap: 3mm;
        font-size: 9.4pt;
      }
      .skills dt {
        font-weight: 600;
        color: ${COLOR.text};
      }
      .skills dd { color: ${COLOR.secondary}; }

      /* ----- Education ----- */
      .degree { font-size: 10pt; }
      .certs { font-size: 9.4pt; margin-top: 0.8mm; }
      .secondary { color: ${COLOR.secondary}; }
      .muted { color: ${COLOR.muted}; }
    </style>
  </head>
  <body>
    <h1 class="name">${escapeHtml(RESUME.name)}</h1>
    <p class="role">${escapeHtml(RESUME.role)}</p>
    <div class="contact">
      <p><span>${escapeHtml(contact.email)}</span><span>${escapeHtml(contact.phone)}</span
        ><span>${escapeHtml(contact.location)}</span></p>
      <p><span>${escapeHtml(contact.linkedin)}</span><span>${escapeHtml(contact.github)}</span
        ><span>${escapeHtml(contact.site)}</span></p>
    </div>

    <p class="summary">${escapeHtml(RESUME.summary)}</p>

    <!-- Experience directly under the summary: it is what a reader skims for
         first, and a skills block above it pushed it a third of the way down. -->
    ${sectionHtml('Experience', experience)}
    ${sectionHtml('Projects', projects)}
    ${sectionHtml('Skills', skills)}
    ${sectionHtml('Education', educationHtml)}
  </body>
</html>`;
}

/** Render the résumé to PDF bytes. */
async function render() {
  const html = await buildHtml();
  const browser = await chromium.launch();
  try {
    // The viewport is sized to the printed content box, not left at the default
    // 1280px. Line wrapping — and therefore height — depends on width, so a
    // measurement taken at 1280px describes a layout that is never printed: the
    // first version of this guard measured a wide page, found room to spare, and
    // wrote a two-page PDF.
    const page = await browser.newPage({
      viewport: {
        width: Math.round(mmToPx(CONTENT_MM.width)),
        height: Math.round(mmToPx(CONTENT_MM.height)),
      },
    });
    await page.emulateMedia({ media: 'print' });
    await page.setContent(html, { waitUntil: 'load' });
    // The faces are data URIs, so nothing is fetched — but they are still
    // decoded asynchronously, and a page that prints mid-decode falls back to
    // Georgia and lays out differently.
    await page.evaluate(() => document.fonts.ready);

    // Measured before rendering, so a résumé that has outgrown its page fails
    // here rather than being written out and noticed by a recruiter.
    const overflowMm = await measureOverflow(page);
    if (overflowMm > 0) {
      throw new Error(
        `The résumé overflows its page by ${overflowMm.toFixed(1)}mm and would print ` +
          `on two sheets.\nIt is designed as one. Trim a bullet in ` +
          `src/app/resume/resume.data.ts, or tighten\nthe type scale in this script if the ` +
          `content genuinely warrants the room.`
      );
    }

    // Awaited rather than returned: the `finally` below closes the browser the
    // moment this block yields a value, and handing back an unresolved promise
    // tears Chromium down mid-print ("Protocol error (Page.printToPDF)").
    const pdf = await page.pdf({
      width: mm(PAGE_MM.width),
      height: mm(PAGE_MM.height),
      margin: {
        top: mm(MARGIN_MM.top),
        bottom: mm(MARGIN_MM.bottom),
        left: mm(MARGIN_MM.left),
        right: mm(MARGIN_MM.right),
      },
      printBackground: true,
    });
    return pdf;
  } finally {
    await browser.close();
  }
}

/**
 * How far the content spills past the single page it is allowed, in millimetres.
 * Zero or less means it fits.
 *
 * Measured against the *content box* — the page less its margins — which is the
 * distinction that matters: an earlier version of this compared against the full
 * page height, decided a résumé 6px too tall was fine, and wrote a two-page PDF
 * while reporting success. Playwright applies the margins itself, so they never
 * appear in the document's own scroll height and have to be subtracted here.
 *
 * CSS pixels are 1/96in by definition, which is what makes the conversion exact
 * rather than a calibration.
 */
async function measureOverflow(page) {
  // The bottom edge of the lowest block, rather than `scrollHeight`: that is
  // clamped to the viewport, so it can never report *less* than a full page and
  // a résumé that fits reads as 0.1mm of overflow forever.
  const usedPx = await page.evaluate(() =>
    Math.max(0, ...Array.from(document.body.children, (el) => el.getBoundingClientRect().bottom))
  );
  return ((usedPx - mmToPx(CONTENT_MM.height)) / 96) * 25.4;
}

const relative = (file) => path.relative(process.cwd(), file);

/**
 * Say *where* the two documents stop agreeing, not just that they do.
 *
 * The old byte-comparison gate could not do this — a diff of two Flate streams
 * is noise — so it printed a list of possible causes and left you to guess.
 * Comparing text means the failure can name the sentence that moved, which is
 * usually enough to tell "I edited the résumé and forgot to re-render" from
 * "something about the layout changed" without opening either file.
 */
function describeDrift(committedText, renderedText, committedPages, renderedPages) {
  if (committedPages !== renderedPages) {
    return (
      `The page geometry changed:\n` +
      `  committed: ${committedPages}\n` +
      `  rendered:  ${renderedPages}\n` +
      `(width x height in points, one entry per page.)`
    );
  }

  // Found on the whitespace-free form the gate compares, then mapped back onto
  // the readable text so the excerpt still has its spaces.
  const committedKey = comparable(committedText);
  const renderedKey = comparable(renderedText);
  let at = 0;
  while (
    at < committedKey.length &&
    at < renderedKey.length &&
    committedKey[at] === renderedKey[at]
  ) {
    at += 1;
  }

  const readableIndex = (text) => {
    let seen = 0;
    for (let i = 0; i < text.length; i += 1) {
      if (!/\s/.test(text[i])) {
        if (seen === at) {
          return i;
        }
        seen += 1;
      }
    }
    return text.length;
  };

  // A window either side of the divergence: enough left-hand context to locate
  // the sentence, enough right-hand text to see what replaced what.
  const window = (text) => {
    const from = readableIndex(text);
    return text.slice(Math.max(0, from - 40), from + 60).replace(/\s+/g, ' ');
  };

  return (
    `They first differ ${at} characters in (not counting spaces):\n` +
    `  committed: …${window(committedText)}…\n` +
    `  rendered:  …${window(renderedText)}…`
  );
}

async function main() {
  const checking = process.argv.includes('--check');
  const rendered = await render();

  if (!checking) {
    await writeFile(outputPath, rendered);
    process.stdout.write(`wrote ${relative(outputPath)} (${rendered.length} bytes)\n`);
    return;
  }

  let committed;
  try {
    committed = await readFile(outputPath);
  } catch {
    process.stderr.write(
      `${relative(outputPath)} is missing.\nRun \`npm run resume:pdf\` and commit the result.\n`
    );
    process.exit(1);
  }

  const committedText = extractText(committed);
  const renderedText = extractText(rendered);
  const committedPages = pageSizes(committed).join(', ');
  const renderedPages = pageSizes(rendered).join(', ');

  if (comparable(committedText) === comparable(renderedText) && committedPages === renderedPages) {
    process.stdout.write(`${relative(outputPath)} is up to date.\n`);
    return;
  }

  process.stderr.write(
    `\n${relative(outputPath)} does not match src/app/resume/resume.data.ts.\n\n` +
      `Run \`npm run resume:pdf\` and commit the regenerated file.\n\n` +
      `Two things cause this, and both are fixed the same way:\n` +
      `  1. The résumé data changed and the PDF was not re-rendered. The usual one.\n` +
      `  2. This script's layout changed what the page says or how big it is.\n\n` +
      `${describeDrift(committedText, renderedText, committedPages, renderedPages)}\n`
  );
  process.exit(1);
}

// Only when run as a command. `buildHtml` is exported so the layout can be
// loaded and inspected without a render writing over the committed PDF as a
// side effect of the import.
if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}
