/**
 * raises a land off the main thread: noise at every cell, which on the 1,024 grid is 340 ms on this box's desktop
 * processor and so a second or more on a phone, frozen, once a visit and again at every **New land**.
 *
 * it hands back only what was computed, the bedrock's height and warp and the beds' table, and hands the buffers
 * over rather than copying them. the fields the model runs in are zeros, and the page makes its own: posting
 * fifteen empty arrays of a million cells would cost more than the noise did. `raise-land.ts` puts the two back
 * together.
 */
import type { IErosionConstants } from '../model/erosion-calibration';
import { raise } from '../model/reference';
import type { IRaiseAsked, IRaised } from './raise-land';

/** the part of a dedicated worker's scope this uses; the app's types are the window's, which posts differently */
interface IWorkerScope {
  addEventListener(type: 'message', listener: (event: MessageEvent<IRaiseAsked>) => void): void;
  postMessage(message: IRaised, transfer: Transferable[]): void;
}

const scope = globalThis.self as unknown as IWorkerScope;

scope.addEventListener('message', ({ data }) => {
  const constants: IErosionConstants = data.constants;
  const { terrain, strata } = raise(data.seed, data.size, constants);
  const raised: IRaised = {
    uplift: terrain.uplift,
    warp: terrain.warp,
    erodibility: strata.erodibility,
    colours: strata.colours,
  };
  scope.postMessage(raised, [
    raised.uplift.buffer,
    raised.warp.buffer,
    raised.erodibility.buffer,
    raised.colours.buffer,
  ]);
});
