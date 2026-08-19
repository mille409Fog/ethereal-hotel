/**
 * A rendered line of type, turned into a distance field, turned into a PNG.
 *
 * This is the half of `build-sentence-atlas.mjs` that has nothing to do with
 * browsers, fonts or writing systems, and it is here on its own because it is the
 * half that can be checked. `node --test` runs the assertions in
 * `sentence-field.test.mjs` against a square and a disc, where the right answer is
 * arithmetic rather than a judgement about whether some Greek looks right.
 *
 * ## Why an exact transform and not a blur
 *
 * The usual way to get a distance field out of a bitmap is to blur the coverage and
 * call the result close enough, and for a glyph that is about to be drawn at its own
 * size it very nearly is. It is not close enough here. Floor −2's sentence morphs
 * between two fields by mixing them, and a mix is only a letter turning into another
 * letter if both operands are *true* distances — the zero crossing of a mix of two
 * exact fields travels smoothly from one shape to the other, and the zero crossing
 * of a mix of two blurs sits still and fades, which is a cross-dissolve and is the
 * thing AUBADE says this floor must not be.
 *
 * So this is the exact Euclidean transform: Felzenszwalb and Huttenlocher's lower
 * envelope of parabolas, one pass down the columns and one along the rows, linear in
 * the number of pixels and exact to the pixel centre rather than approximate to a
 * kernel width. It is about forty lines, which is fewer than a good blur.
 *
 * ## And why the input is supersampled
 *
 * The transform is exact about pixel *centres*, which means its boundary is a
 * staircase — a diagonal stem comes out with a distance that ripples along it at the
 * pixel pitch. Rendering four times too large and averaging the finished distances
 * down is what removes that: sixteen staircases at four different sub-pixel phases
 * average to a straight edge, and averaging *distances* is legitimate in a way that
 * averaging coverage is not, because distance is locally linear and coverage is not.
 */

import zlib from 'node:zlib';

/** Stands in for infinity. Real infinities make the parabola intersection NaN. */
const FAR = 1e20;

/**
 * The lower envelope of parabolas, in one dimension.
 *
 * @param f Squared distances at each sample: 0 at a seed, `FAR` elsewhere.
 * @param n How many samples.
 * @returns Squared distance to the nearest seed, at each sample.
 */
function envelope(f, n) {
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);

  let k = 0;
  v[0] = 0;
  z[0] = -FAR;
  z[1] = FAR;

  for (let q = 1; q < n; q += 1) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (k > 0 && s <= z[k]) {
      k -= 1;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k += 1;
    v[k] = q;
    z[k] = s;
    z[k + 1] = FAR;
  }

  k = 0;
  for (let q = 0; q < n; q += 1) {
    while (z[k + 1] < q) {
      k += 1;
    }
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }

  return d;
}

/**
 * Squared distance from every pixel to the nearest seed, over a whole image.
 *
 * @param f Squared distances, row-major, `width * height`. Mutated and returned.
 * @param width Image width in pixels.
 * @param height Image height in pixels.
 * @returns `f`, now holding squared Euclidean distances.
 */
function transform(f, width, height) {
  const column = new Float64Array(height);
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      column[y] = f[y * width + x];
    }
    const d = envelope(column, height);
    for (let y = 0; y < height; y += 1) {
      f[y * width + x] = d[y];
    }
  }

  const row = new Float64Array(width);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      row[x] = f[y * width + x];
    }
    const d = envelope(row, width);
    for (let x = 0; x < width; x += 1) {
      f[y * width + x] = d[x];
    }
  }

  return f;
}

/**
 * The signed distance to the edge of the inked region, in input pixels.
 *
 * Positive inside a stroke, negative outside it, and offset by half a pixel at the
 * boundary because the transform measures between pixel centres: without it, a
 * pixel that is the outermost ink and a pixel that is the innermost background are
 * both reported as zero away from an edge that in fact runs between them.
 *
 * @param alpha Coverage, one byte per pixel, row-major. 128 and over is ink.
 * @param width Image width in pixels.
 * @param height Image height in pixels.
 * @returns Signed distances, row-major, in input pixels.
 */
export function signedDistances(alpha, width, height) {
  const count = width * height;
  const inside = new Float64Array(count);
  const outside = new Float64Array(count);

  for (let i = 0; i < count; i += 1) {
    const ink = alpha[i] >= 128;
    // Seeded from the *opposite* set in each case: the distance from a background
    // pixel to the shape is its distance to the nearest ink, and vice versa.
    outside[i] = ink ? 0 : FAR;
    inside[i] = ink ? FAR : 0;
  }

  transform(outside, width, height);
  transform(inside, width, height);

  const signed = new Float64Array(count);
  for (let i = 0; i < count; i += 1) {
    signed[i] =
      alpha[i] >= 128 ? Math.sqrt(inside[i]) - 0.5 : -(Math.sqrt(outside[i]) - 0.5);
  }

  return signed;
}

/**
 * A supersampled coverage bitmap, as an encoded distance-field tile.
 *
 * @param alpha Coverage from the renderer, `width * height` bytes.
 * @param width Rendered width, a whole multiple of `supersample`.
 * @param height Rendered height, a whole multiple of `supersample`.
 * @param options `supersample` — how many rendered pixels to a tile pixel;
 *   `spread` — how far the field runs before it clamps, in *tile* pixels.
 * @returns One byte per tile pixel. 128 is the edge of a stroke, over 128 is inside
 *   it, and the two ends of the range are `spread` tile pixels either side.
 * @throws If the rendered size is not a whole number of tiles.
 */
export function encodeField(alpha, width, height, { supersample, spread }) {
  if (width % supersample !== 0 || height % supersample !== 0) {
    throw new Error(
      `A ${width}×${height} render does not divide by a supersample of ${supersample}.`
    );
  }

  const signed = signedDistances(alpha, width, height);
  const tileWidth = width / supersample;
  const tileHeight = height / supersample;
  const field = new Uint8Array(tileWidth * tileHeight);
  const block = supersample * supersample;

  for (let ty = 0; ty < tileHeight; ty += 1) {
    for (let tx = 0; tx < tileWidth; tx += 1) {
      let total = 0;
      for (let dy = 0; dy < supersample; dy += 1) {
        const row = (ty * supersample + dy) * width + tx * supersample;
        for (let dx = 0; dx < supersample; dx += 1) {
          total += signed[row + dx];
        }
      }

      // Averaged, then converted from rendered pixels into tile pixels — the two
      // are different units and conflating them is a field that clamps four times
      // too close to its strokes.
      const distance = total / block / supersample;
      const unit = Math.min(1, Math.max(0, 0.5 + distance / (2 * spread)));
      field[ty * tileWidth + tx] = Math.round(unit * 255);
    }
  }

  return field;
}

/** The standard CRC-32 table, built once. */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

/** CRC-32 over a buffer, as PNG wants it. */
function crc32(bytes) {
  let c = -1;
  for (let i = 0; i < bytes.length; i += 1) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ -1) >>> 0;
}

/** One PNG chunk: length, type, payload, CRC of the last two. */
function chunk(type, payload) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(payload.length, 0);

  const body = Buffer.concat([Buffer.from(type, 'latin1'), payload]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body), 0);

  return Buffer.concat([head, body, tail]);
}

/**
 * An 8-bit greyscale PNG, written by hand.
 *
 * By hand because the alternative is a dependency for sixty lines of arithmetic, and
 * because what is being stored is not a picture: it is a sampled function whose
 * values happen to fit in a byte, and every lossy encoder in the world would take
 * one look at a smooth grey ramp and improve it. The Sub filter is used on every
 * row, which is the right one here — a distance field is very nearly linear along a
 * row, so the differences it leaves for zlib are small and mostly identical.
 *
 * @param field One byte per pixel, row-major.
 * @param width Image width in pixels.
 * @param height Image height in pixels.
 * @returns The whole file.
 */
export function encodePng(field, width, height) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 0; // colour type: greyscale
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const from = y * width;
    const to = y * (width + 1);
    raw[to] = 1; // Sub
    for (let x = 0; x < width; x += 1) {
      raw[to + 1 + x] = (field[from + x] - (x === 0 ? 0 : field[from + x - 1])) & 0xff;
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * The width and height an encoded PNG declares, for a caller that only needs to
 * check that a committed file is the shape the code expects.
 *
 * @param bytes A whole PNG file.
 * @returns Its dimensions, or `null` if this is not a PNG at all.
 */
export function pngSize(bytes) {
  if (bytes.length < 24 || bytes.readUInt32BE(0) !== 0x89504e47) {
    return null;
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}
