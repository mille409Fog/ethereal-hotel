import { IFlight, IThreeTuple } from '../../cauldron/cauldron-flight';
import { createGrid, fillGrid } from '../batoid-grid/batoid-grid';
import {
  createNearest,
  distanceSquared,
  emptyNeighbourhood,
  IAwareness,
  INeighbourhood,
  neighboursWithin,
  offerNearest,
  perceive,
  perceiveNearby,
  SEARCH_REACH,
} from './batoid-awareness';

/** a flight standing still at the given positions; awareness never reads velocity */
function flock(...positions: IThreeTuple[]): IFlight {
  return {
    positions: new Float32Array(positions.flatMap(({ x, y, z }) => [x, y, z])),
    velocities: new Float32Array(positions.length * 3),
  };
}

describe('distanceSquared', () => {
  it('is the squared euclidean distance', () => {
    const { positions } = flock({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 });

    expect(distanceSquared(positions, 0, 1)).toBe(25);
  });

  it('is the same measured from either bat', () => {
    const { positions } = flock({ x: 0.75, y: 0.75, z: 0.75 }, { x: -0.75, y: -0.75, z: -0.75 });

    expect(distanceSquared(positions, 0, 1)).toBe(3 * 2.25);
    expect(distanceSquared(positions, 1, 0)).toBe(3 * 2.25);
  });

  it('measures straight across, with no box to wrap through', () => {
    // either side of where the old box's +1 face stood: 1.8 apart, not 0.2
    const { positions } = flock({ x: 0.875, y: 0, z: 0 }, { x: -0.875, y: 0, z: 0 });

    expect(distanceSquared(positions, 0, 1)).toBeCloseTo(1.75 ** 2);
  });

  it('is zero from a bat to itself', () => {
    const { positions } = flock({ x: 0.5, y: -0.25, z: 0.125 });

    expect(distanceSquared(positions, 0, 0)).toBe(0);
  });
});

describe('neighboursWithin', () => {
  // along x from the origin: 0.5, 1, then 2 away
  const LINE = flock(
    { x: 0, y: 0, z: 0 },
    { x: 0.5, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 0, y: 0, z: -2 }
  );

  it('finds every other bat inside the radius, in flight order', () => {
    expect(neighboursWithin(LINE, 0, 1.5)).toEqual([1, 2]);
  });

  it('counts a bat exactly on the edge of the sphere', () => {
    expect(neighboursWithin(LINE, 0, 1)).toEqual([1, 2]);
  });

  it('never counts the bat itself', () => {
    expect(neighboursWithin(LINE, 0, 1000)).toEqual([1, 2, 3]);
  });

  it('counts a bat sitting exactly on top of it', () => {
    const stacked = flock({ x: 0.25, y: 0, z: 0 }, { x: 0.25, y: 0, z: 0 });

    expect(neighboursWithin(stacked, 0, 0.1)).toEqual([1]);
  });

  it('sees nobody with a radius of zero unless they share its position', () => {
    expect(neighboursWithin(LINE, 0, 0)).toEqual([]);
  });

  it('is symmetric: if i sees j, j sees i', () => {
    const scattered = flock(
      { x: 0.9, y: -0.8, z: 0.1 },
      { x: -0.95, y: 0.9, z: 0 },
      { x: 0.1, y: 0.2, z: -0.7 },
      { x: 0.3, y: -0.1, z: 0.6 }
    );
    for (let i = 0; i < 4; i++) {
      for (const j of neighboursWithin(scattered, i, 0.9)) {
        expect(neighboursWithin(scattered, j, 0.9)).toContain(i);
      }
    }
  });

  it('empties and refills the array it is given rather than appending to it', () => {
    const into = [99, 98, 97];

    const result = neighboursWithin(LINE, 0, 0.75, into);

    expect(result).toBe(into);
    expect(into).toEqual([1]);
  });

  it('finds nobody in a flock of one, or of none', () => {
    expect(neighboursWithin(flock({ x: 0, y: 0, z: 0 }), 0, 10)).toEqual([]);
    expect(neighboursWithin(flock(), 0, 10)).toEqual([]);
  });
});

describe('offerNearest', () => {
  it('keeps the nearest it is offered, nearest first, whatever order they come in', () => {
    const nearest = createNearest(3);
    nearest.wanted = 3;

    for (const [distance, index] of [
      [0.5, 4],
      [0.1, 9],
      [0.9, 1],
      [0.3, 2],
      [0.2, 7],
    ]) {
      offerNearest(nearest, distance, index);
    }

    expect(nearest.count).toBe(3);
    expect(Array.from(nearest.indices)).toEqual([9, 7, 2]);
    expect(Array.from(nearest.distances)).toEqual([0.1, 0.2, 0.3]);
  });

  it('breaks a tie by index, so the answer does not depend on the order bats are met', () => {
    const forward = createNearest(2);
    const backward = createNearest(2);
    forward.wanted = 2;
    backward.wanted = 2;

    [5, 3, 8].forEach((index) => offerNearest(forward, 0.25, index));
    [8, 3, 5].forEach((index) => offerNearest(backward, 0.25, index));

    expect(Array.from(forward.indices)).toEqual([3, 5]);
    expect(Array.from(backward.indices)).toEqual([3, 5]);
  });

  it('keeps nothing when nothing is wanted', () => {
    const nearest = createNearest(2);

    offerNearest(nearest, 0.1, 1);

    expect(nearest.count).toBe(0);
  });
});

describe('perceive', () => {
  // separation by radius; alignment from the two nearest, cohesion from the three nearest
  const AWARENESS: IAwareness = { separation: 0.5, alignment: 2, cohesion: 3 };
  // the origin, then bats ever further out: 0.25, 0.75, 1.5 and 3 away
  const LADDER = flock(
    { x: 0, y: 0, z: 0 },
    { x: 0.25, y: 0, z: 0 },
    { x: 0, y: 0.75, z: 0 },
    { x: 0, y: 0, z: 1.5 },
    { x: 3, y: 0, z: 0 }
  );

  it('finds separation by radius and the other two by count, nearest first', () => {
    expect(perceive(LADDER, 0, AWARENESS)).toEqual({
      separation: [1],
      alignment: [1, 2],
      cohesion: [1, 2, 3],
    });
  });

  it('agrees with neighboursWithin on the separation sphere', () => {
    for (let self = 0; self < 5; self++) {
      expect(perceive(LADDER, self, AWARENESS).separation).toEqual(
        neighboursWithin(LADDER, self, AWARENESS.separation)
      );
    }
  });

  it('counts neighbours however far away they are: a straggler still sees the flock', () => {
    // bat 4 stands 3 from the origin, far outside any sphere the old radii drew
    expect(perceive(LADDER, 4, AWARENESS).cohesion).toEqual([1, 0, 2]);
  });

  it('hands out what there is when the flock is smaller than the count', () => {
    const pair = flock({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });

    expect(perceive(pair, 0, AWARENESS)).toEqual({ separation: [], alignment: [1], cohesion: [1] });
  });

  it('reads a fractional count as the whole number below it', () => {
    const fractional: IAwareness = { separation: 0, alignment: 1.9, cohesion: 2.5 };

    expect(perceive(LADDER, 0, fractional)).toEqual({
      separation: [],
      alignment: [1],
      cohesion: [1, 2],
    });
  });

  it('empties and reuses the neighbourhood it is given', () => {
    const into: INeighbourhood = { separation: [7], alignment: [7, 8], cohesion: [7, 8, 9] };
    const { separation, alignment, cohesion } = into;

    const result = perceive(LADDER, 3, AWARENESS, into);

    expect(result).toBe(into);
    expect(result.separation).toBe(separation);
    expect(result.alignment).toBe(alignment);
    expect(result.cohesion).toBe(cohesion);
    // bat 3 stands 1.5, 1.52 and 1.68 from bats 0, 1 and 2, and over 3 from bat 4
    expect(result).toEqual({ separation: [], alignment: [0, 1], cohesion: [0, 1, 2] });
  });

  it('starts from three empty arrays when given nothing to reuse', () => {
    expect(emptyNeighbourhood()).toEqual({ separation: [], alignment: [], cohesion: [] });
  });
});

describe('perceiveNearby', () => {
  const AWARENESS: IAwareness = { separation: 0.2, alignment: 7, cohesion: 5 };

  /** a random flock, but the same one every run */
  function scattered(quantity: number, spread: IThreeTuple, seed: number): IFlight {
    let state = seed;
    const next = (): number => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
    const positions = new Float32Array(quantity * 3);
    for (let i = 0; i < quantity; i++) {
      positions[i * 3] = (next() * 2 - 1) * spread.x;
      positions[i * 3 + 1] = (next() * 2 - 1) * spread.y;
      positions[i * 3 + 2] = (next() * 2 - 1) * spread.z;
    }
    return { positions, velocities: new Float32Array(quantity * 3) };
  }

  /** every bat's neighbourhood through the grid, checked against the brute-force one */
  function expectAgreement(flight: IFlight, cellSize: number, awareness = AWARENESS): void {
    const quantity = flight.positions.length / 3;
    const grid = createGrid(quantity, cellSize);
    fillGrid(grid, flight.positions);
    const nearest = createNearest(0);
    for (let i = 0; i < quantity; i++) {
      const found = perceiveNearby(grid, flight, i, awareness, emptyNeighbourhood(), nearest);

      expect(found).toEqual(perceive(flight, i, awareness));
    }
  }

  it('finds exactly what measuring everyone finds, at the size the flock flies', () => {
    expectAgreement(scattered(400, { x: 2, y: 1, z: 1 }, 1), 0.2);
  });

  it('finds the same at any cell size, small or large', () => {
    const flight = scattered(150, { x: 1, y: 1, z: 1 }, 2);

    for (const cellSize of [0.05, 0.13, 0.5, 3]) {
      expectAgreement(flight, cellSize);
    }
  });

  it('finds the same in a dense clump and around the origin, where cells go negative', () => {
    expectAgreement(scattered(300, { x: 0.2, y: 0.2, z: 0.2 }, 3), 0.2);
  });

  it('finds the same for a separation sphere wider than a cell', () => {
    expectAgreement(scattered(200, { x: 1, y: 1, z: 1 }, 4), 0.1, {
      separation: 0.45,
      alignment: 3,
      cohesion: 3,
    });
  });

  it('finds a straggler its neighbours from beyond the reach of its search', () => {
    // a flock at the origin and one bat far past SEARCH_REACH cells from it
    const flight = scattered(40, { x: 0.3, y: 0.3, z: 0.3 }, 5);
    const positions = new Float32Array(flight.positions.length + 3);
    positions.set(flight.positions);
    positions.set([0, 0, (SEARCH_REACH + 4) * 0.2], flight.positions.length);
    const withStraggler: IFlight = { positions, velocities: new Float32Array(positions.length) };

    expectAgreement(withStraggler, 0.2);
  });

  it('finds the same when bats share a position exactly', () => {
    const stacked = flock(...Array.from({ length: 12 }, () => ({ x: 0.1, y: 0.1, z: 0.1 })));

    expectAgreement(stacked, 0.2);
  });

  it('hands a flock no bigger than the count every other bat', () => {
    const small = scattered(6, { x: 1, y: 1, z: 1 }, 6);

    expectAgreement(small, 0.2);
  });
});
