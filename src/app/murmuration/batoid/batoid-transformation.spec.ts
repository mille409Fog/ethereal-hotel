import { IFlight, IThreeTuple } from '../cauldron/cauldron-flight';
import { FLIGHT_SPEED } from './batoid-calibration';
import {
  flightStep,
  launchInitialState,
  launchSingleFlightState,
  spread,
  writeThreeTuple,
} from './batoid-transformation';
import { Random } from './batoid-types';

const RADII: IThreeTuple = { x: 1.2, y: 0.6, z: 0.2 };

/** a random source that replays the given draws in order, cycling when it runs out */
function sequence(...draws: number[]): Random {
  let i = 0;
  return () => draws[i++ % draws.length];
}

describe('spread', () => {
  const RADIUS = 2;

  it('maps a draw of 0 to the near edge, -radius', () => {
    expect(spread(() => 0, RADIUS)).toBe(-RADIUS);
  });

  it('maps a draw of one half to the centre', () => {
    expect(spread(() => 0.5, RADIUS)).toBe(0);
  });

  it('approaches +radius from below as the draw approaches 1, and never reaches it', () => {
    const edge = spread(() => 1 - Number.EPSILON, RADIUS);

    expect(edge).toBeLessThan(RADIUS);
    expect(edge).toBeCloseTo(RADIUS, 10);
  });

  it('is symmetric about the centre', () => {
    expect(spread(() => 0.25, RADIUS)).toBe(-spread(() => 0.75, RADIUS));
  });

  it('draws exactly once per call', () => {
    const random = vi.fn(() => 0.5);

    spread(random, RADIUS);

    expect(random).toHaveBeenCalledTimes(1);
  });
});

describe('launchSingleFlightState', () => {
  it('draws exactly four times: x, y, z, then heading', () => {
    const random = vi.fn(() => 0.5);

    launchSingleFlightState(random, RADII);

    expect(random).toHaveBeenCalledTimes(4);
  });

  it('spends its draws on position in x, y, z order', () => {
    const { position } = launchSingleFlightState(sequence(0, 0.25, 0.75, 0.5), RADII);

    expect(position.x).toBe(-RADII.x);
    expect(position.y).toBe(-RADII.y / 2);
    expect(position.z).toBe(RADII.z / 2);
  });

  it('spends its fourth draw on heading: a draw of one half flies along +x', () => {
    const { velocity } = launchSingleFlightState(sequence(0.5, 0.5, 0.5, 0.5), RADII);

    expect(velocity.x).toBeCloseTo(FLIGHT_SPEED, 10);
    expect(velocity.z).toBeCloseTo(0, 10);
  });

  it('turns a draw of three quarters into flight along +z', () => {
    const { velocity } = launchSingleFlightState(sequence(0.5, 0.5, 0.5, 0.75), RADII);

    expect(velocity.x).toBeCloseTo(0, 10);
    expect(velocity.z).toBeCloseTo(FLIGHT_SPEED, 10);
  });

  it('flies at FLIGHT_SPEED whatever the heading, and never vertically', () => {
    for (const draw of [0, 0.1, 0.33, 0.5, 0.62, 0.9, 1 - Number.EPSILON]) {
      const { velocity } = launchSingleFlightState(sequence(0.5, 0.5, 0.5, draw), RADII);

      expect(Math.hypot(velocity.x, velocity.y, velocity.z)).toBeCloseTo(FLIGHT_SPEED, 10);
      expect(velocity.y).toBe(0);
    }
  });
});

describe('launchInitialState', () => {
  const QUANTITY = 3;

  it('allocates three slots per bat in each array', () => {
    const flight = launchInitialState(sequence(0.5), RADII, QUANTITY);

    expect(flight.positions).toHaveLength(QUANTITY * 3);
    expect(flight.velocities).toHaveLength(QUANTITY * 3);
  });

  it('draws exactly four times per bat, so the quantity decides how many bats are launched', () => {
    const random = vi.fn(() => 0.5);

    launchInitialState(random, RADII, QUANTITY);

    expect(random).toHaveBeenCalledTimes(QUANTITY * 4);
  });

  it('launches nothing, and draws nothing, for a quantity of zero', () => {
    const random = vi.fn(() => 0.5);

    const flight = launchInitialState(random, RADII, 0);

    expect(flight.positions).toHaveLength(0);
    expect(random).not.toHaveBeenCalled();
  });

  it('writes bat i at offset i * 3, in the order launchSingleFlightState produces them', () => {
    const draws = [0.1, 0.9, 0.3, 0.2, 0.7, 0.4, 0.6, 0.8, 0.05, 0.95, 0.5, 0.35];
    const flight = launchInitialState(sequence(...draws), RADII, QUANTITY);
    const replay = sequence(...draws);

    for (let i = 0; i < QUANTITY; i++) {
      const o = i * 3;
      const { position, velocity } = launchSingleFlightState(replay, RADII);

      // values pass through a Float32Array, so they come back rounded to single precision
      expect(flight.positions[o]).toBeCloseTo(position.x, 6);
      expect(flight.positions[o + 1]).toBeCloseTo(position.y, 6);
      expect(flight.positions[o + 2]).toBeCloseTo(position.z, 6);
      expect(flight.velocities[o]).toBeCloseTo(velocity.x, 6);
      expect(flight.velocities[o + 1]).toBeCloseTo(velocity.y, 6);
      expect(flight.velocities[o + 2]).toBeCloseTo(velocity.z, 6);
    }
  });

  it('keeps every bat inside the radii and at FLIGHT_SPEED under a real random source', () => {
    const quantity = 500;
    const flight = launchInitialState(Math.random, RADII, quantity);

    for (let i = 0; i < quantity; i++) {
      const o = i * 3;
      const p = flight.positions;
      const v = flight.velocities;

      // fround: a draw just inside an edge can round outward to the edge's own single-precision value, never past it
      expect(Math.abs(p[o])).toBeLessThanOrEqual(Math.fround(RADII.x));
      expect(Math.abs(p[o + 1])).toBeLessThanOrEqual(Math.fround(RADII.y));
      expect(Math.abs(p[o + 2])).toBeLessThanOrEqual(Math.fround(RADII.z));
      expect(Math.hypot(v[o], v[o + 1], v[o + 2])).toBeCloseTo(FLIGHT_SPEED, 6);
    }
  });
});

describe('writeThreeTuple', () => {
  // every value here is exactly representable in single precision, so toBe is safe
  const TUPLE: IThreeTuple = { x: 0.5, y: -1.25, z: 2 };
  const UNTOUCHED = 9;

  /** three bats' worth of slots, each holding a sentinel that no write should produce */
  function slots(): Float32Array {
    return new Float32Array(9).fill(UNTOUCHED);
  }

  it('writes x, y and z into the three slots starting at the offset', () => {
    const array = slots();

    writeThreeTuple(array, 3, TUPLE);

    expect([array[3], array[4], array[5]]).toEqual([0.5, -1.25, 2]);
  });

  it('leaves every slot outside those three untouched', () => {
    const array = slots();

    writeThreeTuple(array, 3, TUPLE);

    expect([...array.slice(0, 3), ...array.slice(6)]).toEqual(Array(6).fill(UNTOUCHED));
  });

  it('writes the last bat at the last valid offset, length - 3', () => {
    const array = slots();

    writeThreeTuple(array, array.length - 3, TUPLE);

    expect([...array.slice(-3)]).toEqual([0.5, -1.25, 2]);
  });

  it('silently drops the part of a write that falls past the end of the array', () => {
    // not a behaviour to rely on: this is the trap that hid the old loop-bound bug
    const array = slots();

    expect(() => writeThreeTuple(array, array.length - 1, TUPLE)).not.toThrow();
    expect(array).toHaveLength(9);
    expect(array[8]).toBe(0.5);
  });
});

describe('flightStep', () => {
  // every value here, and every product and sum below, is exactly representable in single precision
  const POSITIONS = [0, 1, -2, 0.5, 0, 4];
  const VELOCITIES = [1, -2, 0.5, 0, 4, -0.25];

  /** two bats, built fresh for each test because flightStep writes in place */
  function flight(): IFlight {
    return { positions: new Float32Array(POSITIONS), velocities: new Float32Array(VELOCITIES) };
  }

  it('moves every component of every bat by its own velocity times the step', () => {
    const state = flight();

    flightStep(state, 0.5);

    expect([...state.positions]).toEqual([0.5, 0, -1.75, 0.5, 2, 3.875]);
  });

  it('writes into the flight it was given rather than returning a new one', () => {
    const state = flight();
    const positions = state.positions;

    flightStep(state, 0.5);

    expect(state.positions).toBe(positions);
  });

  it('leaves the velocities alone: straight-line flight does not steer', () => {
    const state = flight();

    flightStep(state, 0.5);

    expect([...state.velocities]).toEqual(VELOCITIES);
  });

  it('moves nothing for a step of zero seconds', () => {
    const state = flight();

    flightStep(state, 0);

    expect([...state.positions]).toEqual(POSITIONS);
  });

  it('adds up across steps, so two half steps land where one whole step does', () => {
    const halves = flight();
    const whole = flight();

    flightStep(halves, 0.25);
    flightStep(halves, 0.25);
    flightStep(whole, 0.5);

    expect([...halves.positions]).toEqual([...whole.positions]);
  });

  it('does nothing, and does not throw, for an empty flight', () => {
    const empty: IFlight = { positions: new Float32Array(0), velocities: new Float32Array(0) };

    expect(() => flightStep(empty, 1)).not.toThrow();
  });
});
