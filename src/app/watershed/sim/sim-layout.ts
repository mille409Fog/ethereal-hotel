/**
 * the arrays of the reference model, packed into the four-channel texels the shaders read, and back.
 *
 * the channel a field lands in is decided here and nowhere else on the TypeScript side; the shaders' side of it
 * is the comment over each sampler in `sim-shaders.ts`. both drivers upload through these, so the route and the
 * verifying script cannot disagree about which channel is the water.
 *
 * a leaf module: see `model/fields.ts`.
 */
import type { IFields, ITerrain } from '../model/fields';
import type { IStrata } from '../model/strata';

/** numbers in one texel */
export const CHANNELS = 4;

/** `terrain`: uplift, strata warp, and two spare channels */
export function packTerrain(terrain: ITerrain): Float32Array {
  const packed = new Float32Array(terrain.uplift.length * CHANNELS);
  for (let i = 0; i < terrain.uplift.length; i++) {
    packed[i * CHANNELS] = terrain.uplift[i];
    packed[i * CHANNELS + 1] = terrain.warp[i];
  }
  return packed;
}

/** `strata`: one row, a bed's colour in red, green and blue and its erodibility in alpha */
export function packStrata(strata: IStrata): Float32Array {
  const beds = strata.erodibility.length;
  const packed = new Float32Array(beds * CHANNELS);
  for (let bed = 0; bed < beds; bed++) {
    packed[bed * CHANNELS] = strata.colours[bed * 3];
    packed[bed * CHANNELS + 1] = strata.colours[bed * 3 + 1];
    packed[bed * CHANNELS + 2] = strata.colours[bed * 3 + 2];
    packed[bed * CHANNELS + 3] = strata.erodibility[bed];
  }
  return packed;
}

/** `land`: cut, regolith, water depth, suspended sediment */
export function packLand(fields: IFields): Float32Array {
  const packed = new Float32Array(fields.cut.length * CHANNELS);
  for (let i = 0; i < fields.cut.length; i++) {
    packed[i * CHANNELS] = fields.cut[i];
    packed[i * CHANNELS + 1] = fields.regolith[i];
    packed[i * CHANNELS + 2] = fields.water[i];
    packed[i * CHANNELS + 3] = fields.suspended[i];
  }
  return packed;
}

/** writes a `land` texture's texels back into the four fields they came from */
export function unpackLand(packed: ArrayLike<number>, fields: IFields): void {
  for (let i = 0; i < fields.cut.length; i++) {
    fields.cut[i] = packed[i * CHANNELS];
    fields.regolith[i] = packed[i * CHANNELS + 1];
    fields.water[i] = packed[i * CHANNELS + 2];
    fields.suspended[i] = packed[i * CHANNELS + 3];
  }
}
