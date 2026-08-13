/**
 * The tests that judge the animated-WebP muxer.
 *
 *     npm run test:scripts
 *
 * No browser and no image data anywhere below. The frames are short buffers of
 * recognisable filler, because `encodeAnimatedWebp` never looks inside a frame —
 * it writes headers around bytes it is told to pass through. Feeding it real
 * VP8 would test the same code paths while making every failure harder to read.
 *
 * What is asserted is the container: the chunks a decoder walks, in the order it
 * walks them, carrying the sizes and the durations they claim to carry. What is
 * deliberately *not* asserted is anything the spec leaves open — the `ANIM`
 * background colour, the reserved bits, whether the writer allocates one buffer
 * or twenty.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { encodeAnimatedWebp, readRiffChunks, readStillWebp } from './webp-anim.mjs';

/** Build a RIFF chunk the way a caller of `encodeAnimatedWebp` would have one. */
function riffChunk(id, payload) {
  const header = Buffer.alloc(8);
  header.write(id, 0, 4, 'ascii');
  header.writeUInt32LE(payload.length, 4);
  const parts = [header, payload];
  if (payload.length % 2 === 1) {
    parts.push(Buffer.alloc(1));
  }
  return Buffer.concat(parts);
}

/** A stand-in for one frame's compressed bitstream. */
function fakeFrame(marker, byteLength = 8) {
  return riffChunk('VP8 ', Buffer.alloc(byteLength, marker));
}

/** Wrap a payload as a whole file, for the parser's tests. */
function riffFile(chunks) {
  const body = Buffer.concat([Buffer.from('WEBP', 'ascii'), ...chunks]);
  const header = Buffer.alloc(8);
  header.write('RIFF', 0, 4, 'ascii');
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

/** A VP8X payload: flags, three reserved bytes, then width-1 and height-1. */
function vp8xPayload(width, height, flags = 0x20) {
  const payload = Buffer.alloc(10);
  payload[0] = flags;
  payload.writeUIntLE(width - 1, 4, 3);
  payload.writeUIntLE(height - 1, 7, 3);
  return payload;
}

/** Split an ANMF payload into its 16-byte frame header and the data after it. */
function readAnmf(payload) {
  return {
    x: payload.readUIntLE(0, 3) * 2,
    y: payload.readUIntLE(3, 3) * 2,
    width: payload.readUIntLE(6, 3) + 1,
    height: payload.readUIntLE(9, 3) + 1,
    durationMs: payload.readUIntLE(12, 3),
    flags: payload[15],
    data: payload.subarray(16),
  };
}

const OPTIONS = { width: 640, height: 360, frameDurationMs: 2000 };

describe('encodeAnimatedWebp', () => {
  test('returns a RIFF/WEBP file whose declared size matches its bytes', () => {
    const out = encodeAnimatedWebp([fakeFrame(0xa1)], OPTIONS);

    assert.ok(Buffer.isBuffer(out), 'should return a Buffer');
    assert.equal(out.toString('ascii', 0, 4), 'RIFF');
    assert.equal(out.toString('ascii', 8, 12), 'WEBP');
    assert.equal(
      out.readUInt32LE(4),
      out.length - 8,
      'the RIFF size field counts every byte after itself'
    );
    assert.equal(out.length % 2, 0, 'a RIFF file ends on an even offset');
  });

  test('leads with VP8X, then ANIM, then one ANMF per frame in order', () => {
    const out = encodeAnimatedWebp([fakeFrame(0xa1), fakeFrame(0xa2), fakeFrame(0xa3)], OPTIONS);

    assert.deepEqual(
      readRiffChunks(out).map((c) => c.id),
      ['VP8X', 'ANIM', 'ANMF', 'ANMF', 'ANMF']
    );
  });

  test('marks the file animated and states the canvas size', () => {
    const out = encodeAnimatedWebp([fakeFrame(0xa1)], { ...OPTIONS, width: 1, height: 16384 });
    const [vp8x] = readRiffChunks(out);

    assert.equal(vp8x.payload.length, 10);
    assert.equal(vp8x.payload[0] & 0x02, 0x02, 'the animation flag has to be set');
    assert.equal(vp8x.payload.readUIntLE(4, 3) + 1, 1, 'width is stored minus one');
    assert.equal(vp8x.payload.readUIntLE(7, 3) + 1, 16384, 'height is stored minus one');
  });

  test('loops forever by default, and honours a loop count when given one', () => {
    const forever = readRiffChunks(encodeAnimatedWebp([fakeFrame(0xa1)], OPTIONS))[1];
    assert.equal(forever.payload.length, 6);
    assert.equal(forever.payload.readUInt16LE(4), 0, 'zero means loop forever');

    const thrice = readRiffChunks(
      encodeAnimatedWebp([fakeFrame(0xa1)], { ...OPTIONS, loopCount: 3 })
    )[1];
    assert.equal(thrice.payload.readUInt16LE(4), 3);
  });

  test('gives every frame the whole canvas, at the stated duration', () => {
    const out = encodeAnimatedWebp([fakeFrame(0xa1), fakeFrame(0xa2)], OPTIONS);

    for (const { payload } of readRiffChunks(out).filter((c) => c.id === 'ANMF')) {
      const frame = readAnmf(payload);
      assert.equal(frame.x, 0);
      assert.equal(frame.y, 0);
      assert.equal(frame.width, OPTIONS.width);
      assert.equal(frame.height, OPTIONS.height);
      assert.equal(frame.durationMs, OPTIONS.frameDurationMs);
    }
  });

  test('passes each bitstream through byte-for-byte, in the order given', () => {
    const frames = [fakeFrame(0xa1), fakeFrame(0xa2), fakeFrame(0xa3)];
    const out = encodeAnimatedWebp(frames, OPTIONS);

    const carried = readRiffChunks(out)
      .filter((c) => c.id === 'ANMF')
      .map((c) => readAnmf(c.payload).data);

    assert.equal(carried.length, frames.length);
    frames.forEach((frame, i) => {
      assert.ok(
        carried[i].subarray(0, frame.length).equals(frame),
        `frame ${i} should arrive unmodified, id and length included`
      );
    });
  });

  test('an odd-length bitstream does not shift the chunks after it', () => {
    // The pad byte RIFF requires is not counted in the length field, so a writer
    // that forgets it produces a file that still parses — into nonsense.
    const odd = fakeFrame(0xa1, 7);
    const out = encodeAnimatedWebp([odd, fakeFrame(0xa2)], OPTIONS);

    assert.deepEqual(
      readRiffChunks(out).map((c) => c.id),
      ['VP8X', 'ANIM', 'ANMF', 'ANMF'],
      'the second frame is only found if the first was padded correctly'
    );
    assert.equal(
      readRiffChunks(out).at(-1).payload.subarray(16, 16 + 8).toString('hex'),
      fakeFrame(0xa2).subarray(0, 8).toString('hex')
    );
  });

  test('a single frame and many frames both come out well-formed', () => {
    for (const count of [1, 2, 25]) {
      const frames = Array.from({ length: count }, (_, i) => fakeFrame(i & 0xff));
      const out = encodeAnimatedWebp(frames, OPTIONS);

      assert.equal(out.readUInt32LE(4), out.length - 8, `size field wrong at ${count} frames`);
      assert.equal(
        readRiffChunks(out).filter((c) => c.id === 'ANMF').length,
        count,
        `expected ${count} ANMF chunks`
      );
    }
  });

  test('refuses to write an animation with no frames', () => {
    // An empty ANIM is legal to write and undecodable in practice; failing here
    // is what stops the capture script committing a file nothing can open.
    assert.throws(() => encodeAnimatedWebp([], OPTIONS));
  });
});

describe('readStillWebp', () => {
  test('returns the bitstream as a chunk and the canvas size from VP8X', () => {
    const bitstream = Buffer.alloc(12, 0xc3);
    const file = riffFile([
      riffChunk('VP8X', vp8xPayload(640, 360)),
      riffChunk('ICCP', Buffer.alloc(20, 0x11)),
      riffChunk('VP8 ', bitstream),
    ]);

    const still = readStillWebp(file);
    assert.equal(still.width, 640);
    assert.equal(still.height, 360);
    assert.equal(still.bitstream.toString('ascii', 0, 4), 'VP8 ');
    assert.equal(still.bitstream.readUInt32LE(4), bitstream.length);
    assert.ok(still.bitstream.subarray(8).equals(bitstream));
  });

  test('accepts the lossless bitstream too', () => {
    const file = riffFile([
      riffChunk('VP8X', vp8xPayload(8, 8)),
      riffChunk('VP8L', Buffer.alloc(4, 0x2f)),
    ]);

    assert.equal(readStillWebp(file).bitstream.toString('ascii', 0, 4), 'VP8L');
  });

  test('drops the colour profile rather than carrying it into the animation', () => {
    const file = riffFile([
      riffChunk('VP8X', vp8xPayload(8, 8)),
      riffChunk('ICCP', Buffer.alloc(456, 0x11)),
      riffChunk('VP8 ', Buffer.alloc(4, 0xc3)),
    ]);

    assert.equal(readStillWebp(file).bitstream.length, 12);
  });

  test('rejects files that are not WebP, and WebP with nothing to extract', () => {
    assert.throws(() => readStillWebp(Buffer.from('not a riff file at all')), /RIFF/);
    assert.throws(
      () => readStillWebp(riffFile([riffChunk('VP8 ', Buffer.alloc(4))])),
      /VP8X/,
      'no VP8X means no canvas size'
    );
    assert.throws(
      () => readStillWebp(riffFile([riffChunk('VP8X', vp8xPayload(8, 8))])),
      /bitstream/
    );
  });
});

describe('readRiffChunks', () => {
  test('skips the pad byte after an odd-length chunk', () => {
    const file = riffFile([riffChunk('VP8X', Buffer.alloc(3, 1)), riffChunk('ANIM', Buffer.alloc(6, 2))]);

    assert.deepEqual(
      readRiffChunks(file).map((c) => c.id),
      ['VP8X', 'ANIM']
    );
  });

  test('reports a chunk that runs off the end of the file', () => {
    const file = riffFile([riffChunk('VP8 ', Buffer.alloc(8, 1))]);

    assert.throws(() => readRiffChunks(file.subarray(0, file.length - 4)), /ends first/);
  });
});
