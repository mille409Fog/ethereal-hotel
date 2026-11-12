import { LAND, landGeometry, SKIRT_FOOT, SKIRT_TOP } from './land-geometry';

const SIZE = 5;
const EXTENT = 100;
const CELL = EXTENT / SIZE;

type Point = readonly [number, number, number];

/** a vertex where it would stand on a flat land: the ground and a wall's top at 0, a wall's foot below */
const standing = (positions: Float32Array, vertex: number): Point => [
  positions[vertex * 3],
  positions[vertex * 3 + 1] === SKIRT_FOOT ? -1 : 0,
  positions[vertex * 3 + 2],
];

/** the way a triangle faces, by the right-hand rule: toward whoever sees it wound anticlockwise */
const facing = (a: Point, b: Point, c: Point): Point => {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
};

const trianglesOf = (indices: Uint32Array): number[][] =>
  Array.from({ length: indices.length / 3 }, (_, n) => [...indices.slice(n * 3, n * 3 + 3)]);

describe('land geometry', () => {
  const { positions, indices } = landGeometry(SIZE, EXTENT);
  const kindOf = (vertex: number): number => positions[vertex * 3 + 1];
  const triangles = trianglesOf(indices);
  const ground = triangles.filter((triangle) => triangle.every((v) => kindOf(v) === LAND));
  const walls = triangles.filter((triangle) => triangle.every((v) => kindOf(v) !== LAND));

  it('puts one vertex on the centre of every cell, in the textures’ order', () => {
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const vertex = y * SIZE + x;
        expect(positions[vertex * 3]).toBeCloseTo((x + 0.5) * CELL - EXTENT / 2, 10);
        expect(kindOf(vertex)).toBe(LAND);
        expect(positions[vertex * 3 + 2]).toBeCloseTo((y + 0.5) * CELL - EXTENT / 2, 10);
      }
    }
  });

  it('is a plane of one segment fewer than cells each way, and four walls', () => {
    expect(ground).toHaveLength((SIZE - 1) ** 2 * 2);
    expect(walls).toHaveLength(4 * (SIZE - 1) * 2);
    expect(triangles).toHaveLength(ground.length + walls.length);
    expect(positions).toHaveLength((SIZE * SIZE + 8 * SIZE) * 3);
  });

  it('winds the ground to face up', () => {
    for (const [a, b, c] of ground) {
      const [x, y, z] = facing(
        standing(positions, a),
        standing(positions, b),
        standing(positions, c)
      );

      expect(y).toBeGreaterThan(0);
      expect(x).toBeCloseTo(0, 10);
      expect(z).toBeCloseTo(0, 10);
    }
  });

  it('winds every wall to face out of the block, and stands it upright', () => {
    for (const [a, b, c] of walls) {
      const corners = [a, b, c].map((vertex) => standing(positions, vertex));
      const [x, y, z] = facing(corners[0], corners[1], corners[2]);
      const middle = [0, 2].map(
        (axis) => (corners[0][axis] + corners[1][axis] + corners[2][axis]) / 3
      );

      expect(y).toBeCloseTo(0, 10);
      // outward is away from the centre, which is the origin
      expect(x * middle[0] + z * middle[1]).toBeGreaterThan(0);
    }
  });

  it('stands each wall on the rim: a top and a foot on every edge cell', () => {
    const rim = (SIZE / 2 - 0.5) * CELL;
    for (let vertex = SIZE * SIZE; vertex < positions.length / 3; vertex++) {
      const onRim = Math.max(Math.abs(positions[vertex * 3]), Math.abs(positions[vertex * 3 + 2]));

      expect(onRim).toBeCloseTo(rim, 10);
      expect([SKIRT_TOP, SKIRT_FOOT]).toContain(kindOf(vertex));
    }
    const tops = Array.from({ length: 8 * SIZE }, (_, n) => kindOf(SIZE * SIZE + n)).filter(
      (kind) => kind === SKIRT_TOP
    );

    expect(tops).toHaveLength(4 * SIZE);
  });

  it('gives every wall triangle both a top and a foot, so the kind runs from one to the other across it', () => {
    for (const triangle of walls) {
      const kinds = new Set(triangle.map(kindOf));

      expect(kinds).toEqual(new Set([SKIRT_TOP, SKIRT_FOOT]));
    }
  });
});
