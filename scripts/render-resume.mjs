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
 * print HTML as data URIs rather than fetched from Google Fonts the way
 * `src/styles.css` does. Two reasons, and the second is the load-bearing one:
 * a build gate should not need the network, and — more importantly — text
 * metrics decide the bytes. Rendering with whatever fonts happen to be installed
 * would lay the page out one way on the author's Windows box and another way on
 * ubuntu CI, so `resume:check` would fail on every push for reasons that have
 * nothing to do with the résumé. Embedding the faces makes the render identical
 * everywhere. Their OFL licences sit beside them, as that licence requires.
 */
import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { RESUME, formatPeriod } from '../src/app/resume/resume.data.ts';
import { normalizePdf } from './pdf-normalize.mjs';

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
const MARGIN_MM = { top: 13, bottom: 12, left: 15, right: 15 };

/** The box the content actually gets, once the margins are taken out. */
const CONTENT_MM = {
  width: PAGE_MM.width - MARGIN_MM.left - MARGIN_MM.right,
  height: PAGE_MM.height - MARGIN_MM.top - MARGIN_MM.bottom,
};

const mm = (value) => `${value}mm`;

/** CSS pixels are 1/96in by definition, so this conversion is exact. */
const mmToPx = (value) => (value / 25.4) * 96;

// Print palette. The site is near-black on purpose; a résumé is not. These are
// the same hues from `src/styles.css` re-grounded for white paper — the blood
// accent unchanged, the text darkened to something that survives a cheap laser
// printer and a grayscale photocopy.
const COLOR = {
  text: '#1c191b',
  secondary: '#4a4045',
  muted: '#6b5f64',
  blood: '#9d2235',
  rule: '#d8ced2',
};

const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
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

function jobHtml(job) {
  const bullets = job.bullets.map((line) => `<li>${escapeHtml(line)}</li>`).join('');
  return `<article class="job">
      <header class="job-head">
        <h3>${escapeHtml(job.title)}</h3>
        <span class="period">${escapeHtml(formatPeriod(job))}</span>
      </header>
      <p class="company">${escapeHtml(job.company)}</p>
      <ul class="bullets">${bullets}</ul>
      <p class="tech">${job.tech.map(escapeHtml).join(' &middot; ')}</p>
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
    await fontFace('Cinzel', 'cinzel-latin-var.woff2', '400 900'),
    await fontFace('Crimson Pro', 'crimson-pro-latin-var.woff2', '200 900'),
  ].join('\n');

  const { contact, education } = RESUME;

  const experience = RESUME.experience.map(jobHtml).join('');

  const skills = `<dl class="skills">${RESUME.skills
    .map(
      (category) =>
        `<dt>${escapeHtml(category.name)}</dt><dd>${escapeHtml(category.skills.join(', '))}</dd>`
    )
    .join('')}</dl>`;

  const educationHtml = `<p class="degree"><strong>${escapeHtml(education.degree)}</strong>
      <span class="muted">&mdash; ${escapeHtml(education.institution)}, ${education.year}</span></p>
    <p class="muted certs">${education.certifications.map(escapeHtml).join(' &middot; ')}</p>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(RESUME.name)} — ${escapeHtml(RESUME.role)}</title>
    <style>
      ${fonts}

      * { margin: 0; padding: 0; box-sizing: border-box; }

      body {
        font-family: 'Crimson Pro', Georgia, serif;
        font-size: 10pt;
        line-height: 1.42;
        color: ${COLOR.text};
        background: #fff;
        -webkit-font-smoothing: antialiased;
      }

      /* ----- Masthead ----- */
      .name {
        font-family: 'Cinzel', serif;
        font-weight: 600;
        font-size: 25pt;
        line-height: 1.05;
        letter-spacing: 0.02em;
      }
      .role {
        font-size: 11.5pt;
        color: ${COLOR.blood};
        letter-spacing: 0.06em;
        text-transform: uppercase;
        margin-top: 2.5mm;
      }
      /* Two deliberate lines — details, then links — rather than one long line
         left to wrap wherever it lands. The wrap point moved with the length of
         the email address and split a URL across lines; this is the same two
         lines every time. */
      .contact {
        margin-top: 3mm;
        padding-top: 2.6mm;
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
      .summary {
        margin-top: 4.5mm;
        font-size: 10pt;
        color: ${COLOR.secondary};
      }
      .seeking {
        margin-top: 1.8mm;
        font-size: 9pt;
        color: ${COLOR.muted};
      }
      .seeking strong { color: ${COLOR.secondary}; font-weight: 600; }

      /* ----- Section frame ----- */
      .block { margin-top: 4.4mm; }
      .block h2 {
        font-family: 'Cinzel', serif;
        font-size: 9.5pt;
        font-weight: 600;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: ${COLOR.blood};
        padding-bottom: 1.2mm;
        border-bottom: 0.5pt solid ${COLOR.rule};
        margin-bottom: 3mm;
      }

      /* ----- Experience ----- */
      .job { margin-bottom: 3.6mm; }
      .job:last-child { margin-bottom: 0; }
      .job-head {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 6mm;
      }
      .job-head h3 { font-size: 11pt; font-weight: 600; }
      .period {
        font-size: 8.8pt;
        color: ${COLOR.muted};
        white-space: nowrap;
      }
      .company {
        font-size: 9.6pt;
        color: ${COLOR.blood};
        margin-top: 0.3mm;
      }
      .bullets { margin: 1.6mm 0 0 4.6mm; }
      .bullets li { margin-bottom: 0.75mm; padding-left: 0.6mm; }
      .bullets li::marker { color: ${COLOR.blood}; }
      .tech {
        margin-top: 1.4mm;
        font-size: 8.6pt;
        color: ${COLOR.muted};
        letter-spacing: 0.015em;
      }

      /* ----- Skills ----- */
      .skills {
        display: grid;
        grid-template-columns: 26mm 1fr;
        row-gap: 1.5mm;
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
      .certs { font-size: 9pt; margin-top: 0.8mm; }
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
    <p class="seeking"><strong>Seeking:</strong> ${escapeHtml(RESUME.preferredRoles.join(', '))}</p>

    ${sectionHtml('Experience', experience)}
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

  if (normalizePdf(committed).equals(normalizePdf(rendered))) {
    process.stdout.write(`${relative(outputPath)} is up to date.\n`);
    return;
  }

  process.stderr.write(
    `\n${relative(outputPath)} does not match src/app/resume/resume.data.ts.\n\n` +
      `Run \`npm run resume:pdf\` and commit the regenerated file.\n\n` +
      `Three things cause this, and all three are fixed the same way:\n` +
      `  1. The résumé data changed and the PDF was not re-rendered. The usual one.\n` +
      `  2. Playwright — and with it Chromium — was upgraded. The PDF embeds its\n` +
      `     renderer version, so it genuinely is stale; regenerating is correct.\n` +
      `  3. This script's layout or the fonts in scripts/resume-fonts/ changed.\n\n`
  );
  process.exit(1);
}

// Only when run as a command. `buildHtml` is exported so the layout can be
// loaded and inspected without a render writing over the committed PDF as a
// side effect of the import.
if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}
