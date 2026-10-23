import { IFlight, IThreeTuple } from '../cauldron/cauldron-flight';
import { emptyNeighbourhood, INeighbourhood } from './batoid-awareness';
import { alignment, cohesion, separation } from './batoid-behavior';

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
