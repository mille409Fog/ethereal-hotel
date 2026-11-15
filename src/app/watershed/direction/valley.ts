/**
 * finds the main valley of a land the storm has made, for the camera's pass to fly up. found, not assumed: the
 * valley is wherever this land's water went, and no seed's valley is placed by hand.
 *
 * - **from a quarter of the land.** the storm reads back a copy of `land` at a quarter of its resolution once,
 *   when its last step has run (`readback.ts`), and the raised land's uplift is averaged to the same grid here.
 *   a cell of that copy is a quarter of a kilometre's sixteenth on the middle tier, which is finer than anything
 *   the camera can follow, and the read is a sixteenth of the size.
 * - **accumulated water is drainage area.** the rain fell evenly, so the water that has passed through a cell is
 *   in proportion to how many cells drain through it: the classic flow accumulation. every cell gives one and
 *   hands what it holds on to the neighbour it drains to.
 * - **where a cell drains is found by flooding from the edges**, the priority-flood of Barnes, Lehman and Mulla
 *   (2014): the edges drain, so the land is filled inward from them in order of height, and each cell drains to
 *   the one that reached it. a lake or a pit the storm left is crossed at its spill level, so every cell reaches
 *   an edge and no basin swallows the stem. it routes on the water's surface, which is the level a lake drains at.
 * - **the stem is the greatest path.** from the mouth on the edge that the most cells drain through, the trace
 *   climbs, at every cell, into whichever neighbour sends it the most, and stops where that has fallen below a
 *   share of the mouth's. so the path is the river with the most land behind it, mouth first.
 * - **the path is smoothed and then measured again.** a stem traced cell by cell zigzags; the camera wants a
 *   curve. smoothing a path through a valley cuts its bends across the spurs between them, so the ground is read
 *   again under every smoothed point, and that is the ground the camera is kept above.
 *
 * a leaf module: Node imports it, so the verifying script finds the valley of its own land. see `model/fields.ts`.
 */
import type { IDirection } from './direction-calibration';
import type { Vector } from './direction';

export interface IValley {
  /** points along the stem, mouth first, `valleySpacing` apart: x and z in metres from the block's centre, y the ground */
  readonly points: readonly Vector[];
}

/** the mean of each `factor` by `factor` block of a square grid of `size`, as a grid of `size / factor` */
export function coarsen(values: ArrayLike<number>, size: number, factor: number): Float32Array {
  const coarse = Math.max(1, Math.floor(size / factor));
  const out = new Float32Array(coarse * coarse);
  for (let k = 0; k < out.length; k++) {
    const x0 = (k % coarse) * factor;
    const y0 = Math.floor(k / coarse) * factor;
    let sum = 0;
    for (let j = 0; j < factor * factor; j++) {
      sum += values[(y0 + Math.floor(j / factor)) * size + x0 + (j % factor)];
    }
    out[k] = sum / (factor * factor);
  }
  return out;
}

/**
 * the water's surface on a quarter copy: `land` is its four channels a texel (cut, regolith, water, suspended),
 * and `uplift` the raised land on the same grid. summed in the model's order, `(uplift − cut) + regolith`, then water
 */
export function waterSurface(land: ArrayLike<number>, uplift: ArrayLike<number>): Float32Array {
  const surface = new Float32Array(uplift.length);
  for (let i = 0; i < uplift.length; i++) {
    surface[i] = uplift[i] - land[i * 4] + land[i * 4 + 1] + land[i * 4 + 2];
  }
  return surface;
}

/** a binary heap of cells, lowest first, and the lower index first between two of a height, so it is repeatable */
class CellHeap {
  private readonly cells: number[] = [];
  private readonly heights: number[] = [];

  public get size(): number {
    return this.cells.length;
  }

  private before(a: number, b: number): boolean {
    return (
      this.heights[a] < this.heights[b] ||
      (this.heights[a] === this.heights[b] && this.cells[a] < this.cells[b])
    );
  }

  private swap(a: number, b: number): void {
    [this.cells[a], this.cells[b]] = [this.cells[b], this.cells[a]];
    [this.heights[a], this.heights[b]] = [this.heights[b], this.heights[a]];
  }

  public push(cell: number, height: number): void {
    this.cells.push(cell);
    this.heights.push(height);
    let at = this.cells.length - 1;
    while (at > 0) {
      const parent = (at - 1) >> 1;
      if (!this.before(at, parent)) {
        break;
      }
      this.swap(at, parent);
      at = parent;
    }
  }

  /** the lowest cell and the height it was pushed at */
  public pop(): readonly [number, number] {
    const top = [this.cells[0], this.heights[0]] as const;
    const lastCell = this.cells.pop() as number;
    const lastHeight = this.heights.pop() as number;
    if (this.cells.length > 0) {
      this.cells[0] = lastCell;
      this.heights[0] = lastHeight;
      let at = 0;
      for (;;) {
        const left = at * 2 + 1;
        const right = left + 1;
        let least = at;
        if (left < this.cells.length && this.before(left, least)) {
          least = left;
        }
        if (right < this.cells.length && this.before(right, least)) {
          least = right;
        }
        if (least === at) {
          break;
        }
        this.swap(at, least);
        at = least;
      }
    }
    return top;
  }
}

const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

/** the cells round `cell` on a grid of `size`, the eight of them or as many as are on the grid */
function neighbours(cell: number, size: number): number[] {
  const x = cell % size;
  const y = Math.floor(cell / size);
  const found: number[] = [];
  for (const [dx, dy] of NEIGHBOURS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < size && ny < size) {
      found.push(ny * size + nx);
    }
  }
  return found;
}

/** true for a cell on the grid's edge, which drains off the block */
function onEdge(cell: number, size: number): boolean {
  const x = cell % size;
  const y = Math.floor(cell / size);
  return x === 0 || y === 0 || x === size - 1 || y === size - 1;
}

/** for every cell, the cell it drains to, or −1 on the edge; and the order the flood reached them in */
export function drainage(
  surface: ArrayLike<number>,
  size: number
): {
  readonly receiver: Int32Array;
  readonly order: Int32Array;
} {
  const cells = size * size;
  const receiver = new Int32Array(cells).fill(-1);
  const reached = new Uint8Array(cells);
  const order = new Int32Array(cells);
  const heap = new CellHeap();
  for (let i = 0; i < cells; i++) {
    if (onEdge(i, size)) {
      reached[i] = 1;
      heap.push(i, surface[i]);
    }
  }
  for (let count = 0; heap.size > 0; count++) {
    const [cell, level] = heap.pop();
    order[count] = cell;
    for (const next of neighbours(cell, size)) {
      if (!reached[next]) {
        reached[next] = 1;
        receiver[next] = cell;
        // a cell lower than the one that reached it is in a pit, and drains at the pit's spill level
        heap.push(next, Math.max(surface[next], level));
      }
    }
  }
  return { receiver, order };
}

/** how many cells drain through each, itself included */
export function accumulation(receiver: Int32Array, order: Int32Array): Float64Array {
  const held = new Float64Array(receiver.length).fill(1);
  // the flood reaches a cell after the one it drains to, so the reverse of its order is upstream first
  for (let k = order.length - 1; k >= 0; k--) {
    const cell = order[k];
    if (receiver[cell] >= 0) {
      held[receiver[cell]] += held[cell];
    }
  }
  return held;
}

/** of `cells`, the one holding the most, the first of them on a tie, or −1 when there are none */
function most(cells: readonly number[], held: Float64Array): number {
  let best = -1;
  for (const cell of cells) {
    if (best === -1 || held[cell] > held[best]) {
      best = cell;
    }
  }
  return best;
}

/** the stem of the largest basin as cells, mouth first */
export function stem(surface: ArrayLike<number>, size: number, share: number): number[] {
  const { receiver, order } = drainage(surface, size);
  const held = accumulation(receiver, order);
  const mouths = Array.from(receiver.keys()).filter((cell) => receiver[cell] === -1);
  const path = [most(mouths, held)];
  const least = held[path[0]] * share;
  for (;;) {
    const at = path[path.length - 1];
    const donors = neighbours(at, size).filter((cell) => receiver[cell] === at);
    const next = most(donors, held);
    if (next === -1 || held[next] < least) {
      return path;
    }
    path.push(next);
  }
}

/** the grid's height at a point in metres from the block's centre, mixed from the four cells round it */
export function groundAt(
  surface: ArrayLike<number>,
  size: number,
  extent: number,
  x: number,
  z: number
): number {
  if (size < 2) {
    return surface[0];
  }
  const u = Math.min(size - 1, Math.max(0, (x / extent + 0.5) * size - 0.5));
  const v = Math.min(size - 1, Math.max(0, (z / extent + 0.5) * size - 0.5));
  const x0 = Math.min(size - 2, Math.floor(u));
  const y0 = Math.min(size - 2, Math.floor(v));
  const fx = u - x0;
  const fy = v - y0;
  const at = (i: number, j: number): number => surface[(y0 + j) * size + x0 + i];
  return mix2(mix2(at(0, 0), at(1, 0), fx), mix2(at(0, 1), at(1, 1), fx), fy);
}

function mix2(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** points along a polyline, `spacing` apart by length along it, the first and last included */
function resample(
  path: ReadonlyArray<readonly [number, number]>,
  spacing: number
): Array<[number, number]> {
  const out: Array<[number, number]> = [[...path[0]]];
  let carried = 0;
  for (let k = 1; k < path.length; k++) {
    const [ax, az] = path[k - 1];
    const [bx, bz] = path[k];
    const length = Math.hypot(bx - ax, bz - az);
    let along = spacing - carried;
    while (along <= length) {
      const t = along / length;
      out.push([ax + (bx - ax) * t, az + (bz - az) * t]);
      along += spacing;
    }
    carried = length - (along - spacing);
  }
  const [lx, lz] = path[path.length - 1];
  const [ex, ez] = out[out.length - 1];
  if (Math.hypot(lx - ex, lz - ez) > spacing / 2) {
    out.push([lx, lz]);
  }
  return out;
}

/**
 * the main valley of a water surface on a grid of `size` cells across a block `extent` metres wide, or null on a
 * grid too small to have one
 */
export function findValley(
  surface: ArrayLike<number>,
  size: number,
  extent: number,
  d: IDirection
): IValley | null {
  if (size < 3) {
    return null;
  }
  const cells = stem(surface, size, d.valleyStem);
  if (cells.length < 2) {
    return null;
  }
  const centre = (k: number): number => ((k + 0.5) / size - 0.5) * extent;
  const traced = cells.map(
    (cell) => [centre(cell % size), centre(Math.floor(cell / size))] as const
  );
  const w = d.valleySmoothing;
  const smoothed = traced.map((_, k) => {
    let sx = 0;
    let sz = 0;
    let n = 0;
    for (let j = Math.max(0, k - w); j <= Math.min(traced.length - 1, k + w); j++) {
      sx += traced[j][0];
      sz += traced[j][1];
      n++;
    }
    return [sx / n, sz / n] as const;
  });
  // the mouth stays on the edge, where the pass begins
  smoothed[0] = traced[0];
  const points = resample(smoothed, d.valleySpacing).map(([x, z]): Vector => [
    x,
    groundAt(surface, size, extent, x, z),
    z,
  ]);
  return { points };
}
