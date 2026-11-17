import { EROSION } from '../model/erosion-calibration';
import { raise } from '../model/reference';
import { HERO_SEED } from '../seed/seed';
import { IRaiseAsked, IRaised, landOf, raiseHere, raiseInWorker } from './raise-land';

const SIZE = 8;

/** what the worker computes for the hero seed, as it would hand it back */
const answered = (): IRaised => {
  const { terrain, strata } = raise(HERO_SEED, SIZE, EROSION);
  return {
    uplift: terrain.uplift,
    warp: terrain.warp,
    erodibility: strata.erodibility,
    colours: strata.colours,
  };
};

/** a worker that records what it was told and answers when the spec says */
class FakeWorker {
  public readonly posted: IRaiseAsked[] = [];
  public readonly terminate = vi.fn();
  private readonly listeners = new Map<string, Array<(event: unknown) => void>>();

  public addEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  public postMessage(message: IRaiseAsked): void {
    this.posted.push(message);
  }

  public answer(raised: IRaised): void {
    this.listeners.get('message')?.forEach((listener) => listener({ data: raised }));
  }

  public fail(): void {
    this.listeners.get('error')?.forEach((listener) => listener(new Event('error')));
  }
}

const spawned = (): { worker: FakeWorker; spawn: () => Worker } => {
  const worker = new FakeWorker();
  return { worker, spawn: () => worker as unknown as Worker };
};

describe('raising a land', () => {
  it('puts the worker’s answer back together with fresh fields over it', () => {
    const raised = answered();
    const land = landOf(HERO_SEED, SIZE, raised);

    expect(land.seed).toBe(HERO_SEED);
    expect(land.terrain.uplift).toBe(raised.uplift);
    expect(land.terrain.warp).toBe(raised.warp);
    expect(land.terrain.erodibility).toBe(raised.erodibility);
    expect(land.strata.colours).toBe(raised.colours);
    expect(land.fields.size).toBe(SIZE);
    expect(land.fields.cut.every((value) => value === 0)).toBe(true);
  });

  it('is the land at once on this thread', () => {
    const raising = raiseHere(HERO_SEED, SIZE, EROSION);

    expect(raising.land?.terrain.uplift).toEqual(raise(HERO_SEED, SIZE, EROSION).terrain.uplift);
    raising.cancel();
    expect(raising.land).not.toBeNull();
  });

  describe('in a worker', () => {
    it('asks the worker for the seed, the grid and the constants, and has no land until it answers', () => {
      const { worker, spawn } = spawned();
      const raising = raiseInWorker(spawn)(HERO_SEED, SIZE, EROSION);

      expect(worker.posted).toEqual([{ seed: HERO_SEED, size: SIZE, constants: EROSION }]);
      expect(raising.land).toBeNull();

      worker.answer(answered());

      expect(raising.land?.terrain.uplift).toEqual(raise(HERO_SEED, SIZE, EROSION).terrain.uplift);
      expect(worker.terminate).toHaveBeenCalledTimes(1);
    });

    it('ends the worker when the land is not wanted, and takes no answer after', () => {
      const { worker, spawn } = spawned();
      const raising = raiseInWorker(spawn)(HERO_SEED, SIZE, EROSION);

      raising.cancel();
      worker.answer(answered());

      expect(raising.land).toBeNull();
      expect(worker.terminate).toHaveBeenCalledTimes(1);
    });

    it('raises the land here when the worker fails, so the storm still starts', () => {
      const { worker, spawn } = spawned();
      const raising = raiseInWorker(spawn)(HERO_SEED, SIZE, EROSION);

      worker.fail();

      expect(raising.land?.terrain.uplift).toEqual(raise(HERO_SEED, SIZE, EROSION).terrain.uplift);
      expect(worker.terminate).toHaveBeenCalledTimes(1);
    });
  });

  describe('the worker itself', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.resetModules();
    });

    it('raises the land it is asked for, and hands its buffers over rather than copying them', async () => {
      let listener: ((event: { data: IRaiseAsked }) => void) | undefined;
      const posted: Array<{ message: IRaised; transfer: Transferable[] }> = [];
      vi.stubGlobal('self', {
        addEventListener: (_type: string, given: typeof listener) => {
          listener = given;
        },
        postMessage: (message: IRaised, transfer: Transferable[]) =>
          posted.push({ message, transfer }),
      });
      await import('./raise.worker');

      listener?.({ data: { seed: HERO_SEED, size: SIZE, constants: EROSION } });

      const expected = answered();
      expect(posted).toHaveLength(1);
      expect(posted[0].message).toEqual(expected);
      expect(posted[0].transfer).toEqual([
        posted[0].message.uplift.buffer,
        posted[0].message.warp.buffer,
        posted[0].message.erodibility.buffer,
        posted[0].message.colours.buffer,
      ]);
    });
  });
});
