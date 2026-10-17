/**
 * Fetches the `/gallery` reproductions from Wikimedia Commons into
 * `public/gallery/`, as WebP.
 *
 * Like `gen-social-assets.mjs`, this writes build *inputs*: the images are
 * committed and served same-origin, so a visitor's browser never contacts
 * Wikimedia. The gallery adds no host to the list a visitor's browser talks
 * to, and a file renamed or deleted on Commons cannot break a deployed page. The script exists so every image has a recorded
 * source and can be regenerated, rather than being a binary nobody can
 * explain.
 *
 * It reads the list from `src/app/gallery/gallery.data.ts` (Node strips the
 * types, the way `render-resume.mjs` reads the résumé), so there is no second
 * manifest to drift. Before downloading anything it asks Commons for the
 * file's licence and refuses anything but public domain or CC0. The collection
 * is limited to painters dead more than seventy years so that this never
 * refuses, but the check is what makes "every image is public domain" a claim
 * the build has verified rather than one the data asserts.
 *
 * Encoding goes through the Playwright Chromium the e2e job already installs,
 * resizing on a canvas, so it adds no image dependency. It needs the network
 * and runs by hand; CI only checks the committed result
 * (`scripts/gallery.test.mjs`).
 *
 * Each painting is written several times: full size at LONG_EDGE, and a copy
 * at each of `SMALLER_EDGES` for `srcset`. The copies' names and sizes come
 * from `filesOf` in the data module, the same function the template and the
 * test read, and each copy is scaled from the downloaded original rather than
 * from the full-size WebP, so it is not a second generation of lossy encoding.
 *
 * At the end it prints each full-size file's pixel size. Copy any that changed
 * into `image.width`/`image.height`; the test fails until they agree. The
 * copies need no such step, since their sizes are derived.
 *
 * Usage: npm run gallery:fetch [-- --only <slug>]
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { COLOURS, filesOf } from '../src/app/gallery/gallery.data.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(repoRoot, 'public', 'gallery');

/**
 * The longer side, in pixels. Large enough that the "up close" reading on each
 * painting has detail to look at on a laptop screen; small enough that the
 * whole collection stays a few megabytes.
 */
const LONG_EDGE = 1400;
const QUALITY = 0.82;

/**
 * Commons serves thumbnails only at standard widths, so a request for exactly
 * LONG_EDGE may be refused or rounded. Asking for a width at least this large
 * and downscaling locally sidesteps that.
 */
const FETCH_WIDTH = 2000;

/** Wikimedia asks automated clients to identify themselves. */
const HEADERS = { 'User-Agent': 'jacobmiller.dev gallery fetch (https://jacobmiller.dev)' };

const ALLOWED_LICENCES = /^(public domain|pd|cc0)/i;

function readFlag(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

/** The Commons record for one file: licence, and a thumbnail URL. */
async function describe(commonsFile) {
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo' +
    `&iiprop=url|size|extmetadata&iiurlwidth=${FETCH_WIDTH}` +
    `&titles=${encodeURIComponent(`File:${commonsFile}`)}`;
  const response = await fetch(url, { headers: HEADERS });
  if (!response.ok) throw new Error(`Commons answered ${response.status} for ${commonsFile}`);
  const page = Object.values((await response.json()).query.pages)[0];
  const info = page.imageinfo?.[0];
  if (!info) throw new Error(`Commons has no file named "${commonsFile}".`);
  return {
    licence: info.extmetadata?.LicenseShortName?.value ?? '(none)',
    // A file narrower than FETCH_WIDTH has no thumbnail; use the original.
    source: info.thumburl ?? info.url,
  };
}

const only = readFlag('only');
const paintings = COLOURS.flatMap((colour) => colour.paintings).filter(
  (painting) => only === undefined || painting.slug === only
);
if (paintings.length === 0) {
  process.stderr.write(`No painting has the slug "${only}".\n`);
  process.exit(1);
}

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
const results = [];

try {
  for (const painting of paintings) {
    const { licence, source } = await describe(painting.image.commons);
    if (!ALLOWED_LICENCES.test(licence)) {
      throw new Error(
        `${painting.slug}: Commons lists "${painting.image.commons}" as "${licence}". ` +
          'Only public-domain or CC0 reproductions may be committed; choose another file.'
      );
    }

    const download = await fetch(source, { headers: HEADERS });
    if (!download.ok) throw new Error(`${painting.slug}: download failed (${download.status}).`);
    const bytes = Buffer.from(await download.arrayBuffer());
    const dataUrl = `data:${download.headers.get('content-type') ?? 'image/jpeg'};base64,${bytes.toString('base64')}`;

    const natural = await page.evaluate(async (url) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      return { width: image.naturalWidth, height: image.naturalHeight };
    }, dataUrl);
    const scale = Math.min(1, LONG_EDGE / Math.max(natural.width, natural.height));
    const full = {
      file: painting.image.file,
      width: Math.round(natural.width * scale),
      height: Math.round(natural.height * scale),
    };
    const targets = filesOf(full);

    const encoded = await page.evaluate(
      async ({ url, targets, quality }) => {
        const image = new Image();
        image.src = url;
        await image.decode();
        return targets.map(({ width, height }) => {
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext('2d');
          context.imageSmoothingQuality = 'high';
          context.drawImage(image, 0, 0, width, height);
          return canvas.toDataURL('image/webp', quality);
        });
      },
      { url: dataUrl, targets, quality: QUALITY }
    );

    let kb = 0;
    for (const [index, target] of targets.entries()) {
      if (!encoded[index].startsWith('data:image/webp')) {
        throw new Error(`${painting.slug}: this Chromium cannot encode WebP.`);
      }
      const webp = Buffer.from(encoded[index].split(',')[1], 'base64');
      await writeFile(path.join(outDir, target.file), webp);
      kb += Math.round(webp.length / 1024);
    }

    const stale = full.width !== painting.image.width || full.height !== painting.image.height;
    results.push({ ...full, slug: painting.slug, kb, stale });
    process.stdout.write(`${painting.slug}: ${licence}, ${targets.length} files, ${kb}KB\n`);
  }
} finally {
  await browser.close();
}

process.stdout.write('\nslug                       width  height  data\n');
for (const r of results) {
  process.stdout.write(
    `${r.slug.padEnd(26)} ${String(r.width).padStart(5)}  ${String(r.height).padStart(6)}  ` +
      `${r.stale ? 'UPDATE gallery.data.ts' : 'ok'}\n`
  );
}
const total = results.reduce((sum, r) => sum + r.kb, 0);
process.stdout.write(`\n${results.length} files, ${total}KB in all.\n`);
