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
import { COLOURS } from '../src/app/gallery/gallery.data.ts';

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
  }

  test('holds no file that the collection does not use', () => {
    const referenced = new Set(paintings.map((painting) => painting.image.file));
    const orphans = readdirSync(galleryDir).filter((name) => !referenced.has(name));
    assert.deepEqual(orphans, [], 'public/gallery/ is shipped whole; delete files nothing uses.');
  });
});
