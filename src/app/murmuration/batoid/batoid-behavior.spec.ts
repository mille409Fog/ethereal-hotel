import { IFlight, IThreeTuple } from '../cauldron/cauldron-flight';
import { emptyNeighbourhood, INeighbourhood } from './batoid-awareness';
import {
  alignment,
  cohesion,
  createSteeringScratch,
  cruise,
  homing,
  IBehaviourWeights,
  separation,
  steerFlight,
} from './batoid-behavior';
import { FLIGHT_SPEED, MAX_PITCH } from './batoid-calibration';
import { flightStep, launchInitialState } from './batoid-transformation';

/** a cauldron so wide that no bat below feels homing, unless a test means it to */
const OPEN_SKY: IThreeTuple = { x: 100, y: 100, z: 100 };
const UNIT: IThreeTuple = { x: 1, y: 1, z: 1 };

/** fixed here rather than read from calibration, so retuning the flock does not change what these tests mean */
const EQUAL: IBehaviourWeights = { separation: 1, alignment: 1, cohesion: 1, homing: 1 };

interface IBat {
  at: IThreeTuple;
  heading?: IThreeTuple;
}

function flock(...bats: IBat[]): IFlight {
  return {
    positions: new Float32Array(bats.flatMap(({ at }) => [at.x, at.y, at.z])),
    velocities: new Float32Array(
      bats.flatMap(({ heading = { x: 0, y: 0, z: 0 } }) => [heading.x, heading.y, heading.z])
    ),
  };
}

/** the same indices in all three spheres, so each behaviour is tested apart from awareness */
function seeing(...indices: number[]): INeighbourhood {
  return { separation: indices, alignment: indices, cohesion: indices };
}

describe('separation', () => {
  it('points away from a single neighbour with strength 1/distance', () => {
    const pair = flock({ at: { x: 0, y: 0, z: 0 } }, { at: { x: 0.5, y: 0, z: 0 } });

    expect(separation(pair, 0, seeing(1))).toEqual({ x: -2, y: 0, z: 0 });
  });

  it('is pushed harder by the nearer of two neighbours', () => {
    const line = flock(
      { at: { x: 0, y: 0, z: 0 } },
      { at: { x: 0.25, y: 0, z: 0 } },
      { at: { x: -0.5, y: 0, z: 0 } }
    );

    // 1/0.25 left, 1/0.5 right
    expect(separation(line, 0, seeing(1, 2))).toEqual({ x: -2, y: 0, z: 0 });
  });

  it('cancels between two neighbours equally far either side', () => {
    const between = flock(
      { at: { x: 0, y: 0, z: 0 } },
      { at: { x: 0, y: 0.5, z: 0 } },
      { at: { x: 0, y: -0.5, z: 0 } }
    );

    expect(separation(between, 0, seeing(1, 2))).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('skips a neighbour sitting exactly on top of it rather than dividing by zero', () => {
    const stacked = flock({ at: { x: 0.25, y: 0, z: 0 } }, { at: { x: 0.25, y: 0, z: 0 } });

    expect(separation(stacked, 0, seeing(1))).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('reads only the separation sphere', () => {
    const pair = flock({ at: { x: 0, y: 0, z: 0 } }, { at: { x: 0.5, y: 0, z: 0 } });
    const elsewhere: INeighbourhood = { separation: [], alignment: [1], cohesion: [1] };

    expect(separation(pair, 0, elsewhere)).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe('alignment', () => {
  it('asks a bat to match the mean heading of its neighbours', () => {
    const heading = flock(
      { at: { x: 0, y: 0, z: 0 }, heading: { x: 0, y: 0, z: 0 } },
      { at: { x: 1, y: 0, z: 0 }, heading: { x: 1, y: 0, z: 0 } },
      { at: { x: 0, y: 1, z: 0 }, heading: { x: 0, y: 0, z: 1 } }
    );

    expect(alignment(heading, 0, seeing(1, 2))).toEqual({ x: 0.5, y: 0, z: 0.5 });
  });

  it('asks nothing of a bat already flying with its neighbours', () => {
    const together = flock(
      { at: { x: 0, y: 0, z: 0 }, heading: { x: 0.25, y: 0, z: 0.5 } },
      { at: { x: 1, y: 0, z: 0 }, heading: { x: 0.25, y: 0, z: 0.5 } }
    );

    expect(alignment(together, 0, seeing(1))).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('asks nothing of a bat that sees nobody', () => {
    const alone = flock({ at: { x: 0, y: 0, z: 0 }, heading: { x: 1, y: 0, z: 0 } });

    expect(alignment(alone, 0, emptyNeighbourhood())).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('reads only the alignment sphere', () => {
    const pair = flock(
      { at: { x: 0, y: 0, z: 0 } },
      { at: { x: 1, y: 0, z: 0 }, heading: { x: 1, y: 0, z: 0 } }
    );
    const elsewhere: INeighbourhood = { separation: [1], alignment: [], cohesion: [1] };

    expect(alignment(pair, 0, elsewhere)).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe('cohesion', () => {
  it('points from the bat to the centre of its neighbours', () => {
    const triangle = flock(
      { at: { x: 0, y: 0, z: 0 } },
      { at: { x: 1, y: 0, z: 0 } },
      { at: { x: 0, y: 1, z: 0 } }
    );

    expect(cohesion(triangle, 0, seeing(1, 2))).toEqual({ x: 0.5, y: 0.5, z: 0 });
  });

  it('is zero for a bat already at the centre', () => {
    const centred = flock(
      { at: { x: 0, y: 0, z: 0 } },
      { at: { x: 0.5, y: 0, z: 0 } },
      { at: { x: -0.5, y: 0, z: 0 } }
    );

    expect(cohesion(centred, 0, seeing(1, 2))).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('asks nothing of a bat that sees nobody', () => {
    const alone = flock({ at: { x: 0.5, y: 0, z: 0 } });

    expect(cohesion(alone, 0, emptyNeighbourhood())).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('reads only the cohesion sphere', () => {
    const pair = flock({ at: { x: 0, y: 0, z: 0 } }, { at: { x: 1, y: 0, z: 0 } });
    const elsewhere: INeighbourhood = { separation: [1], alignment: [1], cohesion: [] };

    expect(cohesion(pair, 0, elsewhere)).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe('homing', () => {
  const STRETCHED: IThreeTuple = { x: 2, y: 1, z: 0.5 };

  it('asks nothing of a bat at the centre of the cauldron', () => {
    const centred = flock({ at: { x: 0, y: 0, z: 0 } });
    const { x, y, z } = homing(centred, 0, STRETCHED);

    expect(Math.hypot(x, y, z)).toBe(0);
  });

  it('pulls a bat on the surface back toward the centre with a strength of one', () => {
    const edge = flock({ at: { x: 2, y: 0, z: 0 } });

    expect(homing(edge, 0, STRETCHED).x).toBeCloseTo(-1);
  });

  it('measures against each axis of the ellipsoid, so every point of its surface pulls alike', () => {
    const surface = flock(
      { at: { x: 2, y: 0, z: 0 } },
      { at: { x: 0, y: 1, z: 0 } },
      { at: { x: 0, y: 0, z: -0.5 } }
    );
    const strength = (i: number): number => {
      const { x, y, z } = homing(surface, i, STRETCHED);
      return Math.hypot(x, y, z);
    };

    expect(strength(0)).toBeCloseTo(1);
    expect(strength(1)).toBeCloseTo(1);
    expect(strength(2)).toBeCloseTo(1);
    expect(homing(surface, 2, STRETCHED).z).toBeGreaterThan(0);
  });

  it('is barely there inside and grows fast outside: the cube of how far out the bat is', () => {
    const line = flock({ at: { x: 1, y: 0, z: 0 } }, { at: { x: 4, y: 0, z: 0 } });

    expect(homing(line, 0, STRETCHED).x).toBeCloseTo(-0.125);
    expect(homing(line, 1, STRETCHED).x).toBeCloseTo(-8);
  });

  it('always points back toward the centre', () => {
    const scattered = flock(
      { at: { x: 0.3, y: -0.7, z: 0.2 } },
      { at: { x: -2.5, y: 0.4, z: -0.9 } },
      { at: { x: 1.1, y: 1.6, z: 0.05 } }
    );
    for (let i = 0; i < 3; i++) {
      const home = homing(scattered, i, STRETCHED);
      const at = scattered.positions.slice(i * 3, i * 3 + 3);

      expect(home.x * at[0] + home.y * at[1] + home.z * at[2]).toBeLessThan(0);
    }
  });
});

const CLIMB = FLIGHT_SPEED * Math.sin(MAX_PITCH);
const STILL: IThreeTuple = { x: FLIGHT_SPEED, y: 0, z: 0 };

const speedOf = ({ x, y, z }: IThreeTuple): number => Math.hypot(x, y, z);

/** bat i's velocity read back out of the flight */
const velocityOf = (flight: IFlight, i: number): IThreeTuple => ({
  x: flight.velocities[i * 3],
  y: flight.velocities[i * 3 + 1],
  z: flight.velocities[i * 3 + 2],
});

describe('cruise', () => {
  it('puts any steer back at FLIGHT_SPEED', () => {
    expect(speedOf(cruise({ x: 3, y: 0, z: 4 }, STILL))).toBeCloseTo(FLIGHT_SPEED);
    expect(speedOf(cruise({ x: 0.001, y: 0, z: 0 }, STILL))).toBeCloseTo(FLIGHT_SPEED);
  });

  it('keeps the heading the steer chose', () => {
    const { x, z } = cruise({ x: 3, y: 0, z: 4 }, STILL);

    expect(x / z).toBeCloseTo(3 / 4);
  });

  it('holds a steep climb or dive at MAX_PITCH', () => {
    const up = cruise({ x: 0.1, y: 1, z: 0 }, STILL);
    const down = cruise({ x: 0.1, y: -1, z: 0 }, STILL);

    expect(up.y).toBeCloseTo(CLIMB);
    expect(down.y).toBeCloseTo(-CLIMB);
    expect(speedOf(up)).toBeCloseTo(FLIGHT_SPEED);
  });

  it('leaves a gentle climb as it was', () => {
    const gentle = { x: FLIGHT_SPEED * Math.cos(0.1), y: FLIGHT_SPEED * Math.sin(0.1), z: 0 };

    expect(cruise(gentle, STILL).y).toBeCloseTo(gentle.y);
  });

  it('carries on as it was when the steer has no heading', () => {
    const previous = { x: 0, y: 0.01, z: FLIGHT_SPEED };
    const kept = cruise({ x: 0, y: 1, z: 0 }, previous);

    expect(kept).toEqual(previous);
    expect(kept).not.toBe(previous);
  });
});

describe('steerFlight', () => {
  const NONE: IBehaviourWeights = { separation: 0, alignment: 0, cohesion: 0, homing: 0 };
  const TICK = 1 / 60;
  // fixed here rather than read from calibration, so retuning the flock does not change who these bats can see
  const SPHERES = { separation: 0.15, alignment: 7, cohesion: 7 };

  it('leaves a flock flying as one exactly as it was', () => {
    const together = flock(
      { at: { x: 0, y: 0, z: 0 }, heading: STILL },
      { at: { x: 0, y: 0, z: 0 }, heading: STILL }
    );

    steerFlight(together, TICK, SPHERES, EQUAL, OPEN_SKY);

    expect(velocityOf(together, 0).x).toBeCloseTo(FLIGHT_SPEED);
    expect(velocityOf(together, 1).x).toBeCloseTo(FLIGHT_SPEED);
  });

  it('changes nothing when every weight is zero', () => {
    const apart = flock(
      { at: { x: 0, y: 0, z: 0 }, heading: STILL },
      { at: { x: 0.1, y: 0, z: 0 }, heading: { x: 0, y: 0, z: FLIGHT_SPEED } }
    );
    const before = Array.from(apart.velocities);

    steerFlight(apart, TICK, SPHERES, NONE, OPEN_SKY);

    Array.from(apart.velocities).forEach((value, i) => expect(value).toBeCloseTo(before[i], 6));
  });

  it('turns two close bats away from each other', () => {
    const close = flock(
      { at: { x: -0.05, y: 0, z: 0 }, heading: { x: 0, y: 0, z: FLIGHT_SPEED } },
      { at: { x: 0.05, y: 0, z: 0 }, heading: { x: 0, y: 0, z: FLIGHT_SPEED } }
    );

    steerFlight(close, TICK, SPHERES, { ...NONE, separation: 1 }, OPEN_SKY);

    expect(velocityOf(close, 0).x).toBeLessThan(0);
    expect(velocityOf(close, 1).x).toBeGreaterThan(0);
  });

  describe('separation takes priority', () => {
    const ACROSS: IThreeTuple = { x: 0, y: 0, z: FLIGHT_SPEED };

    it('deafens a crowded bat to alignment and cohesion', () => {
      // a neighbour stacked on top crowds bat 0 but gives separation no direction, so any turn would be alignment's
      const stacked = flock(
        { at: { x: 0, y: 0, z: 0 }, heading: STILL },
        { at: { x: 0, y: 0, z: 0 }, heading: ACROSS }
      );

      steerFlight(stacked, TICK, SPHERES, EQUAL, OPEN_SKY);

      // exact: alignment alone would turn it by about 0.005 a tick, inside any loose tolerance
      expect(velocityOf(stacked, 0).x).toBeCloseTo(FLIGHT_SPEED);
      expect(velocityOf(stacked, 0).z).toBe(0);
    });

    it('lets an uncrowded bat listen to alignment and cohesion', () => {
      // the same neighbour moved out past the separation sphere, still among bat 0's nearest
      const near = flock(
        { at: { x: 0, y: 0, z: 0 }, heading: STILL },
        { at: { x: 0.3, y: 0, z: 0 }, heading: ACROSS }
      );

      steerFlight(near, TICK, SPHERES, EQUAL, OPEN_SKY);

      expect(velocityOf(near, 0).z).toBeGreaterThan(0);
    });

    it('still lets a crowded bat hear homing, so a crowd cannot push itself out of the cauldron', () => {
      // the stacked pair again, now out past the surface: separation has no direction and alignment is deafened
      const stacked = flock(
        { at: { x: 1.5, y: 0, z: 0 }, heading: ACROSS },
        { at: { x: 1.5, y: 0, z: 0 }, heading: STILL }
      );

      steerFlight(stacked, TICK, SPHERES, EQUAL, UNIT);

      expect(velocityOf(stacked, 0).x).toBeLessThan(0);
    });
  });

  describe('homing', () => {
    it('turns a lone bat flying outward back toward the centre', () => {
      // out past the surface and heading further out, a little off the radius
      const straying = flock({
        at: { x: 1.5, y: 0, z: 0 },
        heading: { x: FLIGHT_SPEED * Math.cos(0.3), y: 0, z: FLIGHT_SPEED * Math.sin(0.3) },
      });

      for (let tick = 0; tick < 30; tick++) {
        steerFlight(straying, TICK, SPHERES, EQUAL, UNIT);
      }

      expect(velocityOf(straying, 0).x).toBeLessThan(0);
    });

    it('keeps a launched flock near the cauldron for a long flight, with nothing to wrap it', () => {
      // a minute of ticks: long enough for every bat to cross the cauldron several times
      const quantity = 60;
      const ticks = 3600;
      const state = launchInitialState(Math.random, UNIT, quantity);
      const scratch = createSteeringScratch(quantity);
      let furthest = 0;

      for (let tick = 0; tick < ticks; tick++) {
        steerFlight(state, TICK, SPHERES, EQUAL, UNIT, scratch);
        flightStep(state, TICK);
        for (let i = 0; i < quantity * 3; i += 3) {
          const p = state.positions;
          furthest = Math.max(furthest, Math.hypot(p[i], p[i + 1], p[i + 2]));
        }
      }

      // a pull rather than a wall, so a launch corner already sits at √3 and bats overshoot the surface;
      // at twice its radius the pull is eight, and that is a ceiling no bat should reach
      expect(furthest).toBeLessThan(2);
    }, 30_000);
  });

  it('steers every bat from the flight as it stood, not as the bats before it were steered', () => {
    // mirror images in x: synchronous steering must keep them mirrored, sequential steering would not
    const a = FLIGHT_SPEED * Math.cos(1);
    const b = FLIGHT_SPEED * Math.sin(1);
    const mirrored = flock(
      { at: { x: -0.25, y: 0, z: 0 }, heading: { x: a, y: 0, z: b } },
      { at: { x: 0.25, y: 0, z: 0 }, heading: { x: -a, y: 0, z: b } }
    );

    steerFlight(mirrored, TICK, SPHERES, EQUAL, OPEN_SKY);

    expect(velocityOf(mirrored, 0).x).toBeCloseTo(-velocityOf(mirrored, 1).x, 6);
    expect(velocityOf(mirrored, 0).z).toBeCloseTo(velocityOf(mirrored, 1).z, 6);
  });

  it('keeps every bat at FLIGHT_SPEED and inside MAX_PITCH however it was pulled', () => {
    const tangle = flock(
      { at: { x: 0, y: 0, z: 0 }, heading: STILL },
      { at: { x: 0.02, y: 0.3, z: 0 }, heading: { x: 0, y: CLIMB, z: -0.3 } },
      { at: { x: -0.1, y: -0.2, z: 0.05 }, heading: { x: -0.3, y: -CLIMB, z: 0 } },
      { at: { x: 0.4, y: 0.1, z: -0.3 }, heading: { x: 0, y: 0, z: FLIGHT_SPEED } }
    );
    const scratch = createSteeringScratch(4);

    for (let tick = 0; tick < 30; tick++) {
      steerFlight(tangle, TICK, SPHERES, EQUAL, OPEN_SKY, scratch);
    }

    for (let i = 0; i < 4; i++) {
      const velocity = velocityOf(tangle, i);
      expect(speedOf(velocity)).toBeCloseTo(FLIGHT_SPEED, 5);
      expect(Math.abs(velocity.y)).toBeLessThanOrEqual(CLIMB + 1e-6);
    }
  });
});
