import { IFlight, IThreeTuple } from '../cauldron/cauldron-flight';
import { FLIGHT_SPEED, MAX_PITCH } from './batoid-calibration';
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

/** the fastest a bat may climb or dive: FLIGHT_SPEED tipped up by MAX_PITCH */
const MAX_CLIMB = FLIGHT_SPEED * Math.sin(MAX_PITCH);

describe('launchSingleFlightState', () => {
  it('draws exactly five times: x, y, z, heading, then climb', () => {
    const random = vi.fn(() => 0.5);

    launchSingleFlightState(random, RADII);

    expect(random).toHaveBeenCalledTimes(5);
  });

  it('spends its draws on position in x, y, z order', () => {
    const { position } = launchSingleFlightState(sequence(0, 0.25, 0.75, 0.5), RADII);

    expect(position.x).toBe(-RADII.x);
    expect(position.y).toBe(-RADII.y / 2);
    expect(position.z).toBe(RADII.z / 2);
  });

  it('spends its fourth draw on heading: a draw of one half flies along +x', () => {
    // the fifth draw is also one half, which is level flight
    const { velocity } = launchSingleFlightState(sequence(0.5, 0.5, 0.5, 0.5, 0.5), RADII);

    expect(velocity.x).toBeCloseTo(FLIGHT_SPEED, 10);
    expect(velocity.z).toBeCloseTo(0, 10);
  });

  it('turns a draw of three quarters into flight along +z', () => {
    const { velocity } = launchSingleFlightState(sequence(0.5, 0.5, 0.5, 0.75, 0.5), RADII);

    expect(velocity.x).toBeCloseTo(0, 10);
    expect(velocity.z).toBeCloseTo(FLIGHT_SPEED, 10);
  });

  it('spends its fifth draw on climb: one half is level flight', () => {
    const { velocity } = launchSingleFlightState(sequence(0.5, 0.5, 0.5, 0.5, 0.5), RADII);

    expect(velocity.y).toBe(0);
  });

  it('turns a draw of 0 into the steepest dive MAX_PITCH allows', () => {
    const { velocity } = launchSingleFlightState(sequence(0.5, 0.5, 0.5, 0.5, 0), RADII);

    expect(velocity.y).toBeCloseTo(-MAX_CLIMB, 10);
  });

  it('turns a draw of three quarters into a climb at half the steepest rate', () => {
    const { velocity } = launchSingleFlightState(sequence(0.5, 0.5, 0.5, 0.5, 0.75), RADII);

    expect(velocity.y).toBeCloseTo(MAX_CLIMB / 2, 10);
  });

  it('takes the climb out of the level speed, so it tips the heading rather than turning it', () => {
    // heading +x and climbing: all of the horizontal speed stays on x
    const { velocity } = launchSingleFlightState(sequence(0.5, 0.5, 0.5, 0.5, 0.75), RADII);

    expect(velocity.z).toBeCloseTo(0, 10);
    expect(velocity.x).toBeCloseTo(Math.sqrt(FLIGHT_SPEED ** 2 - velocity.y ** 2), 10);
  });

  it('flies at FLIGHT_SPEED whatever the heading and climb, and never steeper than MAX_PITCH', () => {
    const draws = [0, 0.1, 0.33, 0.5, 0.62, 0.9, 1 - Number.EPSILON];
    for (const heading of draws) {
      for (const climb of draws) {
        const { velocity } = launchSingleFlightState(
          sequence(0.5, 0.5, 0.5, heading, climb),
          RADII
        );
        const level = Math.hypot(velocity.x, velocity.z);

        expect(Math.hypot(velocity.x, velocity.y, velocity.z)).toBeCloseTo(FLIGHT_SPEED, 10);
        expect(Math.abs(Math.atan2(velocity.y, level))).toBeLessThanOrEqual(MAX_PITCH + 1e-12);
      }
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

  it('draws exactly five times per bat, so the quantity decides how many bats are launched', () => {
    const random = vi.fn(() => 0.5);

    launchInitialState(random, RADII, QUANTITY);

    expect(random).toHaveBeenCalledTimes(QUANTITY * 5);
  });

  it('launches nothing, and draws nothing, for a quantity of zero', () => {
    const random = vi.fn(() => 0.5);

    const flight = launchInitialState(random, RADII, 0);

    expect(flight.positions).toHaveLength(0);
    expect(random).not.toHaveBeenCalled();
  });

  it('writes bat i at offset i * 3, in the order launchSingleFlightState produces them', () => {
    // fifteen draws, five per bat, so no two bats share a climb
    const draws = [0.1, 0.9, 0.3, 0.2, 0.7, 0.4, 0.6, 0.8, 0.05, 0.95, 0.5, 0.35, 0.15, 0.85, 0.25];
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

  it('keeps every bat inside the radii, at FLIGHT_SPEED and within MAX_PITCH under a real random source', () => {
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
      // single precision again: the climb can round a hair past its exact bound
      expect(Math.abs(v[o + 1])).toBeLessThanOrEqual(Math.fround(MAX_CLIMB) * (1 + 1e-6));
    }
  });

  it('launches some bats climbing and some diving under a real random source', () => {
    // a launch that silently dropped the climb would pass every bound above
    const flight = launchInitialState(Math.random, RADII, 500);
    const climbs = [...flight.velocities].filter((_, i) => i % 3 === 1);

    expect(climbs.some((vy) => vy > 0)).toBe(true);
    expect(climbs.some((vy) => vy < 0)).toBe(true);
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

  /** a box no bat in POSITIONS can reach in these steps, so the motion tests never wrap */
  const OPEN_SKY: IThreeTuple = { x: 100, y: 100, z: 100 };

  /** two bats, built fresh for each test because flightStep writes in place */
  function flight(): IFlight {
    return { positions: new Float32Array(POSITIONS), velocities: new Float32Array(VELOCITIES) };
  }

  /** a single bat, for the wrapping tests, where which component crosses which edge is the point */
  function bat(position: IThreeTuple, velocity: IThreeTuple): IFlight {
    return {
      positions: new Float32Array([position.x, position.y, position.z]),
      velocities: new Float32Array([velocity.x, velocity.y, velocity.z]),
    };
  }

  it('moves every component of every bat by its own velocity times the step', () => {
    const state = flight();

    flightStep(state, 0.5, OPEN_SKY);

    expect([...state.positions]).toEqual([0.5, 0, -1.75, 0.5, 2, 3.875]);
  });

  it('writes into the flight it was given rather than returning a new one', () => {
    const state = flight();
    const positions = state.positions;

    flightStep(state, 0.5, OPEN_SKY);

    expect(state.positions).toBe(positions);
  });

  it('leaves the velocities alone: straight-line flight does not steer', () => {
    const state = flight();

    flightStep(state, 0.5, OPEN_SKY);

    expect([...state.velocities]).toEqual(VELOCITIES);
  });

  it('moves nothing for a step of zero seconds', () => {
    const state = flight();

    flightStep(state, 0, OPEN_SKY);

    expect([...state.positions]).toEqual(POSITIONS);
  });

  it('adds up across steps, so two half steps land where one whole step does', () => {
    const halves = flight();
    const whole = flight();

    flightStep(halves, 0.25, OPEN_SKY);
    flightStep(halves, 0.25, OPEN_SKY);
    flightStep(whole, 0.5, OPEN_SKY);

    expect([...halves.positions]).toEqual([...whole.positions]);
  });

  it('does nothing, and does not throw, for an empty flight', () => {
    const empty: IFlight = { positions: new Float32Array(0), velocities: new Float32Array(0) };

    expect(() => flightStep(empty, 1, OPEN_SKY)).not.toThrow();
  });

  describe('wrapping', () => {
    const UNIT: IThreeTuple = { x: 1, y: 1, z: 1 };

    it('carries a bat past +radius round to the far side, keeping its overshoot', () => {
      // 0.75 + 1 × 0.5 = 1.25, a quarter past the edge, so a quarter inside the other one
      const state = bat({ x: 0.75, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });

      flightStep(state, 0.5, UNIT);

      expect(state.positions[0]).toBe(-0.75);
    });

    it('carries a bat past -radius round to the far side as well', () => {
      const state = bat({ x: -0.75, y: 0, z: 0 }, { x: -1, y: 0, z: 0 });

      flightStep(state, 0.5, UNIT);

      expect(state.positions[0]).toBe(0.75);
    });

    it('wraps y and z too, at both edges', () => {
      const rising = bat({ x: 0, y: 0.75, z: -0.75 }, { x: 0, y: 1, z: -1 });

      flightStep(rising, 0.5, UNIT);

      expect([...rising.positions]).toEqual([0, -0.75, 0.75]);
    });

    it('wraps each axis against its own radius, not one shared bound', () => {
      const radii: IThreeTuple = { x: 1, y: 2, z: 4 };
      // every component lands at 1.25: past x's edge, inside y's and z's
      const state = bat({ x: 0.75, y: 0.75, z: 0.75 }, { x: 1, y: 1, z: 1 });

      flightStep(state, 0.5, radii);

      expect([...state.positions]).toEqual([-0.75, 1.25, 1.25]);
    });

    it('leaves a bat that is still inside the box exactly where flight put it', () => {
      const state = bat({ x: 0.25, y: -0.25, z: 0 }, { x: 1, y: -1, z: 1 });

      flightStep(state, 0.5, UNIT);

      expect([...state.positions]).toEqual([0.75, -0.75, 0.5]);
    });

    it('keeps a whole launched flock inside the box for a long flight', () => {
      // ten minutes of ticks: long enough for every bat to cross the box many times
      const quantity = 200;
      const ticks = 36_000;
      const state = launchInitialState(Math.random, RADII, quantity);

      for (let t = 0; t < ticks; t++) {
        flightStep(state, 1 / 60, RADII);
      }

      const radius = [RADII.x, RADII.y, RADII.z];
      state.positions.forEach((p, i) => {
        // fround: the edge itself is only as exact as single precision makes it
        expect(Math.abs(p)).toBeLessThanOrEqual(Math.fround(radius[i % 3]));
      });
    });
  });
});
