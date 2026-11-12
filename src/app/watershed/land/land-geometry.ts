/**
 * the land's mesh as plain arrays: one vertex for every cell of the simulation, and four walls round the edge.
 *
 * ## one vertex is one texel
 *
 * the plane has `size − 1` segments each way, so its vertices sit exactly on the centres of the simulation's
 * cells. that is the decision the whole material rests on. the simulation's textures are 32-bit float and are
 * never filtered (a real share of phones cannot filter them), so a shader that wants a height between two cells
 * has to fetch four and mix them by hand. here nothing has to: the vertex shader fetches its own cell, exactly,
 * and the rasteriser interpolates what it hands on. height, normal, bedrock and regolith all reach the fragment
 * already interpolated, for no fetches at all.
 *
 * so the block drawn is one cell narrower than the block simulated: it runs from the centre of the first cell to
 * the centre of the last.
 *
 * ## what `y` is
 *
 * not a height. the height comes from the textures, in the vertex shader, and changes every step. `y` says what
 * kind of vertex this is: `LAND` on the surface, `SKIRT_TOP` along the top of a wall, `SKIRT_FOOT` along its
 * bottom. a wall's top vertex stands on the same cell as the surface vertex beside it and is a second vertex
 * only so the wall can be told from the ground: across a wall the value runs from 1 to 2, across the ground it is 0.
 *
 * a leaf module, and free of three.js, so the verifying script builds the same mesh: see `model/fields.ts`.
 */

/** the three kinds of vertex, as written into `y` */
export const LAND = 0;
export const SKIRT_TOP = 1;
export const SKIRT_FOOT = 2;

export interface ILandGeometry {
  /** x, kind, z for each vertex; x and z in metres from the block's centre */
  readonly positions: Float32Array;
  /** three vertices a triangle, wound anticlockwise seen from above or from outside the block */
  readonly indices: Uint32Array;
}

/** which cell the `k`th vertex of a wall stands on, and whether its triangles wind the other way */
interface IEdge {
  readonly cellOf: (k: number) => readonly [number, number];
  readonly turned: boolean;
}

export function landGeometry(size: number, extent: number): ILandGeometry {
  const surface = size * size;
  const positions = new Float32Array((surface + 8 * size) * 3);
  const centre = (k: number): number => ((k + 0.5) / size - 0.5) * extent;
  const place = (vertex: number, x: number, kind: number, y: number): void => {
    positions[vertex * 3] = centre(x);
    positions[vertex * 3 + 1] = kind;
    positions[vertex * 3 + 2] = centre(y);
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      place(y * size + x, x, LAND, y);
    }
  }

  const span = size - 1;
  const indices = new Uint32Array((span * span + 4 * span) * 6);
  let next = 0;
  const triangle = (a: number, b: number, c: number): void => {
    indices[next++] = a;
    indices[next++] = b;
    indices[next++] = c;
  };
  for (let y = 0; y < span; y++) {
    for (let x = 0; x < span; x++) {
      const corner = y * size + x;
      triangle(corner, corner + size, corner + 1);
      triangle(corner + 1, corner + size, corner + size + 1);
    }
  }

  // seen from outside, a wall's cells run leftward along two of the edges and rightward along the other two
  const last = size - 1;
  const edges: readonly IEdge[] = [
    { cellOf: (k) => [k, 0], turned: false },
    { cellOf: (k) => [k, last], turned: true },
    { cellOf: (k) => [0, k], turned: true },
    { cellOf: (k) => [last, k], turned: false },
  ];
  edges.forEach((edge, index) => {
    const first = surface + index * 2 * size;
    for (let k = 0; k < size; k++) {
      const [x, y] = edge.cellOf(k);
      place(first + 2 * k, x, SKIRT_TOP, y);
      place(first + 2 * k + 1, x, SKIRT_FOOT, y);
    }
    for (let k = 0; k < span; k++) {
      const top = first + 2 * k;
      const foot = top + 1;
      if (edge.turned) {
        triangle(top, foot, top + 2);
        triangle(top + 2, foot, foot + 2);
      } else {
        triangle(top, top + 2, foot);
        triangle(top + 2, foot + 2, foot);
      }
    }
  });

  return { positions, indices };
}
