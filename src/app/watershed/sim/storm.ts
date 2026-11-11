/**
 * one storm: a land raised from a seed, the simulation running on it, and the map of it on the stage's slab.
 *
 * the component decides when a storm starts, which is once the quality meter has settled, because the grid is
 * a property of the tier and a storm cannot change grids halfway. after that the component calls `advance` once
 * a frame and this does the rest: asks the clock how many steps the frame is worth, runs them, and points the
 * map at wherever the land now is.
 *
 * raising the land happens here, on the main thread, in the frame the storm starts. it is noise evaluated at
 * every cell, and it is a visible hitch on the largest grid; the phase that directs the storm is the place to
 * hide it behind the opening, or to move it to a worker if hiding is not enough.
 */
import * as THREE from 'three';
import { EROSION, IErosionConstants } from '../model/erosion-calibration';
import { raise } from '../model/reference';
import { IQualityTier } from '../quality/quality-calibration';
import { IStage } from '../stage/create-stage';
import { createMapMaterial, followLand } from '../stage/map-material';
import { RAIN_SHARE, STORM_SECONDS } from './sim-calibration';
import { ISimClock, tick, UNSTARTED } from './sim-clock';
import { createSimDriver } from './sim-driver';

export interface IStorm {
  /** steps in the whole storm */
  readonly total: number;
  /** runs the steps the frame at `nowMs` is worth, and returns how many the storm has run in all */
  advance(nowMs: number): number;
  /** frees the simulation and gives the slab back its own material */
  dispose(): void;
}

/** the rain's strength at a step: full for the first share of the storm, then none, so the land can drain */
export function rainAt(step: number, total: number): number {
  return step < total * RAIN_SHARE ? 1 : 0;
}

export function startStorm(
  renderer: THREE.WebGLRenderer,
  stage: IStage,
  seed: number,
  tier: IQualityTier,
  constants: IErosionConstants = EROSION
): IStorm {
  const total = constants.stormSteps;
  const driver = createSimDriver(renderer, raise(seed, tier.grid, constants), constants);
  const map = createMapMaterial(driver, constants);
  stage.placeholder.material = map;
  let clock: ISimClock = UNSTARTED;

  return {
    total,
    advance(nowMs: number): number {
      const ticked = tick(clock, nowMs, total / STORM_SECONDS, tier.stepsPerFrame, total);
      for (let n = 0; n < ticked.steps; n++) {
        driver.step(rainAt(clock.steps + n, total));
      }
      clock = ticked.clock;
      followLand(map, driver);
      return clock.steps;
    },
    dispose(): void {
      stage.placeholder.material = stage.plain;
      map.dispose();
      driver.dispose();
    },
  };
}
