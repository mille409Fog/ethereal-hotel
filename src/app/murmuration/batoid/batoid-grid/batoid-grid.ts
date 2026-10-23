/** a uniform spatial grid over the flock, so a bat looks for its neighbours in the cells around it rather than
 *  measuring every other bat. nothing bounds the flock any more, so the cells are hashed into a fixed table instead of
 *  laid out in a box: two far-apart cells can share a bucket, which costs a few wasted distance checks and nothing
 *  else, because every candidate is measured before it is believed.
 *  the table is rebuilt every tick by counting sort into arrays allocated once, so the loop allocates nothing */

export interface ISpatialGrid {
  readonly cellSize: number;
  /** the table's size less one; the size is a power of two, so a hash is reduced with a mask */
  readonly mask: number;
  /** bats grouped by bucket: bucket b holds order[starts[b]] up to order[starts[b + 1]] */
  readonly order: Int32Array;
  readonly starts: Int32Array;
  /** each bat's bucket at the last fill */
  readonly bucketOf: Int32Array;
  /** where the next bat goes in each bucket while filling */
  readonly cursor: Int32Array;
  /** the search that last visited each bucket, so a bucket two cells hash into is searched once per search */
  readonly stamps: Int32Array;
  /** counts searches; a bucket whose stamp equals it has been visited by the current one */
  search: number;
}

/** a table about twice the flock's size keeps buckets to a bat or two apiece at any density */
export function createGrid(quantity: number, cellSize: number): ISpatialGrid {
  if (!(cellSize > 0)) {
    throw new RangeError(`a grid cell must have a positive size, not ${cellSize}`);
  }
  let size = 16;
  while (size < quantity * 2) {
    size *= 2;
  }
  return {
    cellSize,
    mask: size - 1,
    order: new Int32Array(quantity),
    starts: new Int32Array(size + 1),
    bucketOf: new Int32Array(quantity),
    cursor: new Int32Array(size),
    stamps: new Int32Array(size),
    search: 0,
  };
}

/** which cell along one axis a coordinate falls in */
export function cellOf(value: number, cellSize: number): number {
  return Math.floor(value / cellSize);
}

/** the bucket a cell hashes to; the three primes are the usual ones for spatial hashing (Teschner et al., 2003) */
export function bucketOfCell(grid: ISpatialGrid, ix: number, iy: number, iz: number): number {
  return (Math.imul(ix, 73856093) ^ Math.imul(iy, 19349663) ^ Math.imul(iz, 83492791)) & grid.mask;
}

/** sorts the flock into the grid by where it stands now */
export function fillGrid(grid: ISpatialGrid, positions: Float32Array): void {
  const { starts, bucketOf, cursor, order, cellSize } = grid;
  const quantity = positions.length / 3;
  starts.fill(0);
  for (let i = 0; i < quantity; i++) {
    const a = i * 3;
    const bucket = bucketOfCell(
      grid,
      cellOf(positions[a], cellSize),
      cellOf(positions[a + 1], cellSize),
      cellOf(positions[a + 2], cellSize)
    );
    bucketOf[i] = bucket;
    starts[bucket + 1]++;
  }
  for (let b = 0; b < cursor.length; b++) {
    starts[b + 1] += starts[b];
    cursor[b] = starts[b];
  }
  for (let i = 0; i < quantity; i++) {
    order[cursor[bucketOf[i]]++] = i;
  }
}
