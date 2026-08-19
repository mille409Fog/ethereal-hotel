/**
 * Builds Floor −2's sentence into a distance-field atlas.
 *
 *     npm run build:sentence              # re-render public/aubade-sentence.png
 *     npm run build:sentence -- --check   # fail if the committed atlas is stale
 *     npm run build:sentence -- --fonts   # re-fetch the subsetted faces first
 *
 * ## The one asset in a piece that says it has no asset pipeline
 *
 * AUBADE's opening paragraph says "no meshes, no asset pipeline — an interior that
 * exists only as mathematics", and this script writes a PNG. The two are reconciled
 * by what is in the file rather than by an exception: the atlas is not a picture of
 * some writing, it is a **sampled distance function**, which is the same
 * construction every wall, cask and lens in this building is made of. The shader
 * does not composite it; it evaluates it, mixes two of them, and takes a contour.
 * A visitor is looking at arithmetic, and the only difference between this
 * arithmetic and `mapLibrary`'s is that this one was too irregular to write down in
 * closed form and had to be tabulated.
 *
 * That is also the honest answer to why there is no runtime font here. A face is a
 * program for making outlines and a shaper is a program for ordering them, and both
 * would have to run before the first frame on a route whose second non-negotiable is
 * that it costs the main site nothing. Tabulating the answer at build time moves all
 * of it off the visitor's machine and into this file.
 *
 * ## Chromium is the shaper, and that is the whole reason it is here
 *
 * AUBADE's phase note is blunt about the risk — "get the Arabic and Devanagari
 * shaping right or cut those two; broken shaping is an insult, not an effect" — and
 * the cheapest way to be right about shaping is not to implement it. Playwright's
 * Chromium is already a dependency of `verify:shader`, and it lays out text with
 * HarfBuzz: the same engine the browsers a reader of that script actually uses. So
 * this script types the line into a canvas and photographs the result, and every
 * question of ligature, direction, joining and reordering is answered by the same
 * code that would answer it if the sentence were an ordinary paragraph on an
 * ordinary page.
 *
 * `sentence.ts` still ships only unjoined scripts, and that is a decision about
 * *authorship* rather than about this file — see its header, and
 * `docs/aubade-credits.md`. What this arrangement buys is that adding the other four
 * is a font and a line of data rather than a shaping engine.
 *
 * ## Why the committed atlas is not compared byte for byte
 *
 * `resume:check` learned this the hard way and its lesson transfers exactly: Chromium
 * rasterises the same text differently on Windows and on Linux CI, because hinting
 * and antialiasing are platform decisions. So `--check` asserts the atlas's *shape* —
 * that it exists, that it is the size the constants in `sentence.ts` imply, and that
 * every tile has ink in it — rather than its bytes, which could never agree across
 * two machines and which re-rendering could never fix.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

import {
  ATLAS_SPREAD,
  ATLAS_TILE_HEIGHT,
  ATLAS_TILE_WIDTH,
  SENTENCE_ATLAS_PATH,
  SENTENCE_SCRIPTS,
} from '../src/aubade/sentence.ts';
import { encodeField, encodePng, pngSize } from './sentence-field.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fontDirectory = path.join(repoRoot, 'scripts', 'library-fonts');
const atlasPath = path.join(repoRoot, 'public', path.basename(SENTENCE_ATLAS_PATH));

const hasFlag = (name) => process.argv.includes(`--${name}`);

/**
 * How many rendered pixels go into one tile pixel.
 *
 * Four, which is where the returns stop: at two the diagonal stems still ripple at
 * the pixel pitch, and at eight the render is four times the memory for a difference
 * that does not survive the eight-bit encoding. See `sentence-field.mjs`, which
 * explains why averaging finished distances is legitimate and averaging coverage is
 * not.
 */
const SUPERSAMPLE = 4;

/** The weight the inscription is cut at. Heavier than body text, as carving is. */
const WEIGHT = 500;

/**
 * The margin around the line, in rendered pixels — exactly the spread.
 *
 * Not decoration. The field has to be able to run its full spread away from the
 * outermost stroke without meeting the edge of the tile, because a field that clamps
 * against the tile boundary morphs into its neighbour's boundary rather than into
 * its neighbour's letters.
 */
const MARGIN = ATLAS_SPREAD * SUPERSAMPLE;

const RENDER_WIDTH = ATLAS_TILE_WIDTH * SUPERSAMPLE;
const RENDER_HEIGHT = ATLAS_TILE_HEIGHT * SUPERSAMPLE;

/* ---------------------------------------------------------------------------
 * The faces
 * ------------------------------------------------------------------------- */

/**
 * Fetch each script's face, subsetted by Google Fonts to exactly its own sentence.
 *
 * The `text=` parameter is what makes this vendorable at all. A full Noto Serif is
 * about 400KB and a full Noto Serif SC is nearer twenty megabytes; asked for one
 * line, the same endpoint returns two or three kilobytes containing that line's
 * glyphs and the layout tables that reach them. Four of those is a directory smaller
 * than one of the résumé's two faces, and it can be committed without apology.
 *
 * The browser user-agent is required and is not a trick: the endpoint serves woff2
 * only to clients that say they can read it, and Node's default agent gets TrueType.
 */
async function refreshFonts() {
  await mkdir(fontDirectory, { recursive: true });

  const agent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

  const sources = [];

  for (const script of SENTENCE_SCRIPTS) {
    const family = script.family.replace(/ /g, '+');
    const url =
      `https://fonts.googleapis.com/css2?family=${family}:wght@${WEIGHT}` +
      `&text=${encodeURIComponent(script.text)}`;

    const css = await fetch(url, { headers: { 'user-agent': agent } });
    if (!css.ok) {
      throw new Error(`Google Fonts refused ${script.family}: ${css.status}`);
    }

    const stylesheet = await css.text();
    const match = /src:\s*url\((?<href>[^)]+)\)\s*format\('woff2'\)/.exec(stylesheet);
    if (match === null) {
      throw new Error(`No woff2 in the stylesheet for ${script.family}.`);
    }

    const face = await fetch(match.groups.href, { headers: { 'user-agent': agent } });
    if (!face.ok) {
      throw new Error(`Could not fetch ${script.family}'s subset: ${face.status}`);
    }

    const bytes = Buffer.from(await face.arrayBuffer());
    await writeFile(path.join(fontDirectory, `${script.id}.woff2`), bytes);
    sources.push(`${script.id}  ${script.family} ${WEIGHT}  ${bytes.length} bytes  ${url}`);

    process.stdout.write(`fetched ${script.id}.woff2 (${bytes.length} bytes)\n`);
  }

  await writeFile(path.join(fontDirectory, 'SOURCES.txt'), `${sources.join('\n')}\n`);
}

/** Every vendored face, as a data URL the page can declare an `@font-face` from. */
async function loadFonts() {
  const faces = [];

  for (const script of SENTENCE_SCRIPTS) {
    const file = path.join(fontDirectory, `${script.id}.woff2`);
    let bytes;
    try {
      bytes = await readFile(file);
    } catch {
      throw new Error(
        `scripts/library-fonts/${script.id}.woff2 is missing. Run ` +
          `\`npm run build:sentence -- --fonts\` to fetch the subsetted faces.`
      );
    }

    faces.push({
      id: script.id,
      // Named for the script rather than for the face. Three of the four lines are
      // cut from Noto Serif, and each is a *different subset* of it — one holding
      // the English glyphs, one the Greek, one the Russian. Registered under the
      // family's real name they would be three faces with identical family, weight
      // and style, which the font matcher resolves by taking the last one added: the
      // English and Greek lines would come back drawn from the Russian subset, which
      // has none of their glyphs. It fails as tofu or as nothing at all, in a file
      // nobody opens, so it is worth a distinct name rather than a comment alone.
      family: `aubade-${script.id}`,
      dataUrl: `data:font/woff2;base64,${bytes.toString('base64')}`,
    });
  }

  return faces;
}

/* ---------------------------------------------------------------------------
 * The render
 * ------------------------------------------------------------------------- */

/**
 * Lay out and rasterise every line, in one page, at one size.
 *
 * **One size for all four, and that is the composition.** The obvious alternative is
 * to justify each line to the band, and it is wrong: the Russian line is two thirds
 * the length of the English one, so justifying would draw its letters half again as
 * large, and the dissolve between them would be a change of size rather than a change
 * of hand. Fitting the *longest* line and centring the rest keeps every letterform in
 * the room at one scale, and what the morph then shows is the sentence getting
 * shorter and longer as it migrates — which is a true fact about the four languages
 * and a better one to be showing.
 *
 * @param page A blank Playwright page.
 * @param faces The vendored subsets, as data URLs.
 * @returns One base64 coverage bitmap per script, in `SENTENCE_SCRIPTS` order.
 */
async function rasterise(page, faces) {
  return page.evaluate(
    async ({ scripts, faces, width, height, margin, weight }) => {
      for (const face of faces) {
        const loaded = await new FontFace(face.family, `url(${face.dataUrl})`).load();
        document.fonts.add(loaded);
      }
      await document.fonts.ready;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      const usableWidth = width - margin * 2;
      const usableHeight = height - margin * 2;

      /** The line's metrics at a reference size, for the fitting pass below. */
      const measure = (script, size) => {
        ctx.font = `${weight} ${size}px "${script.family}"`;
        ctx.letterSpacing = `${script.tracking}em`;
        const box = ctx.measureText(script.text);
        return {
          width: box.width,
          ascent: box.actualBoundingBoxAscent,
          descent: box.actualBoundingBoxDescent,
        };
      };

      // One size for all four: the largest that fits every line in both axes.
      const reference = 200;
      let size = Infinity;
      for (const script of scripts) {
        const box = measure(script, reference);
        const byWidth = (usableWidth / box.width) * reference;
        const byHeight = (usableHeight / (box.ascent + box.descent)) * reference;
        size = Math.min(size, byWidth, byHeight);
      }
      size = Math.floor(size);

      const tiles = [];

      for (const script of scripts) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);

        ctx.font = `${weight} ${size}px "${script.family}"`;
        ctx.letterSpacing = `${script.tracking}em`;
        ctx.direction = script.direction;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';

        // Centred on the tile's optical middle rather than on the baseline, so that
        // four lines with four different ascender and descender depths sit on one
        // line through the band. A shared baseline would put the Hebrew, which has
        // almost no ascender, visibly high in its tile.
        const box = measure(script, size);
        ctx.fillText(script.text, width / 2, height / 2 + (box.ascent - box.descent) / 2);

        const pixels = ctx.getImageData(0, 0, width, height).data;
        const coverage = new Uint8Array(width * height);
        for (let i = 0; i < coverage.length; i += 1) {
          coverage[i] = pixels[i * 4];
        }

        // Handed back as base64 rather than as an array: a 4096×512 coverage bitmap
        // is two million numbers, and Playwright serialises an array of those as
        // JSON. The chunk is small because it is spread into an argument list, and
        // an argument list is a stack frame.
        let binary = '';
        const step = 0x2000;
        for (let i = 0; i < coverage.length; i += step) {
          binary += String.fromCharCode(...coverage.subarray(i, i + step));
        }
        tiles.push({ id: script.id, size, coverage: btoa(binary) });
      }

      return tiles;
    },
    {
      scripts: SENTENCE_SCRIPTS.map((script) => ({
        id: script.id,
        // The page-side name, matching the `@font-face` registered above rather than
        // the family in `sentence.ts` — see the note on `faces`.
        family: `aubade-${script.id}`,
        text: script.text,
        direction: script.direction,
        tracking: script.tracking,
      })),
      faces,
      width: RENDER_WIDTH,
      height: RENDER_HEIGHT,
      margin: MARGIN,
      weight: WEIGHT,
    }
  );
}

/* ---------------------------------------------------------------------------
 * The run
 * ------------------------------------------------------------------------- */

async function main() {
  if (hasFlag('fonts')) {
    await refreshFonts();
  }

  const faces = await loadFonts();
  const browser = await chromium.launch();

  let tiles;
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><meta charset="utf-8"><body></body>');
    tiles = await rasterise(page, faces);
  } finally {
    await browser.close();
  }

  const atlas = new Uint8Array(ATLAS_TILE_WIDTH * ATLAS_TILE_HEIGHT * tiles.length);
  const problems = [];

  tiles.forEach((tile, index) => {
    const coverage = Buffer.from(tile.coverage, 'base64');
    const field = encodeField(coverage, RENDER_WIDTH, RENDER_HEIGHT, {
      supersample: SUPERSAMPLE,
      spread: ATLAS_SPREAD,
    });

    // A tile with no ink in it is a font that did not load, and it is the failure
    // this whole script is most likely to have: a missing subset renders as the
    // browser's fallback, or as nothing at all, and either way the atlas is written
    // without complaint and the frieze comes out blank at every hour — which is
    // indistinguishable from the shuttered hour working correctly.
    // Just above the edge rather than well above it, and the difference matters. 128
    // is the contour; how far *past* 128 the middle of a stroke gets is set by the
    // stroke's width against the spread, not by whether anything was drawn. At this
    // size a stem is about five tile pixels across, so its centre reaches 0.5 + 2.5/64
    // of the range — code 138, and no higher. A threshold picked by eye at 140 called
    // four perfectly good tiles empty.
    const inked = field.reduce((count, value) => count + (value > 130 ? 1 : 0), 0);
    if (inked < field.length / 500) {
      problems.push(
        `The ${tile.id} tile came out with almost nothing in it (${inked} inked pixels). ` +
          `That is usually a subset that failed to load, in which case the line was ` +
          `drawn in a fallback face or not drawn at all.`
      );
    }

    atlas.set(field, index * field.length);
  });

  if (problems.length > 0) {
    for (const problem of problems) {
      process.stderr.write(`\n${problem}\n`);
    }
    process.exit(1);
  }

  const height = ATLAS_TILE_HEIGHT * tiles.length;
  const png = encodePng(atlas, ATLAS_TILE_WIDTH, height);

  if (hasFlag('check')) {
    let committed;
    try {
      committed = await readFile(atlasPath);
    } catch {
      process.stderr.write(`\n${path.relative(repoRoot, atlasPath)} is missing.\n\n`);
      process.exit(1);
    }

    const size = pngSize(committed);
    if (size === null || size.width !== ATLAS_TILE_WIDTH || size.height !== height) {
      process.stderr.write(
        `\nThe committed atlas is ${size === null ? 'not a PNG' : `${size.width}×${size.height}`}, ` +
          `but sentence.ts implies ${ATLAS_TILE_WIDTH}×${height}. Re-run ` +
          `\`npm run build:sentence\`.\n\n`
      );
      process.exit(1);
    }

    // Deliberately not a byte comparison — see the file comment, and `resume:check`,
    // which is where that lesson was paid for.
    process.stdout.write(`${path.relative(repoRoot, atlasPath)} is the shape it should be\n`);
    return;
  }

  await mkdir(path.dirname(atlasPath), { recursive: true });
  await writeFile(atlasPath, png);

  process.stdout.write(
    `wrote ${path.relative(repoRoot, atlasPath)} — ` +
      `${tiles.length} tiles at ${ATLAS_TILE_WIDTH}×${ATLAS_TILE_HEIGHT}, ` +
      `${(png.length / 1024).toFixed(1)}KB, type set at ${tiles[0].size}px\n`
  );
}

// Kept so an unreadable font directory reports itself rather than an unhandled
// rejection with a stack trace into Playwright.
main().catch((error) => {
  process.stderr.write(`\n${error.message}\n\n`);
  process.exit(1);
});
