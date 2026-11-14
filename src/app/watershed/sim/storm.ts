/**
 * one storm: a land raised from a seed, the simulation running on it, and the land and its water standing on
 * the stage.
 *
 * the component decides when a storm starts, which is once the quality meter has settled, because the grid is
 * a property of the tier and a storm cannot change grids halfway. after that the component calls `advance` once
 * a frame and this does the rest: asks the clock how many steps the frame is worth, runs them, has the light
 * worked out again if any ran, points the two meshes at wherever the land and its flow now are, and tells the
 * land how hard it is raining. the water is told the time and not the step, so a river still runs when the
 * storm that made it is over.
 *
 * the light follows the steps and not the frames. a frame worth no step, because the storm is over or the tab
 * was hidden, tells the light pass nothing, so the pass does not run: `land/light-pass.ts` keeps the flag.
 *
 * the stage's slab is what stands there while there is no land. a storm hides it and puts it back.
 *
 * the air is the stage's, and the storm tells it the weather, the rain and the time each frame. the light pass
 * marches along the air's own sun, so the sky and the shadows cannot disagree about where it is.
 *
 * raising the land happens here, on the main thread, in the frame the storm starts. it is noise evaluated at
 * every cell, and it is a visible hitch on the largest grid; the phase that directs the storm is the place to
 * hide it behind the opening, or to move it to a worker if hiding is not enough.
 */
import * as THREE from 'three';
import { LAND_LOOK } from '../land/land-calibration';
import { createLandMesh } from '../land/land-mesh';
import { createLightPass, ILightPass } from '../land/light-pass';
import { EROSION, IErosionConstants } from '../model/erosion-calibration';
import { raise } from '../model/reference';
import { IQualityTier } from '../quality/quality-calibration';
import { IStage } from '../stage/create-stage';
import { createWaterMesh } from '../water/water-mesh';
import { RAIN_SHARE, STORM_SECONDS } from './sim-calibration';
import { ISimClock, tick, UNSTARTED } from './sim-clock';
import { createSimDriver } from './sim-driver';

export interface IStorm {
  /** steps in the whole storm */
  readonly total: number;
  /** the land's light, which is worked out again only in a frame that ran a step */
  readonly light: ILightPass;
  /** runs the steps the frame at `nowMs` is worth, and returns how many the storm has run in all */
  advance(nowMs: number): number;
  /** frees the simulation and the land, and puts the slab back */
  dispose(): void;
}

/** the rain's strength at a step: full for the first share of the storm, then none, so the land can drain */
export function rainAt(step: number, total: number): number {
  return step < total * RAIN_SHARE ? 1 : 0;
}

/**
 * how clear the sky is at a step: overcast while it rains and clear once it has stopped. a stand-in, as the
 * rain's own on-off is, until the phase that directs the storm breaks the cloud over the seconds after it
 */
export function weatherAt(step: number, total: number): number {
  return 1 - rainAt(step, total);
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
  const light = createLightPass(renderer, driver, constants, LAND_LOOK, stage.air.sun);
  const land = createLandMesh(driver, light, constants, stage.air.uniforms);
  const water = createWaterMesh(driver, land, constants);
  stage.placeholder.visible = false;
  stage.scene.add(land.mesh, water.mesh);
  let clock: ISimClock = UNSTARTED;

  return {
    total,
    light,
    advance(nowMs: number): number {
      const ticked = tick(clock, nowMs, total / STORM_SECONDS, tier.stepsPerFrame, total);
      for (let n = 0; n < ticked.steps; n++) {
        driver.step(rainAt(clock.steps + n, total));
      }
      clock = ticked.clock;
      if (ticked.steps > 0) {
        light.landMoved();
      }
      light.update();
      // the rain the next step will fall with, and the sky it falls from
      const rain = rainAt(clock.steps, total);
      land.follow(rain);
      stage.air.follow(weatherAt(clock.steps, total), rain, nowMs / 1000);
      water.follow(nowMs / 1000);
      return clock.steps;
    },
    dispose(): void {
      stage.scene.remove(land.mesh, water.mesh);
      stage.placeholder.visible = true;
      water.dispose();
      land.dispose();
      light.dispose();
      driver.dispose();
    },
  };
}
