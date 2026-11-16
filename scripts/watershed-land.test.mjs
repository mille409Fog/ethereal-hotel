/**
 * The stored land's container and layout, round trip.
 *
 *     npm run test:scripts
 *
 * `watershed-land.mjs` writes the PNG and `stored/stored-layout.ts` decides its
 * bytes; the route reads the same bytes with the same layout. So what is
 * checked here is what the route depends on: a land packed and unpacked comes
 * back within the layout's steps, the water's square root keeps a film, values
 * that do not fit are named rather than clamped, and the digest moves with any
 * constant.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { EROSION } from '../src/app/watershed/model/erosion-calibration.ts';
import { createFields } from '../src/app/watershed/model/fields.ts';
import {
  CUT_RANGE,
  REGOLITH_RANGE,
  WATER_RANGE,
  outOfRange,
} from '../src/app/watershed/stored/stored-layout.ts';
import { decodePng, encodePng, landDigest, packLand, unpackLand } from './watershed-land.mjs';

const SIZE = 16;

/** A land with every field varying, smoothly and not, inside its range. */
function sampleFields() {
  const fields = createFields(SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) {
    const x = i % SIZE;
    const y = Math.floor(i / SIZE);
    fields.cut[i] = (x * 37.3 + y * 11.1) % CUT_RANGE;
    fields.regolith[i] = ((x * y * 3.7) % REGOLITH_RANGE) + 0.004 * (i % 3);
    fields.water[i] = i % 5 === 0 ? 0 : ((x + y) / (2 * SIZE)) ** 3 * WATER_RANGE;
  }
  return fields;
}

describe('the stored land as a PNG', () => {
  test('an RGB PNG round trips byte for byte, whichever filter each row chose', () => {
    const width = 9;
    const height = 7;
    const pixels = new Uint8Array(width * height * 3);
    for (let i = 0; i < pixels.length; i++) {
      pixels[i] = (i * 97 + (i >> 4) * 13) & 0xff;
    }
    const decoded = decodePng(encodePng(pixels, width, height));

    assert.equal(decoded.width, width);
    assert.equal(decoded.height, height);
    assert.deepEqual(decoded.pixels, pixels);
  });

  test('is twice as wide as the land, and has no alpha channel to be premultiplied', () => {
    const bytes = packLand(sampleFields());

    assert.equal(bytes.readUInt32BE(16), SIZE * 2);
    assert.equal(bytes.readUInt32BE(20), SIZE);
    assert.equal(bytes[25], 2, 'colour type 2 is RGB');
  });

  test('brings every field back within half a step of its layout', () => {
    const fields = sampleFields();
    const { size, land } = unpackLand(packLand(fields));

    assert.equal(size, SIZE);
    for (let i = 0; i < SIZE * SIZE; i++) {
      assert.ok(Math.abs(land[i * 4] - fields.cut[i]) <= CUT_RANGE / 65535 / 2 + 1e-6);
      assert.ok(
        Math.abs(land[i * 4 + 1] - fields.regolith[i]) <= REGOLITH_RANGE / 65535 / 2 + 1e-6
      );
      // by root, the step is finest where the water is shallowest
      const step = (2 * Math.sqrt(fields.water[i] * WATER_RANGE) + WATER_RANGE / 255) / 255;
      assert.ok(Math.abs(land[i * 4 + 2] - fields.water[i]) <= step / 2 + 1e-6);
      assert.equal(land[i * 4 + 3], 0, 'the suspended sediment is not stored');
    }
  });

  test('keeps a film of water a linear byte would lose, and a dry cell dry', () => {
    const fields = createFields(SIZE);
    fields.water[1] = 0.02;
    const { land } = unpackLand(packLand(fields));

    assert.ok(WATER_RANGE / 255 > 0.02 * 2, 'a linear byte would round this film to nothing');
    assert.ok(land[4 + 2] > 0.01);
    assert.equal(land[2], 0);
  });

  test('names a field that does not fit, rather than clamping it', () => {
    const fields = sampleFields();
    assert.deepEqual(outOfRange(fields), []);

    fields.cut[3] = CUT_RANGE * 1.5;
    fields.water[4] = -1;
    const refused = outOfRange(fields);

    assert.equal(refused.length, 2);
    assert.match(refused[0], /^cut/);
    assert.match(refused[1], /^water/);
  });

  test('refuses an image that is not twice as wide as it is tall', () => {
    assert.throws(() => unpackLand(encodePng(new Uint8Array(4 * 4 * 3), 4, 4)), /twice as wide/);
  });
});

describe('the digest beside it', () => {
  const made = { seed: 4127, size: 512, erosion: EROSION, rain: { rainStop: 0.85 } };

  test('is the same for the same inputs, whatever order their keys were written in', () => {
    const reordered = { rain: made.rain, size: 512, erosion: { ...EROSION }, seed: 4127 };

    assert.equal(landDigest(made), landDigest(reordered));
  });

  test('changes with any erosion constant, the seed, or the rain', () => {
    const digests = new Set([landDigest(made)]);
    for (const key of Object.keys(EROSION)) {
      digests.add(
        landDigest({ ...made, erosion: { ...EROSION, [key]: EROSION[key] * 1.01 + 1e-9 } })
      );
    }
    digests.add(landDigest({ ...made, seed: 4128 }));
    digests.add(landDigest({ ...made, rain: { rainStop: 0.86 } }));

    assert.equal(digests.size, Object.keys(EROSION).length + 3);
  });
});
