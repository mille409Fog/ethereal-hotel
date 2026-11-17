/**
 * a land being raised, which the frame loop asks after once a frame until it is there.
 *
 * raising is noise at every cell, and on the main thread it was a hitch the visitor saw: 340 ms on the 1,024 grid
 * on this box's desktop processor, a second or more on a phone, at the start and at every **New land**. so it is
 * done in a worker (`raise.worker.ts`) and the storm starts in the first frame after the land comes back; until
 * then the stage stands in its air with nothing on it, as it does while the quality meter measures.
 *
 * it is polled and not a promise because the thing waiting for it is a frame loop: a frame either has a land to
 * start a storm on or it does not. that also lets a spec hand back a land that is there at once and drive the
 * component frame by frame, with nothing to await.
 *
 * where there is no `Worker`, or the worker fails, the land is raised here, on this thread, as it always was. the
 * same seed raises the same land on either: the worker runs the same function on the same numbers.
 */
import { IErosionConstants } from '../model/erosion-calibration';
import { createFields } from '../model/fields';
import { ILand } from '../model/land';
import { raise } from '../model/reference';

export interface IRaising {
  /** the land, once it has been raised; null until then */
  readonly land: ILand | null;
  /** nobody wants it any more: a **New land** asked for another, or the page has gone */
  cancel(): void;
}

/** what is asked of the worker */
export interface IRaiseAsked {
  readonly seed: number;
  readonly size: number;
  readonly constants: IErosionConstants;
}

/** what the worker hands back: what the noise made, and nothing the page can make as cheaply itself */
export interface IRaised {
  readonly uplift: Float32Array;
  readonly warp: Float32Array;
  readonly erodibility: Float32Array;
  readonly colours: Float32Array;
}

export type RaiseLand = (seed: number, size: number, constants: IErosionConstants) => IRaising;

/** the worker's answer as a land: its terrain and its beds, and fresh fields over them */
export function landOf(seed: number, size: number, raised: IRaised): ILand {
  return {
    seed,
    fields: createFields(size),
    terrain: { size, uplift: raised.uplift, warp: raised.warp, erodibility: raised.erodibility },
    strata: { erodibility: raised.erodibility, colours: raised.colours },
  };
}

/** raises the land on this thread, before returning: what the page did before there was a worker */
export const raiseHere: RaiseLand = (seed, size, constants) => ({
  land: raise(seed, size, constants),
  cancel: (): void => undefined,
});

/**
 * raises the land in a worker made by `spawn`, one worker a land, ended once it has answered or is no longer
 * wanted. a worker that fails is answered here instead, so the storm still starts
 */
export function raiseInWorker(spawn: () => Worker): RaiseLand {
  return (seed, size, constants) => {
    let land: ILand | null = null;
    let done = false;
    const worker = spawn();
    const finish = (raised: ILand | null): void => {
      if (!done) {
        done = true;
        land = raised;
        worker.terminate();
      }
    };
    worker.addEventListener('message', (event: MessageEvent<IRaised>) => {
      finish(landOf(seed, size, event.data));
    });
    worker.addEventListener('error', () => {
      finish(raise(seed, size, constants));
    });
    const asked: IRaiseAsked = { seed, size, constants };
    worker.postMessage(asked);
    return {
      get land(): ILand | null {
        return land;
      },
      cancel: (): void => {
        finish(null);
      },
    };
  };
}

/** the worker this app raises its lands in */
export const spawnRaiseWorker = (): Worker =>
  new Worker(new URL('./raise.worker', import.meta.url), { type: 'module' });
