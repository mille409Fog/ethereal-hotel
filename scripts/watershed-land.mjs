/**
 * The stored land as a file: Watershed's fields packed into a PNG and back, and
 * the digest that says which calibration made them. Pure — no file is read or
 * written here; `build-watershed-land.mjs` does that.
 *
 * Which byte is which field is not decided here. It is decided once, in
 * `src/app/watershed/stored/stored-layout.ts`, a leaf that both this file and
 * the route import, so the image and its reader cannot drift apart. This file
 * owns only the container: an 8-bit RGB PNG, written by hand because the
 * alternative is a dependency for a hundred lines, and read back by hand so the
 * check can look inside one without a browser.
 *
 * RGB and not RGBA, on purpose: a browser premultiplies a PNG's colour by its
 * alpha on decode, and the low byte of a height does not survive that.
 *
 * Every row picks its own filter by the usual heuristic, the smallest sum of
 * absolute differences. The fields are smooth in their high bytes and close to
 * noise in their low ones, and no single filter is best for both halves.
 */
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';

import {
  STORED_CHANNELS,
  packStored,
  unpackStored,
} from '../src/app/watershed/stored/stored-layout.ts';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** One PNG chunk: length, type, payload, and the CRC of the last two. */
function chunk(type, payload) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(payload.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), payload]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(zlib.crc32(body), 0);
  return Buffer.concat([head, body, tail]);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) {
    return a;
  }
  return pb <= pc ? b : c;
}

/** The predictor filter `type` uses for byte `x` of a row, given the row above. */
function predict(type, row, above, x, bpp) {
  const a = x >= bpp ? row[x - bpp] : 0;
  const b = above ? above[x] : 0;
  const c = above && x >= bpp ? above[x - bpp] : 0;
  switch (type) {
    case 1:
      return a;
    case 2:
      return b;
    case 3:
      return (a + b) >> 1;
    case 4:
      return paeth(a, b, c);
    default:
      return 0;
  }
}

/**
 * An 8-bit RGB PNG of `pixels`, `width` by `height`, three bytes a pixel.
 *
 * @param {Uint8Array} pixels Row-major RGB.
 * @returns {Buffer} The whole file.
 */
export function encodePng(pixels, width, height) {
  const stride = width * STORED_CHANNELS;
  if (pixels.length !== stride * height) {
    throw new Error(`${pixels.length} bytes is not ${width}×${height} RGB`);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: truecolour, no alpha
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  const raw = Buffer.alloc((stride + 1) * height);
  const trial = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const row = pixels.subarray(y * stride, (y + 1) * stride);
    const above = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;
    let best = 0;
    let bestCost = Infinity;
    for (let type = 0; type <= 4; type++) {
      let cost = 0;
      for (let x = 0; x < stride; x++) {
        const value = (row[x] - predict(type, row, above, x, STORED_CHANNELS)) & 0xff;
        trial[x] = value;
        cost += value < 128 ? value : 256 - value;
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = type;
      }
    }
    const to = y * (stride + 1);
    raw[to] = best;
    for (let x = 0; x < stride; x++) {
      raw[to + 1 + x] = (row[x] - predict(best, row, above, x, STORED_CHANNELS)) & 0xff;
    }
  }

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * The pixels of an 8-bit RGB PNG with no interlace, which is every PNG
 * `encodePng` writes and the only kind this needs to read.
 *
 * @param {Buffer} bytes A whole PNG file.
 * @returns {{ width: number, height: number, pixels: Uint8Array }}
 */
export function decodePng(bytes) {
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error('not a PNG');
  }
  let width = 0;
  let height = 0;
  const data = [];
  for (let at = 8; at < bytes.length;) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.toString('latin1', at + 4, at + 8);
    const payload = bytes.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = payload.readUInt32BE(0);
      height = payload.readUInt32BE(4);
      const [depth, colour, , , interlace] = payload.subarray(8, 13);
      if (depth !== 8 || colour !== 2 || interlace !== 0) {
        throw new Error(`a PNG of depth ${depth}, colour type ${colour}: only 8-bit RGB is read`);
      }
    } else if (type === 'IDAT') {
      data.push(payload);
    }
    at += 12 + length;
  }
  const raw = zlib.inflateSync(Buffer.concat(data));
  const stride = width * STORED_CHANNELS;
  const pixels = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const type = raw[y * (stride + 1)];
    const row = pixels.subarray(y * stride, (y + 1) * stride);
    const above = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      row[x] =
        (raw[y * (stride + 1) + 1 + x] + predict(type, row, above, x, STORED_CHANNELS)) & 0xff;
    }
  }
  return { width, height, pixels };
}

/** The PNG of a land's kept fields. */
export function packLand(fields) {
  return encodePng(packStored(fields), fields.size * 2, fields.size);
}

/**
 * A PNG's land: its side, and its `land` texels, four numbers a cell, exactly
 * as the route unpacks them.
 */
export function unpackLand(bytes) {
  const { width, height, pixels } = decodePng(bytes);
  if (width !== height * 2) {
    throw new Error(`a stored land is twice as wide as it is tall, and this is ${width}×${height}`);
  }
  return { size: height, land: unpackStored(pixels, height, STORED_CHANNELS) };
}

/**
 * What made a land, as one hex string: every erosion constant, the seed, the
 * grid, the rain's curve, and the pixel layout's ranges. A change to any of
 * them changes the digest. Keys are sorted, so the order an object literal was
 * written in is not part of it.
 */
export function landDigest(made) {
  const canonical = (value) => {
    if (value === null || typeof value !== 'object') {
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
      return `[${value.map(canonical).join(',')}]`;
    }
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  };
  return createHash('sha256').update(canonical(made)).digest('hex');
}
