import { bucketOfCell, cellOf, createGrid, fillGrid } from './batoid-grid';

/** the bats bucket b holds, read out of the grid */
const bucketContents = (grid: ReturnType<typeof createGrid>, bucket: number): number[] =>
  Array.from(grid.order.slice(grid.starts[bucket], grid.starts[bucket + 1]));

describe('createGrid', () => {
  it('sizes its table to a power of two at least twice the flock', () => {
    for (const quantity of [0, 1, 7, 8, 9, 1000]) {
      const size = createGrid(quantity, 0.2).mask + 1;

      expect(size & (size - 1)).toBe(0);
      expect(size).toBeGreaterThanOrEqual(Math.max(16, quantity * 2));
    }
  });

  it('refuses a cell with no size, which would put every bat at infinity', () => {
    expect(() => createGrid(10, 0)).toThrow(RangeError);
    expect(() => createGrid(10, -1)).toThrow(RangeError);
    expect(() => createGrid(10, Number.NaN)).toThrow(RangeError);
  });
});

describe('cellOf', () => {
  it('floors, so cells run on below the origin rather than folding onto it', () => {
    expect(cellOf(0.05, 0.2)).toBe(0);
    expect(cellOf(0.2, 0.2)).toBe(1);
    expect(cellOf(-0.05, 0.2)).toBe(-1);
    expect(cellOf(-0.2, 0.2)).toBe(-1);
    expect(cellOf(-0.21, 0.2)).toBe(-2);
  });
});

describe('bucketOfCell', () => {
  it('always lands inside the table, for cells either side of the origin', () => {
    const grid = createGrid(10, 0.2);
    for (const i of [-1000, -3, -1, 0, 1, 2, 999]) {
      const bucket = bucketOfCell(grid, i, -i, i * 7);

      expect(bucket).toBeGreaterThanOrEqual(0);
      expect(bucket).toBeLessThanOrEqual(grid.mask);
    }
  });
});

describe('fillGrid', () => {
  const positions = new Float32Array([
    0.05, 0.05, 0.05, 0.15, 0.1, 0.02, -0.5, 0.3, 0.9, 0.06, 0.07, 0.08, 4, -4, 4,
  ]);

  it('files every bat exactly once', () => {
    const grid = createGrid(5, 0.2);

    fillGrid(grid, positions);

    expect(Array.from(grid.order).sort()).toEqual([0, 1, 2, 3, 4]);
    expect(grid.starts[grid.mask + 1]).toBe(5);
  });

  it('files each bat under the bucket of the cell it stands in', () => {
    const grid = createGrid(5, 0.2);

    fillGrid(grid, positions);

    for (let i = 0; i < 5; i++) {
      const bucket = bucketOfCell(
        grid,
        cellOf(positions[i * 3], 0.2),
        cellOf(positions[i * 3 + 1], 0.2),
        cellOf(positions[i * 3 + 2], 0.2)
      );
      expect(grid.bucketOf[i]).toBe(bucket);
      expect(bucketContents(grid, bucket)).toContain(i);
    }
  });

  it('keeps bats in one cell together, in flight order', () => {
    const grid = createGrid(5, 0.2);

    fillGrid(grid, positions);

    // bats 0, 1 and 3 all stand in cell (0, 0, 0)
    expect(bucketContents(grid, bucketOfCell(grid, 0, 0, 0))).toEqual(
      expect.arrayContaining([0, 1, 3])
    );
  });

  it('refiles from scratch, leaving nothing of the last fill behind', () => {
    const grid = createGrid(5, 0.2);
    const { order, starts } = grid;
    fillGrid(grid, positions);

    const moved = positions.map((value) => value + 10);
    fillGrid(grid, moved);

    expect(grid.order).toBe(order);
    expect(grid.starts).toBe(starts);
    expect(bucketContents(grid, bucketOfCell(grid, 0, 0, 0))).not.toContain(0);
    expect(Array.from(grid.order).sort()).toEqual([0, 1, 2, 3, 4]);
  });
});
