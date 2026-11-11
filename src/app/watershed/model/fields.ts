/**
 * the simulation's state, as plain arrays. this is the reference model's memory, and its layout is the layout of
 * the GPU's textures: one array here is one channel there.
 *
 * ## bedrock is stored as what has been removed, not as a height
 *
 * the obvious state is the bedrock's height. it is wrong for 32-bit float, which is what the GPU has. at 2,400 m a
 * float resolves a quarter of a millimetre, and a step of erosion on a hillside is smaller than that: the rock
 * would not move while the sediment taken from it was still added to the water, and the model would manufacture
 * mass on every slope, every step. so the land is kept as two numbers: `uplift`, the height it was raised to,
 * which never changes and lives in `ITerrain`, and `cut`, the depth of rock taken off it since, which starts at
 * zero. bedrock is `uplift - cut`. `cut` is small exactly where erosion is slow, so the resolution is finest where
 * the amounts are, and the same holds on the GPU.
 *
 * ## a leaf module
 *
 * everything under `model/` is imported by Node scripts straight from the TypeScript, and Node will not resolve a
 * relative import without an extension while the Angular build forbids one with. so these files import types and
 * nothing else, and use only syntax that erases. `scripts/watershed-model.test.mjs` is the gate: it imports them
 * with Node, and fails the moment one stops being a leaf.
 */

/**
 * what has crossed the model's boundary, in cubic metres. the fields say what is on the land; the ledger says what
 * arrived and what left, so the two together can be checked against each other.
 */
export interface ILedger {
  /** water added by rain */
  rained: number;
  /** water removed by evaporation */
  evaporated: number;
  /** water that flowed off the edge of the block */
  drained: number;
  /** rock, as suspended sediment, that the water carried off the edge */
  exported: number;
}

export interface IFields {
  /** cells along one side; every array holds `size * size` of them, row by row */
  readonly size: number;
  /** depth of bedrock removed since the land was raised, metres */
  readonly cut: Float32Array;
  /** thickness of loose material lying on the bedrock, metres */
  readonly regolith: Float32Array;
  /** depth of water standing on the surface, metres */
  readonly water: Float32Array;
  /** sediment suspended in that water, as the thickness it would have lying down, metres */
  readonly suspended: Float32Array;
  /** water leaving toward x - 1, x + 1, y - 1 and y + 1, cubic metres a second */
  readonly fluxLeft: Float32Array;
  readonly fluxRight: Float32Array;
  readonly fluxUp: Float32Array;
  readonly fluxDown: Float32Array;
  /** the water's velocity, metres a second; positive toward x + 1 and y + 1 */
  readonly velocityX: Float32Array;
  readonly velocityY: Float32Array;
  /** loose material sliding toward each neighbour this step, metres of thickness */
  readonly slumpLeft: Float32Array;
  readonly slumpRight: Float32Array;
  readonly slumpUp: Float32Array;
  readonly slumpDown: Float32Array;
  /**
   * one sweep's snapshot. a pass that reads its neighbours must read what they were before the pass, as a shader
   * reading a texture does; the passes that need it copy into here first.
   */
  readonly scratch: Float32Array;
  readonly ledger: ILedger;
}

/** the land as it was raised, and what it is made of. none of it changes while the model runs */
export interface ITerrain {
  readonly size: number;
  /** the height the bedrock was raised to, metres */
  readonly uplift: Float32Array;
  /** added to a bedrock height before it is looked up in the strata, metres: the beds' tilt and folding */
  readonly warp: Float32Array;
  /** how readily each bed erodes, in (0, 1]; indexed by elevation, lowest bed first */
  readonly erodibility: Float32Array;
}

/** a still, dry, uncut land of `size` by `size` cells */
export function createFields(size: number): IFields {
  const cells = size * size;
  const field = (): Float32Array => new Float32Array(cells);
  return {
    size,
    cut: field(),
    regolith: field(),
    water: field(),
    suspended: field(),
    fluxLeft: field(),
    fluxRight: field(),
    fluxUp: field(),
    fluxDown: field(),
    velocityX: field(),
    velocityY: field(),
    slumpLeft: field(),
    slumpRight: field(),
    slumpUp: field(),
    slumpDown: field(),
    scratch: field(),
    ledger: { rained: 0, evaporated: 0, drained: 0, exported: 0 },
  };
}
