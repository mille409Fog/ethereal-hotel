/**
 * Turn a series of still WebP images into one animated WebP.
 *
 * This exists because the repo needed to show the WebSocket deployment moving,
 * and every ordinary way to produce that file was worse. `ffmpeg` and `cwebp`
 * are not on this box and adding either as a prerequisite makes the capture
 * un-runnable for the next person; a `.webm` from Playwright's video recorder
 * does not embed in a GitHub README, which is the one place the file has to
 * work; and an npm encoder is a native dependency in a repo that pins and
 * audits every package it has. So the frames come out of the Chromium that
 * `npm run e2e` already installs — `canvas.toDataURL('image/webp')` is a
 * complete WebP encoder that ships with the browser — and the only thing
 * missing is the container that holds them in sequence. That container is
 * ~30 bytes of header per frame, which is less code than justifying a
 * dependency for it. `encodeIco` in `gen-social-assets.mjs` is here for the
 * same reason and follows the same argument.
 *
 * ## Two functions, because they are two different problems
 *
 * `readStillWebp` is parsing: Chromium hands back a RIFF file wrapping the
 * actual compressed image, and the bitstream has to be lifted out of it intact.
 * That is a question about somebody else's output format.
 *
 * `encodeAnimatedWebp` is synthesis: given bitstreams, write the container that
 * makes them a timed sequence. That is a question about the WebP spec, and it
 * is where the frame cadence — the thing the recording is actually about —
 * gets written down. Keeping them apart means the second can be tested with
 * bytes that are not images at all, which is why its tests need no browser.
 *
 * Neither function decodes or re-encodes anything. The compressed frame data
 * passes through byte-for-byte; only headers are written.
 *
 * Format reference: https://developers.google.com/speed/webp/docs/riff_container
 */

/** Every RIFF chunk header: a four-character id then a little-endian length. */
const CHUNK_HEADER_BYTES = 8;

/**
 * The bit in VP8X's flag byte that marks a file as animated. Setting it is what
 * makes a decoder look for `ANIM`/`ANMF` instead of a single still image.
 */
const ANIMATION_FLAG = 0x02;

/**
 * ANMF's flag byte, for frames that are opaque and cover the whole canvas:
 * blending off (bit 1), disposal off (bit 0). Blending a fully opaque frame
 * onto the previous one is work with no visible result, and disposing to
 * background between frames would flash the canvas colour.
 */
const OPAQUE_KEYFRAME_FLAGS = 0x02;

/**
 * Write a 24-bit little-endian integer.
 *
 * Wrapped only because Node's Buffer stops at 16 and 32. This container stores
 * every dimension, offset and duration in three bytes, and `writeUIntLE` is the
 * one method that reaches an odd width.
 */
function writeUInt24LE(buffer, value, offset) {
  buffer.writeUIntLE(value, offset, 3);
}

/**
 * Wrap a payload in a RIFF chunk: id, length, payload, and a pad byte when the
 * length is odd.
 *
 * The pad is the part that is easy to miss. RIFF requires every chunk to start
 * at an even offset, so an odd-length payload is followed by a zero byte that
 * is *not* counted in the length field. Omit it and every chunk after the first
 * odd one is read at the wrong offset — the file does not fail loudly, it
 * decodes as garbage.
 */
function chunk(id, payload) {
  const header = Buffer.alloc(CHUNK_HEADER_BYTES);
  header.write(id, 0, 4, 'ascii');
  header.writeUInt32LE(payload.length, 4);
  const parts = [header, payload];
  if (payload.length % 2 === 1) {
    parts.push(Buffer.alloc(1));
  }
  return Buffer.concat(parts);
}

/**
 * Walk the top-level chunks of a RIFF file.
 *
 * @param {Buffer} buffer A complete RIFF file.
 * @returns {{ id: string, payload: Buffer }[]} Chunks in file order, payloads
 *   excluding any pad byte.
 */
export function readRiffChunks(buffer) {
  if (buffer.length < 12 || buffer.toString('ascii', 0, 4) !== 'RIFF') {
    throw new Error('Not a RIFF file: missing the RIFF magic.');
  }
  if (buffer.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error(`Not a WebP file: RIFF form is "${buffer.toString('ascii', 8, 12)}".`);
  }

  const chunks = [];
  let offset = 12;
  while (offset + CHUNK_HEADER_BYTES <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const length = buffer.readUInt32LE(offset + 4);
    const start = offset + CHUNK_HEADER_BYTES;
    if (start + length > buffer.length) {
      throw new Error(`Chunk "${id}" claims ${length} bytes but the file ends first.`);
    }
    chunks.push({ id, payload: buffer.subarray(start, start + length) });
    offset = start + length + (length % 2);
  }
  return chunks;
}

/**
 * Lift the compressed image out of a still WebP.
 *
 * Chromium's `canvas.toDataURL('image/webp')` returns an extended-format file:
 * a `VP8X` header, an `ICCP` colour profile, then the bitstream — `VP8 ` at any
 * quality below 1, `VP8L` at exactly 1. Only the bitstream survives into an
 * animation; the profile is dropped, which is safe only because the capture
 * launches Chromium with `--force-color-profile=srgb` and so the profile it
 * embeds describes the space the frames are already in.
 *
 * @param {Buffer} buffer One still WebP file.
 * @returns {{ bitstream: Buffer, width: number, height: number }} The bitstream
 *   as a complete sub-chunk — its own id and length still attached, ready to sit
 *   inside an `ANMF` — and the canvas size the file declares.
 */
export function readStillWebp(buffer) {
  const chunks = readRiffChunks(buffer);

  const header = chunks.find((c) => c.id === 'VP8X');
  if (!header) {
    throw new Error(
      'Still WebP has no VP8X header, so its canvas size cannot be read. ' +
        'Chromium always writes one; this file came from something else.'
    );
  }

  const image = chunks.find((c) => c.id === 'VP8 ' || c.id === 'VP8L');
  if (!image) {
    throw new Error('Still WebP contains no VP8 or VP8L bitstream.');
  }

  return {
    bitstream: chunk(image.id, image.payload),
    // Both dimensions are stored minus one, which is how a 24-bit field spans
    // the full 1..16384 range the format allows.
    width: header.payload.readUIntLE(4, 3) + 1,
    height: header.payload.readUIntLE(7, 3) + 1,
  };
}

/** VP8X: a flag byte, three reserved, then the canvas size. */
const VP8X_BYTES = 10;

/** ANIM: a BGRA background colour, then the loop count. */
const ANIM_BYTES = 6;

/** ANMF: where the frame sits, how big it is, how long it shows, how it blends. */
const ANMF_HEADER_BYTES = 16;

/**
 * Assemble bitstreams into one animated WebP.
 *
 * @param {Buffer[]} frames Each entry is one frame's complete bitstream
 *   sub-chunk as `readStillWebp` returns it — a `VP8 `/`VP8L` id, its length,
 *   its payload, and a pad byte if that length was odd. Pass them through
 *   untouched; they are already valid chunks. Must not be empty.
 * @param {object} options
 * @param {number} options.width Canvas width in pixels, 1..16384. Every frame
 *   is written as covering the whole canvas at (0, 0).
 * @param {number} options.height Canvas height in pixels, 1..16384.
 * @param {number} options.frameDurationMs How long each frame is shown.
 * @param {number} [options.loopCount] 0, the default, means loop forever.
 * @returns {Buffer} A complete animated WebP file.
 */
export function encodeAnimatedWebp(frames, { width, height, frameDurationMs, loopCount = 0 }) {
  if (frames.length === 0) {
    throw new Error('An animated WebP needs at least one frame.');
  }

  // Marks the file animated and declares the canvas the frames are drawn on.
  // Bytes 1-3 are reserved and stay as allocated.
  const vp8x = Buffer.alloc(VP8X_BYTES);
  vp8x.writeUInt8(ANIMATION_FLAG, 0);
  writeUInt24LE(vp8x, width - 1, 4);
  writeUInt24LE(vp8x, height - 1, 7);

  // Bytes 0-3 are a background colour, which only a decoder that disposes frames
  // to it would ever paint. These frames never dispose, so leaving it
  // transparent claims nothing.
  const anim = Buffer.alloc(ANIM_BYTES);
  anim.writeUInt16LE(loopCount, 4);

  // One header does for every frame: they are all the same size, all at the
  // origin, and all shown for the same time. Bytes 0-5 are the frame's x and y
  // in units of two pixels — both zero, so both stay as allocated.
  const frameHeader = Buffer.alloc(ANMF_HEADER_BYTES);
  writeUInt24LE(frameHeader, width - 1, 6);
  writeUInt24LE(frameHeader, height - 1, 9);
  writeUInt24LE(frameHeader, frameDurationMs, 12);
  frameHeader.writeUInt8(OPAQUE_KEYFRAME_FLAGS, 15);

  // The file is itself one RIFF chunk whose payload opens with the form id, so
  // `chunk` writes the outer length as well and there is no total to compute
  // separately — the one number in the format that nothing else would catch
  // being wrong.
  return chunk(
    'RIFF',
    Buffer.concat([
      Buffer.from('WEBP', 'ascii'),
      chunk('VP8X', vp8x),
      chunk('ANIM', anim),
      ...frames.map((frame) => chunk('ANMF', Buffer.concat([frameHeader, frame]))),
    ])
  );
}
