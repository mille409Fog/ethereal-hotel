/**
 * The tests that judge Floor −2's distance transform.
 *
 *     npm run test:scripts
 *
 * The atlas this feeds is looked at exactly once, by whoever builds it, and
 * thereafter it is a committed binary that nobody reads. So the arithmetic that
 * makes it is worth pinning down here, against shapes whose right answer is known
 * without rendering anything: a rectangle, whose distance field is a formula, and a
 * disc, whose distance field is a subtraction.
 *
 * The property that actually matters to the room is the last block. A field is
 * useful to this floor only if **mixing two of them moves a boundary rather than
 * fading one** — that is the difference between AUBADE's "glyphs dissolving into one
 * another" and the cross-dissolve it explicitly is not. It is checkable: take two
 * discs a long way apart, mix their fields half and half, and the zero crossing must
 * be *between* them. With blurred coverage in place of distances it is at neither.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { encodeField, encodePng, pngSize, signedDistances } from './sentence-field.mjs';

/* ---------------------------------------------------------------------------
 * Fixtures
 * ------------------------------------------------------------------------- */

/** A bitmap with ink wherever `ink(x, y)` says so. */
function bitmap(width, height, ink) {
  const alpha = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      alpha[y * width + x] = ink(x, y) ? 255 : 0;
    }
  }
  return alpha;
}

const at = (field, width, x, y) => field[y * width + x];

/* ---------------------------------------------------------------------------
 * The transform
 * ------------------------------------------------------------------------- */

describe('the signed distance to a shape', () => {
  test('is positive inside and negative outside', () => {
    const size = 64;
    const square = bitmap(size, size, (x, y) => x >= 20 && x < 44 && y >= 20 && y < 44);
    const field = signedDistances(square, size, size);

    assert.ok(at(field, size, 32, 32) > 0, 'the middle of the square is inside');
    assert.ok(at(field, size, 2, 2) < 0, 'the corner of the image is outside');
  });

  test('measures a straight edge to within half a pixel', () => {
    // A vertical edge at x = 20: the pixel at x = 20 is the first ink, so the edge
    // runs at 19.5 and the distance from the centre of pixel x is |x − 19.5|.
    const size = 64;
    const half = bitmap(size, size, (x) => x >= 20);
    const field = signedDistances(half, size, size);

    for (const x of [10, 15, 19, 20, 25, 30]) {
      const expected = x >= 20 ? x - 19.5 : -(19.5 - x);
      assert.ok(
        Math.abs(at(field, size, x, 32) - expected) <= 0.5,
        `at x=${x} the field read ${at(field, size, x, 32)}, wanted about ${expected}`
      );
    }
  });

  test('is radial about a disc', () => {
    const size = 96;
    const centre = 48;
    const radius = 20;
    const disc = bitmap(
      size,
      size,
      (x, y) => Math.hypot(x - centre, y - centre) <= radius
    );
    const field = signedDistances(disc, size, size);

    // Sampled along the axis and along the diagonal, which is where a transform
    // that only walked the four neighbours would be wrong by about 8%.
    for (const step of [0, 5, 10, 25, 35]) {
      const straight = at(field, size, centre + step, centre);
      const diagonal = at(
        field,
        size,
        Math.round(centre + step * Math.SQRT1_2),
        Math.round(centre + step * Math.SQRT1_2)
      );
      assert.ok(
        Math.abs(straight - diagonal) <= 1.5,
        `at ${step} out, the axis read ${straight} and the diagonal ${diagonal}`
      );
    }
  });

  test('does not run off the end of a row it has no seeds in', () => {
    // A bitmap with no ink at all. The parabola envelope divides by a difference of
    // sample positions, and an image of nothing is where a real infinity in place of
    // FAR would produce NaN across the whole buffer rather than an error anywhere.
    const size = 16;
    const field = signedDistances(bitmap(size, size, () => false), size, size);
    for (const value of field) {
      assert.ok(Number.isFinite(value), 'an empty bitmap produced a non-finite field');
    }
  });
});

/* ---------------------------------------------------------------------------
 * The encoding
 * ------------------------------------------------------------------------- */

describe('the encoded tile', () => {
  const supersample = 4;
  const spread = 8;

  test('puts the edge of a stroke at the middle of the range', () => {
    const size = 64;
    const square = bitmap(size, size, (x, y) => x >= 16 && x < 48 && y >= 16 && y < 48);
    const tile = encodeField(square, size, size, { supersample, spread });
    const tileSize = size / supersample;

    // The tile pixel straddling the edge — rendered x = 16 is tile x = 4.
    assert.ok(
      Math.abs(at(tile, tileSize, 4, 8) - 128) <= 12,
      `the edge encoded as ${at(tile, tileSize, 4, 8)}, wanted about 128`
    );

    // The middle of the square is about 14 rendered pixels from the nearest edge,
    // which is 3.5 tile pixels, which at a spread of 8 is 0.5 + 3.5/16 ≈ 0.72 of
    // the range. Deep inside is *not* the top of the range unless the shape is
    // fatter than the spread, and asserting that it is would be asserting a
    // saturated field — which is the one thing this encoding must not produce.
    assert.ok(
      at(tile, tileSize, 8, 8) > 170 && at(tile, tileSize, 8, 8) < 205,
      `the middle of the square encoded as ${at(tile, tileSize, 8, 8)}, wanted about 183`
    );
    // The image corner is about 20 rendered pixels diagonally off the square's
    // corner, so 5 tile pixels out of a spread of 8 — well below the edge and not
    // yet clamped, which is the state most of a tile is in.
    assert.ok(
      at(tile, tileSize, 0, 0) < 70,
      `the image corner encoded as ${at(tile, tileSize, 0, 0)}, wanted about 49`
    );
  });

  test('clamps at the spread rather than wrapping', () => {
    const size = 128;
    const dot = bitmap(size, size, (x, y) => Math.hypot(x - 64, y - 64) <= 3);
    const tile = encodeField(dot, size, size, { supersample, spread });
    const tileSize = size / supersample;

    for (const value of tile) {
      assert.ok(value >= 0 && value <= 255, `a byte escaped the range: ${value}`);
    }
    assert.equal(at(tile, tileSize, 0, 0), 0, 'a corner far past the spread should clamp');
  });

  test('refuses a render that is not a whole number of tile pixels', () => {
    assert.throws(
      () => encodeField(new Uint8Array(30 * 30), 30, 30, { supersample: 4, spread }),
      /does not divide/
    );
  });

  test('mixes to a shape that travels, which is what the morph needs', () => {
    // The claim the whole floor rests on, and it is about *motion* rather than about
    // any one blend. Two discs; mix their fields at a ladder of fractions and find
    // where the mixed field peaks. With true distances that peak walks smoothly from
    // one centre to the other, which is a shape moving and changing. With blurred
    // coverage in place of distances it does not move at all — it sits at whichever
    // disc currently has more weight and jumps across at a half — and a shape that
    // jumps is the cross-dissolve AUBADE says this floor must not be.
    const size = 128;
    const field = (centre) =>
      signedDistances(
        bitmap(size, size, (x, y) => Math.hypot(x - centre, y - 64) <= 20),
        size,
        size
      );

    const from = field(48);
    const to = field(80);

    let previous = -Infinity;
    const edges = [];

    for (const across of [0, 0.25, 0.5, 0.75, 1]) {
      let left = -1;
      let right = -1;
      for (let x = 0; x < size; x += 1) {
        const mixed = at(from, size, x, 64) * (1 - across) + at(to, size, x, 64) * across;
        if (mixed >= 0) {
          if (left === -1) {
            left = x;
          }
          right = x;
        }
      }

      assert.ok(left !== -1, `at ${across} across, the mix has no inside at all`);
      assert.ok(
        left > previous,
        `the leading edge sat still at x=${left} going into ${across} across`
      );

      // The shape stays a shape on the way over rather than pinching off. It does
      // narrow a little in the middle — about a tenth here — and that is inherent to
      // blending distance fields linearly rather than a fault in this one: halfway
      // between two offset cones the slopes partly cancel, so the zero crossing sits
      // slightly inside where either shape's own edge was. It is worth knowing about
      // and worth keeping. At the scale a letter is drawn it reads as the stroke
      // thinning as it moves, which is what a stroke being redrawn looks like.
      assert.ok(
        right - left >= 33 && right - left <= 42,
        `at ${across} across the shape was ${right - left} wide, wanted 33 to 42`
      );

      previous = left;
      edges.push(left);
    }

    assert.ok(Math.abs(edges[0] - 28) <= 2, `it did not start at the first disc: ${edges[0]}`);
    assert.ok(Math.abs(edges[4] - 60) <= 2, `it did not arrive at the second: ${edges[4]}`);
    assert.ok(
      Math.abs(edges[2] - 44) <= 3,
      `halfway across its edge was at x=${edges[2]}, not between the two`
    );
  });
});

/* ---------------------------------------------------------------------------
 * The file
 * ------------------------------------------------------------------------- */

describe('the written PNG', () => {
  test('declares the size it was given', () => {
    const png = encodePng(new Uint8Array(64 * 16), 64, 16);
    assert.deepEqual(pngSize(png), { width: 64, height: 16 });
  });

  test('is deterministic, so a rebuild that changed nothing writes nothing', () => {
    const field = new Uint8Array(32 * 8).map((_, i) => (i * 7) % 256);
    assert.ok(encodePng(field, 32, 8).equals(encodePng(field, 32, 8)));
  });

  test('is not mistaken for a PNG when it is not one', () => {
    assert.equal(pngSize(Buffer.from('not a png at all, really')), null);
  });
});
