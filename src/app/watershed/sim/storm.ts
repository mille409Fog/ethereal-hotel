/**
 * one storm: a land raised from a seed, the simulation running on it, the land and its water standing on the
 * stage, and the storm's one clock (`direction/direction.ts`) telling everything else where it is.
 *
 * the component decides when a storm starts, which is once the quality meter has settled, because the grid is
 * a property of the tier and a storm cannot change grids halfway. after that the component calls `advance` once
 * a frame and this does the rest: asks the clock how many steps the frame is worth, runs them with the rain their
 * place in the storm calls for, has the light worked out again if any ran or the sun moved, points the two
 * meshes at wherever the land and its flow now are, and tells the land, the water and the air the hour.
 *
 * - **two clocks.** `p` is steps run over steps in all, so everything tied to the storm keeps pace with the
 *   simulation and not the wall. `e` is seconds since the last step, on the piece's own clock: frame time, at
 *   most `CLOCK_STALL_MS` a frame so a hidden tab is not made up, and none at all while paused. the air's clock
 *   and the water's ripples run on the same seconds, so a paused piece is still: the rain's streaks and the
 *   ripples stop with the land.
 * - **a pause is no steps and no seconds**, and that is all it is. a frame that runs no step and moves no sun
 *   tells the light pass nothing, so the pass does not run: `land/light-pass.ts` keeps the flag.
 * - **the valley is read once**, in the frame the last step runs, from a quarter copy of the land
 *   (`direction/readback.ts`), and the camera's pass flies up it from the next frame.
 * - **the readout's volumes are read once a second**, asynchronously, and only when a step has run since the
 *   last read, so a paused or finished storm reads nothing more. what comes back after the storm is disposed is
 *   dropped.
 *
 * the stage's slab is what stands there while there is no land. a storm hides it and puts it back.
 *
 * the light pass marches along the air's own sun (`air/air.ts`), and `sunTo` moves that one vector, so the sky
 * and the shadows cannot disagree about where it is.
 *
 * raising the land happens here, on the main thread, in the frame the storm starts. it is noise evaluated at
 * every cell, and it is a visible hitch on the largest grid, once a visit and again for each new land.
 */
import * as THREE from 'three';
import { DIRECTION, IDirection } from '../direction/direction-calibration';
import { greeningAt, rainAt, sunAt, weatherAt } from '../direction/direction';
import { createLandReader, ILandReader } from '../direction/readback';
import { QUARTER } from '../direction/readback-shaders';
import { IReadout, volumesOf } from '../direction/readout';
import { coarsen, findValley, IValley, waterSurface } from '../direction/valley';
import { LAND_LOOK } from '../land/land-calibration';
import { createLandMesh } from '../land/land-mesh';
import { createLightPass, ILightPass } from '../land/light-pass';
import { EROSION, IErosionConstants } from '../model/erosion-calibration';
import { ILand } from '../model/land';
import { raise } from '../model/reference';
import { IQualityTier } from '../quality/quality-calibration';
import { IStage } from '../stage/create-stage';
import { createWaterMesh } from '../water/water-mesh';
import { CLOCK_STALL_MS, READ_EVERY_MS, STORM_SECONDS } from './sim-calibration';
import { ISimClock, tick, UNSTARTED } from './sim-clock';
import { createSimDriver } from './sim-driver';

/** where the storm's clocks stand after a frame */
export interface IStormFrame {
  /** steps run in all */
  readonly steps: number;
  /** `p`: steps run over steps in all, in [0, 1] */
  readonly progress: number;
  /** `e`: seconds since the last step ran, on the piece's clock; 0 until it has */
  readonly ended: number;
}

export interface IStorm {
  /** steps in the whole storm */
  readonly total: number;
  /** the land's light, which is worked out again only in a frame that ran a step or moved the sun */
  readonly light: ILightPass;
  /** the main valley, found when the last step has run; null before then, and on a land too small for one */
  readonly valley: IValley | null;
  /** what the readout says now */
  readonly readout: IReadout;
  /** runs the steps the frame at `nowMs` is worth, none while `paused`, and says where the clocks stand */
  advance(nowMs: number, paused?: boolean): IStormFrame;
  /** frees the simulation and the land, and puts the slab back */
  dispose(): void;
}

interface IVolumes {
  readonly moved: number;
  readonly exported: number;
}

/**
 * the readout's two volumes, read at most once every `READ_EVERY_MS` and only when a step has run since the last
 * read. `read` is called every frame with the frame's time and the steps run; `latest` is the last that came back
 */
function followVolumes(
  reader: ILandReader,
  size: number,
  constants: IErosionConstants
): { read(nowMs: number, steps: number): void; readonly latest: IVolumes | null; stop(): void } {
  let latest: IVolumes | null = null;
  let reading = false;
  let readMs: number | null = null;
  let readSteps = -1;
  let stopped = false;
  return {
    get latest(): IVolumes | null {
      return latest;
    },
    read(nowMs: number, steps: number): void {
      readMs ??= nowMs;
      if (reading || steps === readSteps || nowMs - readMs < READ_EVERY_MS) {
        return;
      }
      reading = true;
      readMs = nowMs;
      readSteps = steps;
      reader
        .sums()
        .then((sums) => {
          if (!stopped) {
            latest = volumesOf(sums, size, constants);
          }
        })
        .catch(() => {
          // a read that fails, as one does when the context is lost, leaves the last one standing
        })
        .finally(() => {
          reading = false;
        });
    },
    stop(): void {
      stopped = true;
    },
  };
}

/** the main valley of the land as it stands, from a quarter copy read now */
function valleyOf(
  reader: ILandReader,
  raised: ILand,
  constants: IErosionConstants,
  direction: IDirection
): IValley | null {
  const uplift = coarsen(raised.terrain.uplift, raised.terrain.size, QUARTER);
  const surface = waterSurface(reader.quarter(), uplift);
  return findValley(surface, reader.quarterSize, constants.extent, direction);
}

export function startStorm(
  renderer: THREE.WebGLRenderer,
  stage: IStage,
  seed: number,
  tier: IQualityTier,
  constants: IErosionConstants = EROSION,
  direction: IDirection = DIRECTION
): IStorm {
  const total = constants.stormSteps;
  const raised = raise(seed, tier.grid, constants);
  const driver = createSimDriver(renderer, raised, constants);
  const light = createLightPass(renderer, driver, constants, LAND_LOOK, stage.air.sun);
  const land = createLandMesh(driver, light, constants, stage.air.uniforms);
  const water = createWaterMesh(driver, land, constants);
  const reader = createLandReader(renderer, driver);
  const volumes = followVolumes(reader, driver.size, constants);
  stage.placeholder.visible = false;
  stage.scene.add(land.mesh, water.mesh);

  let clock: ISimClock = UNSTARTED;
  let lastMs: number | null = null;
  let seconds = 0;
  let endedAt: number | null = null;
  let valley: IValley | null = null;
  let rained = 0;

  return {
    total,
    light,
    get valley(): IValley | null {
      return valley;
    },
    get readout(): IReadout {
      return {
        steps: clock.steps,
        total,
        rain: rained,
        moved: volumes.latest?.moved ?? null,
        exported: volumes.latest?.exported ?? null,
      };
    },
    advance(nowMs: number, paused = false): IStormFrame {
      const pace = paused ? 0 : total / STORM_SECONDS;
      const ticked = tick(clock, nowMs, pace, tier.stepsPerFrame, total);
      for (let n = 0; n < ticked.steps; n++) {
        const strength = rainAt((clock.steps + n) / total, direction);
        driver.step(strength);
        rained += strength * constants.rainRate * constants.timestep;
      }
      clock = ticked.clock;
      if (lastMs !== null && !paused) {
        seconds += Math.min(Math.max(0, nowMs - lastMs), CLOCK_STALL_MS) / 1000;
      }
      lastMs = nowMs;
      if (ticked.steps > 0) {
        light.landMoved();
      }
      if (clock.steps === total && endedAt === null) {
        endedAt = seconds;
        valley = valleyOf(reader, raised, constants, direction);
      }
      const progress = clock.steps / total;
      const ended = endedAt === null ? 0 : seconds - endedAt;

      const [x, y, z] = sunAt(progress, ended, direction);
      light.sunTo(x, y, z);
      light.update();
      // the rain the next step will fall with, and the sky it falls from
      const rain = rainAt(progress, direction);
      land.follow(rain, greeningAt(ended, direction));
      stage.air.follow(weatherAt(progress, ended, direction), rain, seconds);
      water.follow(seconds);
      volumes.read(nowMs, clock.steps);
      return { steps: clock.steps, progress, ended };
    },
    dispose(): void {
      volumes.stop();
      stage.scene.remove(land.mesh, water.mesh);
      stage.placeholder.visible = true;
      reader.dispose();
      water.dispose();
      land.dispose();
      light.dispose();
      driver.dispose();
    },
  };
}
