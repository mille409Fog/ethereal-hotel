/**
 * Renders the social-preview and favicon set from one definition of the mark.
 *
 * These are build *inputs*, not build outputs: the four files this writes are
 * committed under `public/` and shipped as-is. The script exists so the mark
 * has a source — regenerating it is a two-second edit here rather than an
 * archaeology exercise in a binary — and so the OG card cannot drift from the
 * palette it is supposed to be quoting. Every colour below is read from
 * `src/styles.css`'s token block by hand; if that block changes, change these.
 *
 * It renders through the Playwright Chromium that the a11y run already
 * installs rather than adding an image dependency. The card's type is the
 * site's own: the same woff2 files `src/styles.css` serves and the résumé
 * embeds, inlined from `scripts/resume-fonts/`, so the card cannot be set in a
 * different cut of the face than the page, and generating it needs no network.
 *
 * Usage: node scripts/gen-social-assets.mjs
 */
import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(scriptsDir, '..', 'public');
const fontDir = path.join(scriptsDir, 'resume-fonts');

// Mirrors src/styles.css :root. Kept as plain values rather than parsed out of
// the stylesheet: this script runs by hand, and a parser would be more code
// than the thing it parses.
const COLOR = {
  bg: '#1a2a25',
  border: '#3a4c46',
  text: '#e7f6f0',
  textSecondary: '#b8c9c2',
  textMuted: '#99a9a3',
  accent: '#94c6f8',
  accentText: '#94c6f8',
};

/**
 * The mark: one disc of the accent on a tile of the ground. A moon over still
 * water, the page's own two colours and nothing else.
 *
 * It replaced a faceted diamond, the ornament the old gothic dividers were
 * built from, which kept the vampire's hotel in the tab after the page had
 * left it. A circle has no corners and no direction, and at 16px it is the
 * one shape that cannot turn into a smudge.
 *
 * The two colours split the DoD's "survives a dark browser chrome" between
 * them. In a dark tab strip the tile all but vanishes and the pale disc carries
 * the mark on its own; in a light one the dark tile does. The disc is 0.6 of
 * the tile across, large enough to be a shape at 16px rather than a dot, and
 * small enough to leave a margin of ground round it at 180px.
 */
function iconSvg(radius) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect width="64" height="64" rx="${radius}" fill="${COLOR.bg}"/>
  <circle cx="32" cy="32" r="19.2" fill="${COLOR.accent}"/>
</svg>`;
}

/** Inline a vendored woff2 as an @font-face, as `render-resume.mjs` does. */
async function fontFace(family, file) {
  const base64 = (await readFile(path.join(fontDir, file))).toString('base64');
  return `@font-face {
        font-family: '${family}';
        src: url(data:font/woff2;base64,${base64}) format('woff2');
        font-weight: 200 900;
        font-display: block;
      }`;
}

const FONTS = [
  await fontFace('Source Serif 4', 'source-serif-4-latin-var.woff2'),
  await fontFace('Source Sans 3', 'source-sans-3-latin-var.woff2'),
].join('\n');

// Rounded for the tab strip and the SVG. Square for apple-touch: iOS applies
// its own mask, so a pre-rounded source is clipped twice and the alpha in the
// corners it leaves behind composites to black on the home screen.
const ICON_SVG = iconSvg(14);
const APPLE_SVG = iconSvg(0);

const toDataUri = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
const iconDataUri = toDataUri(ICON_SVG);
const appleDataUri = toDataUri(APPLE_SVG);

/**
 * The 1200×630 card. The hero's type scale on the plain ground, with the
 * accent used once, on the role: the page's own rule of one accent, sparingly.
 */
const OG_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      ${FONTS}

      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        width: 1200px;
        height: 630px;
        background: ${COLOR.bg};
        color: ${COLOR.text};
        font-family: 'Source Sans 3', sans-serif;
        display: flex;
        flex-direction: column;
        justify-content: center;
        padding: 0 88px;
        position: relative;
        overflow: hidden;
      }
      h1 {
        font-family: 'Source Serif 4', serif;
        font-weight: 600;
        font-size: 92px;
        letter-spacing: -0.01em;
        line-height: 1.05;
      }
      .role {
        font-size: 33px;
        color: ${COLOR.accentText};
        margin-top: 14px;
      }
      .claim {
        font-size: 26px;
        color: ${COLOR.textSecondary};
        margin-top: 44px;
        padding-top: 30px;
        border-top: 1px solid ${COLOR.border};
        max-width: 720px;
      }
      .url {
        position: absolute;
        left: 88px;
        bottom: 52px;
        font-size: 20px;
        color: ${COLOR.textMuted};
        letter-spacing: 0.04em;
      }
    </style>
  </head>
  <body>
    <h1>Jacob Miller</h1>
    <p class="role">Senior Software Engineer</p>
    <p class="claim">Angular and FastAPI. A live operations dashboard reading real rows, and a booking flow the server actually validates.</p>
    <div class="url">jacobmiller.dev</div>
  </body>
</html>`;

/** Standalone page for the icon, sized by the caller. */
function iconHtml(size, uri) {
  return `<!doctype html>
<html><head><meta charset="utf-8" /><style>
  * { margin: 0; padding: 0; }
  body { width: ${size}px; height: ${size}px; }
  img { display: block; width: ${size}px; height: ${size}px; }
</style></head>
<body><img src="${uri}" /></body></html>`;
}

/**
 * Pack RGBA buffers into a Windows .ico.
 *
 * Written out rather than pulled from npm because the format is 40 bytes of
 * header per image and the alternative is a transitive dependency tree in a
 * repo that pins and audits everything. Each entry is a legacy BMP/DIB, not a
 * PNG: PNG-in-ICO is well supported by browsers but not uniformly by Windows
 * shell surfaces, and this file is small enough that the compression is not
 * worth the compatibility question.
 */
function encodeIco(images) {
  const dibs = images.map(({ size, rgba }) => {
    const rowBits = Math.ceil(size / 8);
    const maskStride = Math.ceil(rowBits / 4) * 4;
    const xor = Buffer.alloc(size * size * 4);
    const and = Buffer.alloc(maskStride * size);

    // Both planes are stored bottom-up, which is why `y` is read in reverse.
    for (let y = 0; y < size; y++) {
      const srcRow = (size - 1 - y) * size * 4;
      for (let x = 0; x < size; x++) {
        const s = srcRow + x * 4;
        const d = (y * size + x) * 4;
        // RGBA from the canvas, BGRA into the DIB.
        xor[d] = rgba[s + 2];
        xor[d + 1] = rgba[s + 1];
        xor[d + 2] = rgba[s];
        xor[d + 3] = rgba[s + 3];
        // The AND mask is vestigial for 32bpp icons — modern renderers use the
        // alpha channel — but a renderer that does consult it should be told
        // the rounded corners are cut out, not painted black.
        if (rgba[s + 3] < 128) {
          and[y * maskStride + (x >> 3)] |= 0x80 >> (x & 7);
        }
      }
    }

    const header = Buffer.alloc(40);
    header.writeUInt32LE(40, 0); // biSize
    header.writeInt32LE(size, 4); // biWidth
    header.writeInt32LE(size * 2, 8); // biHeight — XOR and AND planes stacked
    header.writeUInt16LE(1, 12); // biPlanes
    header.writeUInt16LE(32, 14); // biBitCount
    header.writeUInt32LE(0, 16); // biCompression = BI_RGB
    header.writeUInt32LE(xor.length + and.length, 20); // biSizeImage

    return { size, data: Buffer.concat([header, xor, and]) };
  });

  const dir = Buffer.alloc(6 + dibs.length * 16);
  dir.writeUInt16LE(0, 0); // reserved
  dir.writeUInt16LE(1, 2); // type = icon
  dir.writeUInt16LE(dibs.length, 4);

  let offset = dir.length;
  dibs.forEach((dib, i) => {
    const e = 6 + i * 16;
    dir.writeUInt8(dib.size, e); // 256 would be written as 0; we never go that big
    dir.writeUInt8(dib.size, e + 1);
    dir.writeUInt8(0, e + 2); // palette size
    dir.writeUInt8(0, e + 3); // reserved
    dir.writeUInt16LE(1, e + 4); // planes
    dir.writeUInt16LE(32, e + 6); // bit count
    dir.writeUInt32LE(dib.data.length, e + 8);
    dir.writeUInt32LE(offset, e + 12);
    offset += dib.data.length;
  });

  return Buffer.concat([dir, ...dibs.map((d) => d.data)]);
}

/** Rasterise the mark to raw RGBA at `size`, via the page's own canvas. */
async function rasterise(page, size) {
  return page.evaluate(async ({ uri, size }) => {
    const img = new Image();
    img.src = uri;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, size, size);
    return Array.from(ctx.getImageData(0, 0, size, size).data);
  }, { uri: iconDataUri, size });
}

const browser = await chromium.launch();
const written = [];

try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });

  // --- The social card ------------------------------------------------------
  await page.setContent(OG_HTML, { waitUntil: 'load' });
  // The faces are data URIs, so nothing is fetched, but they still decode
  // asynchronously, and a card that screenshots mid-decode ships Georgia.
  await page.evaluate(() => document.fonts.ready);
  const ogPath = path.join(publicDir, 'og-image.png');
  await page.screenshot({ path: ogPath });
  written.push(ogPath);

  // --- The 180px apple-touch icon -------------------------------------------
  await page.setViewportSize({ width: 180, height: 180 });
  await page.setContent(iconHtml(180, appleDataUri));
  const applePath = path.join(publicDir, 'apple-touch-icon.png');
  await page.screenshot({ path: applePath, omitBackground: false });
  written.push(applePath);

  // --- The .ico -------------------------------------------------------------
  const sizes = [16, 32, 48];
  const images = [];
  for (const size of sizes) {
    images.push({ size, rgba: await rasterise(page, size) });
  }
  const icoPath = path.join(publicDir, 'favicon.ico');
  await writeFile(icoPath, encodeIco(images));
  written.push(icoPath);

  // --- The SVG --------------------------------------------------------------
  // Served as-is to browsers that prefer it, and the source the other three
  // were rasterised from, so they cannot disagree.
  const svgPath = path.join(publicDir, 'favicon.svg');
  await writeFile(svgPath, `${ICON_SVG}\n`);
  written.push(svgPath);
} finally {
  await browser.close();
}

for (const file of written) {
  process.stdout.write(`wrote ${path.relative(process.cwd(), file)}\n`);
}
