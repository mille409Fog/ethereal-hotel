/**
 * how much of everything is on the block, in cubic metres. this is what the readout shows a visitor, and it is
 * how the model is audited: with the ledger in `fields.ts` it gives two sums that must not move.
 *
 * - **rock**: `solid + ledger.exported` is what the land was raised with. water carries rock across the edge
 *   and nothing else creates or destroys it.
 * - **water**: `water - ledger.rained + ledger.evaporated + ledger.drained` is zero.
 *
 * the sums are taken in doubles over 32-bit cells, so they are exact about what the arrays hold and say nothing
 * the arrays do not.
 *
 * a leaf module: see `fields.ts`.
 */
import type { IErosionConstants } from './erosion-calibration';
import type { IFields, ITerrain } from './fields';

export interface ITally {
  /** bedrock above the zero of height: the raised land less what has been cut from it */
  readonly bedrock: number;
  /** loose material lying on the bedrock */
  readonly regolith: number;
  /** sediment in the water */
  readonly suspended: number;
  /** bedrock, regolith and suspended sediment together: all the rock still on the block */
  readonly solid: number;
  /** standing water */
  readonly water: number;
  /** bedrock removed since the land was raised: the readout's "rock moved" */
  readonly cut: number;
}

export function tally(fields: IFields, terrain: ITerrain, constants: IErosionConstants): ITally {
  const area = (constants.extent / fields.size) ** 2;
  let raised = 0;
  let cut = 0;
  let regolith = 0;
  let suspended = 0;
  let water = 0;
  for (let i = 0; i < fields.cut.length; i++) {
    raised += terrain.uplift[i];
    cut += fields.cut[i];
    regolith += fields.regolith[i];
    suspended += fields.suspended[i];
    water += fields.water[i];
  }
  const bedrock = (raised - cut) * area;
  return {
    bedrock,
    regolith: regolith * area,
    suspended: suspended * area,
    solid: bedrock + (regolith + suspended) * area,
    water: water * area,
    cut: cut * area,
  };
}
