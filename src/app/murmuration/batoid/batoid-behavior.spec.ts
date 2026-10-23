import { IFlight, IThreeTuple } from '../cauldron/cauldron-flight';
import { emptyNeighbourhood, INeighbourhood } from './batoid-awareness';
import {
  alignment,
  cohesion,
  createSteeringScratch,
  cruise,
  IBehaviourWeights,
  separation,
  steerFlight,
} from './batoid-behavior';
import { AWARENESS, BEHAVIOUR_WEIGHTS, FLIGHT_SPEED, MAX_PITCH } from './batoid-calibration';

/** a box no bat below is near the faces of, so nothing here wraps unless a test means it to */
const OPEN_SKY: IThreeTuple = { x: 100, y: 100, z: 100 };
const UNIT: IThreeTuple = { x: 1, y: 1, z: 1 };

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

    expect(separation(pair, 0, seeing(1), OPEN_SKY)).toEqual({ x: -2, y: 0, z: 0 });
  });

  it('is pushed harder by the nearer of two neighbours', () => {
    const line = flock(
      { at: { x: 0, y: 0, z: 0 } },
      { at: { x: 0.25, y: 0, z: 0 } },
      { at: { x: -0.5, y: 0, z: 0 } }
    );

    // 1/0.25 left, 1/0.5 right
    expect(separation(line, 0, seeing(1, 2), OPEN_SKY)).toEqual({ x: -2, y: 0, z: 0 });
  });

  it('cancels between two neighbours equally far either side', () => {
    const between = flock(
      { at: { x: 0, y: 0, z: 0 } },
      { at: { x: 0, y: 0.5, z: 0 } },
      { at: { x: 0, y: -0.5, z: 0 } }
    );

    expect(separation(between, 0, seeing(1, 2), OPEN_SKY)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('skips a neighbour sitting exactly on top of it rather than dividing by zero', () => {
    const stacked = flock({ at: { x: 0.25, y: 0, z: 0 } }, { at: { x: 0.25, y: 0, z: 0 } });

    expect(separation(stacked, 0, seeing(1), OPEN_SKY)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('pushes back through a face from a neighbour on the far side of it', () => {
    const across = flock({ at: { x: 0.875, y: 0, z: 0 } }, { at: { x: -0.875, y: 0, z: 0 } });

    // 0.25 apart through +1, so bat 0 is pushed towards -x
    expect(separation(across, 0, seeing(1), UNIT).x).toBeCloseTo(-4);
  });

  it('reads only the separation sphere', () => {
    const pair = flock({ at: { x: 0, y: 0, z: 0 } }, { at: { x: 0.5, y: 0, z: 0 } });
    const elsewhere: INeighbourhood = { separation: [], alignment: [1], cohesion: [1] };

    expect(separation(pair, 0, elsewhere, OPEN_SKY)).toEqual({ x: 0, y: 0, z: 0 });
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

    expect(cohesion(triangle, 0, seeing(1, 2), OPEN_SKY)).toEqual({ x: 0.5, y: 0.5, z: 0 });
  });

  it('is zero for a bat already at the centre', () => {
    const centred = flock(
      { at: { x: 0, y: 0, z: 0 } },
      { at: { x: 0.5, y: 0, z: 0 } },
      { at: { x: -0.5, y: 0, z: 0 } }
    );

    expect(cohesion(centred, 0, seeing(1, 2), OPEN_SKY)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('asks nothing of a bat that sees nobody', () => {
    const alone = flock({ at: { x: 0.5, y: 0, z: 0 } });

    expect(cohesion(alone, 0, emptyNeighbourhood(), OPEN_SKY)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('finds the centre through a face rather than in the middle of the box', () => {
    // both neighbours sit just across +1; a naive mean of positions would pull bat 0 back across the box
    const across = flock(
      { at: { x: 0.875, y: 0, z: 0 } },
      { at: { x: -0.875, y: 0, z: 0 } },
      { at: { x: -0.625, y: 0, z: 0 } }
    );

    // offsets of 0.25 and 0.5 through the face
    expect(cohesion(across, 0, seeing(1, 2), UNIT).x).toBeCloseTo(0.375);
  });

  it('reads only the cohesion sphere', () => {
    const pair = flock({ at: { x: 0, y: 0, z: 0 } }, { at: { x: 1, y: 0, z: 0 } });
    const elsewhere: INeighbourhood = { separation: [1], alignment: [1], cohesion: [] };

    expect(cohesion(pair, 0, elsewhere, OPEN_SKY)).toEqual({ x: 0, y: 0, z: 0 });
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
  const NONE: IBehaviourWeights = { separation: 0, alignment: 0, cohesion: 0 };
  const TICK = 1 / 60;

  it('leaves a flock flying as one exactly as it was', () => {
    const together = flock(
      { at: { x: 0, y: 0, z: 0 }, heading: STILL },
      { at: { x: 0, y: 0, z: 0 }, heading: STILL }
    );

    steerFlight(together, TICK, AWARENESS, BEHAVIOUR_WEIGHTS, OPEN_SKY);

    expect(velocityOf(together, 0).x).toBeCloseTo(FLIGHT_SPEED);
    expect(velocityOf(together, 1).x).toBeCloseTo(FLIGHT_SPEED);
  });

  it('changes nothing when every weight is zero', () => {
    const apart = flock(
      { at: { x: 0, y: 0, z: 0 }, heading: STILL },
      { at: { x: 0.1, y: 0, z: 0 }, heading: { x: 0, y: 0, z: FLIGHT_SPEED } }
    );
    const before = Array.from(apart.velocities);

    steerFlight(apart, TICK, AWARENESS, NONE, OPEN_SKY);

    Array.from(apart.velocities).forEach((value, i) => expect(value).toBeCloseTo(before[i], 6));
  });

  it('turns two close bats away from each other', () => {
    const close = flock(
      { at: { x: -0.05, y: 0, z: 0 }, heading: { x: 0, y: 0, z: FLIGHT_SPEED } },
      { at: { x: 0.05, y: 0, z: 0 }, heading: { x: 0, y: 0, z: FLIGHT_SPEED } }
    );

    steerFlight(close, TICK, AWARENESS, { ...NONE, separation: 1 }, OPEN_SKY);

    expect(velocityOf(close, 0).x).toBeLessThan(0);
    expect(velocityOf(close, 1).x).toBeGreaterThan(0);
  });

  it('steers every bat from the flight as it stood, not as the bats before it were steered', () => {
    // mirror images in x: synchronous steering must keep them mirrored, sequential steering would not
    const a = FLIGHT_SPEED * Math.cos(1);
    const b = FLIGHT_SPEED * Math.sin(1);
    const mirrored = flock(
      { at: { x: -0.25, y: 0, z: 0 }, heading: { x: a, y: 0, z: b } },
      { at: { x: 0.25, y: 0, z: 0 }, heading: { x: -a, y: 0, z: b } }
    );

    steerFlight(mirrored, TICK, AWARENESS, BEHAVIOUR_WEIGHTS, OPEN_SKY);

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
      steerFlight(tangle, TICK, AWARENESS, BEHAVIOUR_WEIGHTS, OPEN_SKY, scratch);
    }

    for (let i = 0; i < 4; i++) {
      const velocity = velocityOf(tangle, i);
      expect(speedOf(velocity)).toBeCloseTo(FLIGHT_SPEED, 5);
      expect(Math.abs(velocity.y)).toBeLessThanOrEqual(CLIMB + 1e-6);
    }
  });
});
