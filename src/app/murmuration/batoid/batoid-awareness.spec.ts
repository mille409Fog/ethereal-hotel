import { IFlight, IThreeTuple } from '../cauldron/cauldron-flight';
import {
  distanceSquared,
  emptyNeighbourhood,
  IAwareness,
  INeighbourhood,
  neighboursWithin,
  perceive,
  wrappedOffset,
} from './batoid-awareness';

/** a box no bat below is near the faces of, so nothing here wraps unless a test means it to */
const OPEN_SKY: IThreeTuple = { x: 100, y: 100, z: 100 };
const UNIT: IThreeTuple = { x: 1, y: 1, z: 1 };

/** a flight standing still at the given positions; awareness never reads velocity */
function flock(...positions: IThreeTuple[]): IFlight {
  return {
    positions: new Float32Array(positions.flatMap(({ x, y, z }) => [x, y, z])),
    velocities: new Float32Array(positions.length * 3),
  };
}

describe('wrappedOffset', () => {
  it('is the plain difference when the bats are less than a radius apart', () => {
    expect(wrappedOffset(0.25, 0.75, 1)).toBe(0.5);
    expect(wrappedOffset(0.75, 0.25, 1)).toBe(-0.5);
  });

  it('goes the short way round through the +radius face', () => {
    // 0.75 to -0.75 is 1.5 across the box, but only 0.5 through the face at +1
    expect(wrappedOffset(0.75, -0.75, 1)).toBe(0.5);
  });

  it('goes the short way round through the -radius face', () => {
    expect(wrappedOffset(-0.75, 0.75, 1)).toBe(-0.5);
  });

  it('is antisymmetric, so each bat sees the other in the opposite direction', () => {
    expect(wrappedOffset(0.75, -0.5, 1)).toBe(-wrappedOffset(-0.5, 0.75, 1));
  });

  it('never exceeds the radius in size', () => {
    const draws = [-1, -0.9, -0.3, 0, 0.4, 0.8, 1];
    for (const a of draws) {
      for (const b of draws) {
        expect(Math.abs(wrappedOffset(a, b, 1))).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('distanceSquared', () => {
  it('is the squared euclidean distance inside the box', () => {
    const { positions } = flock({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 });

    expect(distanceSquared(positions, 0, 1, OPEN_SKY)).toBe(25);
  });

  it('measures each axis through its own faces', () => {
    const radii: IThreeTuple = { x: 1, y: 2, z: 4 };
    // x is 1.5 apart in a box 2 wide, so 0.5 through the face; y and z are well inside theirs
    const { positions } = flock({ x: 0.75, y: 0.75, z: 0.75 }, { x: -0.75, y: -0.75, z: -0.75 });

    expect(distanceSquared(positions, 0, 1, radii)).toBe(0.25 + 2.25 + 2.25);
  });

  it('is zero from a bat to itself', () => {
    const { positions } = flock({ x: 0.5, y: -0.25, z: 0.125 });

    expect(distanceSquared(positions, 0, 0, OPEN_SKY)).toBe(0);
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
    expect(neighboursWithin(LINE, 0, 1.5, OPEN_SKY)).toEqual([1, 2]);
  });

  it('counts a bat exactly on the edge of the sphere', () => {
    expect(neighboursWithin(LINE, 0, 1, OPEN_SKY)).toEqual([1, 2]);
  });

  it('never counts the bat itself', () => {
    expect(neighboursWithin(LINE, 0, 1000, OPEN_SKY)).toEqual([1, 2, 3]);
  });

  it('counts a bat sitting exactly on top of it', () => {
    const stacked = flock({ x: 0.25, y: 0, z: 0 }, { x: 0.25, y: 0, z: 0 });

    expect(neighboursWithin(stacked, 0, 0.1, OPEN_SKY)).toEqual([1]);
  });

  it('sees nobody with a radius of zero unless they share its position', () => {
    expect(neighboursWithin(LINE, 0, 0, OPEN_SKY)).toEqual([]);
  });

  it('sees a bat on the far side of a face it is close to', () => {
    const across = flock({ x: 0.9, y: 0, z: 0 }, { x: -0.9, y: 0, z: 0 });

    expect(neighboursWithin(across, 0, 0.25, UNIT)).toEqual([1]);
    expect(neighboursWithin(across, 1, 0.25, UNIT)).toEqual([0]);
  });

  it('is symmetric: if i sees j, j sees i', () => {
    const scattered = flock(
      { x: 0.9, y: -0.8, z: 0.1 },
      { x: -0.95, y: 0.9, z: 0 },
      { x: 0.1, y: 0.2, z: -0.7 },
      { x: 0.3, y: -0.1, z: 0.6 }
    );
    for (let i = 0; i < 4; i++) {
      for (const j of neighboursWithin(scattered, i, 0.9, UNIT)) {
        expect(neighboursWithin(scattered, j, 0.9, UNIT)).toContain(i);
      }
    }
  });

  it('empties and refills the array it is given rather than appending to it', () => {
    const into = [99, 98, 97];

    const result = neighboursWithin(LINE, 0, 0.75, OPEN_SKY, into);

    expect(result).toBe(into);
    expect(into).toEqual([1]);
  });

  it('finds nobody in a flock of one, or of none', () => {
    expect(neighboursWithin(flock({ x: 0, y: 0, z: 0 }), 0, 10, OPEN_SKY)).toEqual([]);
    expect(neighboursWithin(flock(), 0, 10, OPEN_SKY)).toEqual([]);
  });
});

describe('perceive', () => {
  const AWARENESS: IAwareness = { separation: 0.5, alignment: 1, cohesion: 2 };
  // the origin, then one bat in each shell: inside separation, inside alignment, inside cohesion, beyond all three
  const SHELLS = flock(
    { x: 0, y: 0, z: 0 },
    { x: 0.25, y: 0, z: 0 },
    { x: 0, y: 0.75, z: 0 },
    { x: 0, y: 0, z: 1.5 },
    { x: 3, y: 0, z: 0 }
  );

  it('sorts each bat into every sphere that contains it', () => {
    expect(perceive(SHELLS, 0, AWARENESS, OPEN_SKY)).toEqual({
      separation: [1],
      alignment: [1, 2],
      cohesion: [1, 2, 3],
    });
  });

  it('agrees with neighboursWithin at each of the three radii', () => {
    for (let self = 0; self < 5; self++) {
      const seen = perceive(SHELLS, self, AWARENESS, OPEN_SKY);

      expect(seen.separation).toEqual(
        neighboursWithin(SHELLS, self, AWARENESS.separation, OPEN_SKY)
      );
      expect(seen.alignment).toEqual(neighboursWithin(SHELLS, self, AWARENESS.alignment, OPEN_SKY));
      expect(seen.cohesion).toEqual(neighboursWithin(SHELLS, self, AWARENESS.cohesion, OPEN_SKY));
    }
  });

  it('does not assume the spheres are nested', () => {
    const inverted: IAwareness = { separation: 2, alignment: 0.5, cohesion: 1 };

    expect(perceive(SHELLS, 0, inverted, OPEN_SKY)).toEqual({
      separation: [1, 2, 3],
      alignment: [1],
      cohesion: [1, 2],
    });
  });

  it('wraps through the faces as neighboursWithin does', () => {
    const across = flock({ x: 0.9, y: 0, z: 0 }, { x: -0.9, y: 0, z: 0 });

    expect(perceive(across, 0, AWARENESS, UNIT).separation).toEqual([1]);
  });

  it('empties and reuses the neighbourhood it is given', () => {
    const into: INeighbourhood = { separation: [7], alignment: [7, 8], cohesion: [7, 8, 9] };
    const { separation, alignment, cohesion } = into;

    const result = perceive(SHELLS, 3, AWARENESS, OPEN_SKY, into);

    expect(result).toBe(into);
    expect(result.separation).toBe(separation);
    expect(result.alignment).toBe(alignment);
    expect(result.cohesion).toBe(cohesion);
    // bat 3 stands between 1.5 and 1.7 from bats 0 to 2, and over 3 from bat 4
    expect(result).toEqual({ separation: [], alignment: [], cohesion: [0, 1, 2] });
  });

  it('starts from three empty arrays when given nothing to reuse', () => {
    expect(emptyNeighbourhood()).toEqual({ separation: [], alignment: [], cohesion: [] });
  });
});
