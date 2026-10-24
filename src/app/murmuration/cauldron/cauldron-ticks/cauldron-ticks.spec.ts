import { bankFlight, createBanking, IBanking } from '../../batoid/batoid-banking/batoid-banking';
import {
  createSteeringScratch,
  ISteeringScratch,
  steerFlight,
} from '../../batoid/batoid-behavior/batoid-behavior';
import * as CALIBRATION from '../../batoid/batoid-calibration';
import {
  flightStep,
  launchInitialState,
} from '../../batoid/batoid-transformation/batoid-transformation';
import { Random } from '../../batoid/batoid-types';
import { IFlight } from '../cauldron-flight';
import { flyTicks } from './cauldron-ticks';

/** enough bats to crowd one another, few enough to fly a second of ticks quickly */
const QUANTITY = 40;

/** a random source, but the same one every run */
function seeded(seed: number): Random {
  let state = seed;
  return (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

interface IFlock {
  readonly flight: IFlight;
  readonly banking: IBanking;
  readonly scratch: ISteeringScratch;
}

/** a freshly launched flock; the same seed gives the same flock */
function launch(seed = 7): IFlock {
  const flight = launchInitialState(seeded(seed), CALIBRATION.INITIAL_DIMENSIONS, QUANTITY);
  return { flight, banking: createBanking(flight), scratch: createSteeringScratch(QUANTITY) };
}

/** everything a tick can write, copied so a later tick cannot change it */
function snapshot(flock: IFlock): Float32Array[] {
  return [
    flock.flight.positions.slice(),
    flock.flight.velocities.slice(),
    flock.banking.rolls.slice(),
  ];
}

describe('flyTicks', () => {
  it('leaves the flock exactly where it was when the frame was worth no ticks', () => {
    const flock = launch();
    const before = snapshot(flock);

    flyTicks(flock.flight, flock.banking, flock.scratch, 0);

    expect(snapshot(flock)).toEqual(before);
  });

  it('steers, then banks, then flies, once per tick', () => {
    const flown = launch();
    const byHand = launch();

    flyTicks(flown.flight, flown.banking, flown.scratch, 30);
    for (let i = 0; i < 30; i++) {
      steerFlight(
        byHand.flight,
        CALIBRATION.TICK_SECONDS,
        CALIBRATION.AWARENESS,
        CALIBRATION.BEHAVIOUR_WEIGHTS,
        CALIBRATION.INITIAL_DIMENSIONS,
        byHand.scratch
      );
      bankFlight(byHand.flight, byHand.banking, CALIBRATION.TICK_SECONDS);
      flightStep(byHand.flight, CALIBRATION.TICK_SECONDS);
    }

    expect(snapshot(flown)).toEqual(snapshot(byHand));
  });

  it('would fly a different flock if it moved before steering, so the order above is a real constraint', () => {
    const flown = launch();
    const reordered = launch();

    flyTicks(flown.flight, flown.banking, flown.scratch, 30);
    for (let i = 0; i < 30; i++) {
      flightStep(reordered.flight, CALIBRATION.TICK_SECONDS);
      steerFlight(
        reordered.flight,
        CALIBRATION.TICK_SECONDS,
        CALIBRATION.AWARENESS,
        CALIBRATION.BEHAVIOUR_WEIGHTS,
        CALIBRATION.INITIAL_DIMENSIONS,
        reordered.scratch
      );
      bankFlight(reordered.flight, reordered.banking, CALIBRATION.TICK_SECONDS);
    }

    expect(snapshot(flown)[0]).not.toEqual(snapshot(reordered)[0]);
  });

  it('flies the same flock whether a frame brings many ticks or each frame brings one', () => {
    const inOneFrame = launch();
    const frameByFrame = launch();

    flyTicks(inOneFrame.flight, inOneFrame.banking, inOneFrame.scratch, 60);
    for (let i = 0; i < 60; i++) {
      flyTicks(frameByFrame.flight, frameByFrame.banking, frameByFrame.scratch, 1);
    }

    expect(snapshot(inOneFrame)).toEqual(snapshot(frameByFrame));
  });

  it('flies the same flock from the same seed, so a run can be replayed', () => {
    const first = launch(42);
    const second = launch(42);

    flyTicks(first.flight, first.banking, first.scratch, 60);
    flyTicks(second.flight, second.banking, second.scratch, 60);

    expect(snapshot(first)).toEqual(snapshot(second));
  });
});
