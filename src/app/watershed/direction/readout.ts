/**
 * what the readout says: how far the storm has got, how much rain it has delivered, how much rock it has moved
 * and how much it has carried off the block. what the model actually knows, and in its own units: steps, a depth
 * and two volumes. no years: the model has no calendar (`WATERSHED.md`).
 *
 * - **the rain is counted, not measured.** each step adds `rainRate × timestep × strength` to every cell
 *   (`model/step.ts`), so the depth delivered is that sum over the steps run, worked out as they run.
 * - **the rock is measured.** the readout's two volumes come from a sum of `land` read back from the GPU
 *   (`readback.ts`), so they are what the simulation holds and not an estimate. rock moved is the bedrock cut,
 *   the readout's word for `ITally.cut` in `model/tally.ts`.
 * - **rock carried off is what is missing.** the GPU keeps no ledger, but every pass conserves rock exactly
 *   (`WATERSHED.md`, §Decisions), so what has left the block is what was cut and is not on it now as regolith or
 *   sediment. at the start that is a difference of rounding, so it is never shown below zero.
 */
import { IErosionConstants } from '../model/erosion-calibration';

export interface IReadout {
  /** steps run, and in all */
  readonly steps: number;
  readonly total: number;
  /** depth of rain delivered to every cell so far, metres */
  readonly rain: number;
  /** bedrock cut, and rock carried off the edge, cubic metres; null until the land has first been read */
  readonly moved: number | null;
  readonly exported: number | null;
}

/** the two volumes from the land's sums over every cell: cut, regolith, water, suspended sediment */
export function volumesOf(
  sums: ArrayLike<number>,
  size: number,
  constants: IErosionConstants
): { readonly moved: number; readonly exported: number } {
  const area = (constants.extent / size) ** 2;
  const cut = sums[0] * area;
  return { moved: cut, exported: Math.max(0, (sums[0] - sums[1] - sums[3]) * area) };
}

const COUNT = new Intl.NumberFormat('en-US');
const DEPTH = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const SIGNIFICANT = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 3 });

/** a volume in words a reader can hold: three figures, in millions or billions of cubic metres past a million */
export function volume(cubicMetres: number): string {
  if (cubicMetres >= 1e9) {
    return `${SIGNIFICANT.format(cubicMetres / 1e9)} billion m³`;
  }
  if (cubicMetres >= 1e6) {
    return `${SIGNIFICANT.format(cubicMetres / 1e6)} million m³`;
  }
  return `${COUNT.format(Math.round(cubicMetres))} m³`;
}

/** a depth of rain in metres, to the centimetre */
export function depth(metres: number): string {
  return `${DEPTH.format(metres)} m`;
}

/** what the readout shows before the land has been read */
export const UNREAD = 'not read yet';

/** the readout's rows, as label and value */
export function readoutRows(readout: IReadout): ReadonlyArray<readonly [string, string]> {
  return [
    ['Step', `${COUNT.format(readout.steps)} of ${COUNT.format(readout.total)}`],
    ['Rain', depth(readout.rain)],
    ['Rock moved', readout.moved === null ? UNREAD : volume(readout.moved)],
    ['Carried off', readout.exported === null ? UNREAD : volume(readout.exported)],
  ];
}

/** the readout as one sentence, for the throttled status a screen reader hears */
export function readoutDigest(readout: IReadout): string {
  const storm = `Step ${COUNT.format(readout.steps)} of ${COUNT.format(readout.total)}; ${depth(readout.rain)} of rain.`;
  if (readout.moved === null || readout.exported === null) {
    return storm;
  }
  return `${storm} ${volume(readout.moved)} of rock moved, ${volume(readout.exported)} carried off the block.`;
}
