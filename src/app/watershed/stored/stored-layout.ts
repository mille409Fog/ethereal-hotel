/**
 * the stored land's pixels: the reference model's fields at the end of the hero seed's storm, as the bytes of an
 * RGB image twice as wide as it is tall, and back.
 *
 * this is the one place the layout is written. `scripts/watershed-land.mjs` packs with it and `stored-land.ts`
 * unpacks with it, so the script that builds the image and the route that reads it cannot disagree about which
 * byte is the water.
 *
 * | half  | R             | G            | B                    |
 * | ----- | ------------- | ------------ | -------------------- |
 * | left  | cut, high     | cut, low     | water, by root       |
 * | right | regolith high | regolith low | spare                |
 *
 * - **the cut and the regolith are sixteen bits each**, over `CUT_RANGE` and `REGOLITH_RANGE`. the plan gave the
 *   regolith eight, in R alone. eight bits over the metres of fill a basin holds is a step of most of a metre, and
 *   the ground is `(uplift − cut) + regolith`, so every silted flat would have been drawn as terraces. it took one
 *   of the two spare channels; the other is still spare.
 * - **the water is eight bits by its square root**, over `WATER_RANGE`. a lake is tens of metres deep and a
 *   stream a few centimetres, and both are drawn; a linear byte would have had nothing below a sixth of a metre
 *   and every stream would be gone. by root the first step is a millimetre and the last a quarter of a metre.
 * - **what is not stored is raised again.** the uplift and the beds come from the seed, in the browser, by the
 *   same `raiseLand` that raised them here. the suspended sediment and the flow are not kept: what the water
 *   carries tints it, and a stored land's water is clear and still.
 * - **a value outside its range is refused, not clamped.** `outOfRange` says which; the build refuses to write.
 *
 * a leaf module, because Node imports it: see `model/fields.ts`.
 */
import type { IFields } from '../model/fields';

/** cells along a side of the stored land */
export const STORED_SIZE = 512;

/** bytes in one pixel: RGB, and no alpha, because a PNG with alpha is premultiplied on decode */
export const STORED_CHANNELS = 3;

/** metres of cut the sixteen bits span: a step of 1.6 cm */
export const CUT_RANGE = 1024;

/** metres of regolith the sixteen bits span: a step of 7.8 mm */
export const REGOLITH_RANGE = 512;

/** metres of water the byte spans, by its square root */
export const WATER_RANGE = 64;

/** numbers in one texel of the `land` texture: cut, regolith, water depth, suspended sediment */
const LAND_CHANNELS = 4;

const WORD = 65535;
const BYTE = 255;

/** the fields the image keeps */
export type IStoredFields = Pick<IFields, 'size' | 'cut' | 'regolith' | 'water'>;

/** each kept field whose values do not fit its range, with the value that does not */
export function outOfRange(fields: IStoredFields): string[] {
  const found: string[] = [];
  const check = (name: string, values: Float32Array, range: number): void => {
    let low = 0;
    let high = 0;
    for (const value of values) {
      low = Math.min(low, value);
      high = Math.max(high, value);
    }
    if (high > range || low < 0 || !Number.isFinite(high) || !Number.isFinite(low)) {
      found.push(`${name} runs from ${low} to ${high} m, and its range is 0 to ${range} m`);
    }
  };
  check('cut', fields.cut, CUT_RANGE);
  check('regolith', fields.regolith, REGOLITH_RANGE);
  check('water', fields.water, WATER_RANGE);
  return found;
}

function word(value: number, range: number): number {
  return Math.min(WORD, Math.max(0, Math.round((value / range) * WORD)));
}

/** the image's pixels for these fields, row by row, `STORED_CHANNELS` bytes each, `2 * size` pixels a row */
export function packStored(fields: IStoredFields): Uint8Array {
  const { size } = fields;
  const width = size * 2;
  const pixels = new Uint8Array(width * size * STORED_CHANNELS);
  for (let i = 0; i < size * size; i++) {
    const x = i % size;
    const y = Math.floor(i / size);
    const left = (y * width + x) * STORED_CHANNELS;
    const right = left + size * STORED_CHANNELS;
    const cut = word(fields.cut[i], CUT_RANGE);
    const regolith = word(fields.regolith[i], REGOLITH_RANGE);
    pixels[left] = cut >> 8;
    pixels[left + 1] = cut & BYTE;
    pixels[left + 2] = Math.round(Math.sqrt(Math.max(0, fields.water[i]) / WATER_RANGE) * BYTE);
    pixels[right] = regolith >> 8;
    pixels[right + 1] = regolith & BYTE;
  }
  return pixels;
}

/**
 * the `land` texture's texels for an image of `size` cells a side, from its pixels at `stride` bytes each: 3 as
 * decoded in Node, 4 as a canvas hands them back. the suspended sediment is 0
 */
export function unpackStored(
  pixels: ArrayLike<number>,
  size: number,
  stride: number
): Float32Array {
  const width = size * 2;
  const land = new Float32Array(size * size * LAND_CHANNELS);
  for (let i = 0; i < size * size; i++) {
    const x = i % size;
    const y = Math.floor(i / size);
    const left = (y * width + x) * stride;
    const right = left + size * stride;
    const water = pixels[left + 2] / BYTE;
    land[i * LAND_CHANNELS] = ((pixels[left] * 256 + pixels[left + 1]) / WORD) * CUT_RANGE;
    land[i * LAND_CHANNELS + 1] =
      ((pixels[right] * 256 + pixels[right + 1]) / WORD) * REGOLITH_RANGE;
    land[i * LAND_CHANNELS + 2] = water * water * WATER_RANGE;
  }
  return land;
}
