/**
 * The committed `/gallery` reproductions agree with the data that names them.
 *
 *     npm run test:scripts
 *
 * The template reserves each frame from `image.width`/`image.height` before the
 * WebP arrives, so a size that drifted from the file is a layout shift on
 * every visit, and a missing file is a broken image under a full label. Neither
 * is visible to the unit tests, which run in jsdom and never load an image, so
 * the check lives here, where Node can read `public/`.
 *
 * The same holds for the smaller copies `srcset` offers. Their names and sizes
 * come from `filesOf`, so a copy at the wrong size is a picture the browser
 * stretches or squeezes without anyone choosing to, on exactly the phones the
 * copies are for.
 *
 * It also fails on a file nothing references, because `public/` is shipped
 * whole: an orphan left by a swapped painting would be deployed for ever
 * without appearing anywhere on the site.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readStillWebp } from './webp-anim.mjs';
import { COLOURS, filesOf, PHONE_FRAME_INSET } from '../src/app/gallery/gallery.data.ts';

const galleryDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'gallery'
);
const paintings = COLOURS.flatMap((colour) => colour.paintings);

describe('gallery reproductions', () => {
  for (const painting of paintings) {
    test(`${painting.slug} is committed at the size the data declares`, () => {
      const file = path.join(galleryDir, painting.image.file);
      const { width, height } = readStillWebp(readFileSync(file));
      assert.deepEqual(
        { width, height },
        { width: painting.image.width, height: painting.image.height },
        `public/gallery/${painting.image.file} is ${width}×${height}; ` +
          'gallery.data.ts disagrees. Run `npm run gallery:fetch` and copy the sizes it prints.'
      );
    });

    test(`${painting.slug} has every smaller copy, at its derived size`, () => {
      for (const copy of filesOf(painting.image).slice(0, -1)) {
        const { width, height } = readStillWebp(readFileSync(path.join(galleryDir, copy.file)));
        assert.deepEqual(
          { width, height },
          { width: copy.width, height: copy.height },
          `public/gallery/${copy.file} is ${width}×${height}, not the size filesOf derives. ` +
            `Run \`npm run gallery:fetch -- --only ${painting.slug}\`.`
        );
      }
    });
  }

  test("PHONE_FRAME_INSET matches each frame's padding and border in gallery.css", () => {
    // `sizes` subtracts these to tell a phone's browser how wide the painting
    // is drawn. Stale by a few px, a 3× phone steps past the 1050 copy and
    // downloads the full-size file, or steps below the drawing and blurs it.
    const css = readFileSync(
      path.resolve(galleryDir, '..', '..', 'src', 'app', 'gallery', 'gallery.css'),
      'utf8'
    );
    const minPx = (rule, property) =>
      Number(new RegExp(`\\b${property}:\\s*(?:clamp\\()?(\\d+)px`).exec(rule)?.[1]);
    for (const [frame, inset] of Object.entries(PHONE_FRAME_INSET)) {
      const rule = new RegExp(`\\[data-frame='${frame}'\\] \\.hung-mount \\{([^}]*)\\}`).exec(
        css
      )?.[1];
      assert.ok(rule, `gallery.css has no .hung-mount rule for the ${frame} frame`);
      assert.equal(
        minPx(rule, 'padding') + minPx(rule, 'border'),
        inset,
        `${frame}: gallery.css gives padding + border of ` +
          `${minPx(rule, 'padding') + minPx(rule, 'border')}px; PHONE_FRAME_INSET says ${inset}.`
      );
    }
  });

  test('holds no file that the collection does not use', () => {
    const referenced = new Set(
      paintings.flatMap((painting) => filesOf(painting.image).map((image) => image.file))
    );
    const orphans = readdirSync(galleryDir).filter((name) => !referenced.has(name));
    assert.deepEqual(orphans, [], 'public/gallery/ is shipped whole; delete files nothing uses.');
  });
});
