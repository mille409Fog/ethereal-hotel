import { cellSize, EROSION, stableTimestep, STRATA_ENTRIES } from './erosion-calibration';

/**
 * the constraints the calibration has to satisfy for `step.ts` to be the model it says it is. the numbers are
 * all free to be tuned; these are the walls of the room they are tuned in.
 */
describe('erosion calibration', () => {
  it('divides the block evenly into cells', () => {
    expect(cellSize(512, EROSION)).toBe(EROSION.extent / 512);
  });

  it('bounds the timestep by the cell size and the pipe, and by nothing else', () => {
    const limit = stableTimestep(16, EROSION);

    expect(limit).toBeCloseTo(8 / Math.sqrt(EROSION.gravity * EROSION.pipeDepth), 12);
    expect(stableTimestep(32, EROSION)).toBeCloseTo(limit * 2, 12);
  });

  it('never asks a flow to pick up more than the room it has in one step', () => {
    // `erode` takes loose material at the dissolve rate times the regolith factor; past 1 it would overfill
    expect(EROSION.timestep * EROSION.dissolveRate * EROSION.regolithFactor).toBeLessThanOrEqual(1);
    expect(EROSION.regolithFactor).toBeGreaterThanOrEqual(1);
  });

  it('never asks a flow to lay down more than its excess in one step', () => {
    expect(EROSION.timestep * EROSION.depositRate).toBeLessThanOrEqual(1);
  });

  it('slides little enough in a step that a pit fed from four sides cannot overfill', () => {
    // four neighbours each shed a share of their drop into one cell, and each falls by its own share: five in all
    expect(EROSION.slumpShare * 5).toBeLessThanOrEqual(1);
    expect(EROSION.slumpShare).toBeGreaterThan(0);
  });

  it('lets rock stand steeper than loose material, and hard rock steeper than soft', () => {
    expect(EROSION.talusRockSoft).toBeGreaterThan(EROSION.talusRegolith);
    expect(EROSION.talusRockHard).toBeGreaterThan(EROSION.talusRockSoft);
  });

  it('gives every bed some give: the hardest still erodes', () => {
    expect(EROSION.hardestBed).toBeGreaterThan(0);
    expect(EROSION.hardestBed).toBeLessThan(1);
  });

  it('stacks beds from below the deepest cut to above the highest ground, folds included', () => {
    const reach = EROSION.strataDip / 2 + EROSION.strataFold;

    expect(EROSION.strataFloor).toBeLessThan(EROSION.baseLevel - reach);
    expect(EROSION.strataFloor + EROSION.strataSpan).toBeGreaterThan(
      EROSION.baseLevel + EROSION.relief + reach
    );
  });

  it('makes beds thick enough to see and thin enough that a valley crosses several', () => {
    const entry = EROSION.strataSpan / STRATA_ENTRIES;

    expect(EROSION.bedThinnest).toBeGreaterThanOrEqual(1);
    expect(EROSION.bedThickest).toBeGreaterThanOrEqual(EROSION.bedThinnest);
    expect(EROSION.bedThickest * entry).toBeLessThan(EROSION.relief / 4);
  });

  it('treats as dry a depth well under the depth at which water is credited with a velocity', () => {
    expect(EROSION.dryDepth).toBeLessThan(EROSION.depthFloor);
    expect(EROSION.depthFloor).toBeLessThan(EROSION.rampDepth);
  });

  it('rains faster than it evaporates, or there would be no storm', () => {
    expect(EROSION.rainRate).toBeGreaterThan(EROSION.evaporationRate);
  });
});
