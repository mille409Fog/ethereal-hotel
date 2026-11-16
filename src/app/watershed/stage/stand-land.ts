/**
 * a land standing on the stage: its light, its ground and its water in the scene, told each frame where the
 * piece's clocks stand. a storm stands its live land here (`sim/storm.ts`) and a stored land stands its decoded
 * one (`stored/stored-land.ts`), through the same function, so a stored land is lit and drawn by the code that
 * draws a live one and the two cannot be shaded differently.
 *
 * what differs between them is only what they are standing: a driver's textures, which change every step, or a
 * stored land's, which never do. both are `ISimTextures`.
 *
 * the light pass marches along the air's own sun (`air/air.ts`), and `sunTo` moves that one vector, so the sky
 * and the shadows cannot disagree about where it is.
 */
import * as THREE from 'three';
import { IDirection } from '../direction/direction-calibration';
import { greeningAt, rainAt, sunAt, weatherAt } from '../direction/direction';
import { IValley } from '../direction/valley';
import { LAND_LOOK } from '../land/land-calibration';
import { createLandMesh } from '../land/land-mesh';
import { createLightPass, ILightPass } from '../land/light-pass';
import { IErosionConstants } from '../model/erosion-calibration';
import { CLOCK_STALL_MS } from '../sim/sim-calibration';
import { ISimTextures } from '../sim/sim-driver';
import { createWaterMesh } from '../water/water-mesh';
import { IStage } from './create-stage';

/** where the piece's clocks stand after a frame */
export interface IStormFrame {
  /** steps run in all */
  readonly steps: number;
  /** `p`: steps run over steps in all, in [0, 1] */
  readonly progress: number;
  /** `e`: seconds since the last step ran, on the piece's clock; 0 until it has */
  readonly ended: number;
}

/** a land on the stage and the clocks that move it, which is all the component needs of either kind */
export interface ILandShow {
  /** the main valley, once there is one to fly up; null before then, and on a land too small for one */
  readonly valley: IValley | null;
  /** moves the clocks to the frame at `nowMs`, none of the way while `paused`, and says where they stand */
  advance(nowMs: number, paused?: boolean): IStormFrame;
  /** takes the land off the stage and frees it */
  dispose(): void;
}

export interface IStanding {
  readonly light: ILightPass;
  /** tells the light, the ground, the water and the air where the clocks stand: `p`, `e`, and the piece's seconds */
  follow(progress: number, ended: number, seconds: number): void;
  /** takes the land off the stage and frees what this made; the textures are their owner's to free */
  dispose(): void;
}

export function standLand(
  renderer: THREE.WebGLRenderer,
  stage: IStage,
  textures: ISimTextures,
  constants: IErosionConstants,
  direction: IDirection
): IStanding {
  const light = createLightPass(renderer, textures, constants, LAND_LOOK, stage.air.sun);
  const land = createLandMesh(textures, light, constants, stage.air.uniforms);
  const water = createWaterMesh(textures, land, constants);
  stage.scene.add(land.mesh, water.mesh);
  return {
    light,
    follow(progress: number, ended: number, seconds: number): void {
      const [x, y, z] = sunAt(progress, ended, direction);
      light.sunTo(x, y, z);
      light.update();
      // the rain the next step will fall with, and the sky it falls from
      const rain = rainAt(progress, direction);
      land.follow(rain, greeningAt(ended, direction));
      stage.air.follow(weatherAt(progress, ended, direction), rain, seconds);
      water.follow(seconds);
    },
    dispose(): void {
      stage.scene.remove(land.mesh, water.mesh);
      water.dispose();
      land.dispose();
      light.dispose();
    },
  };
}

/**
 * the piece's own seconds: frame time, at most `CLOCK_STALL_MS` a frame so a hidden tab is not made up, and none
 * at all while paused. `tick` is called once a frame and says how many have passed in all
 */
export function pieceClock(): { tick(nowMs: number, paused: boolean): number } {
  let lastMs: number | null = null;
  let seconds = 0;
  return {
    tick(nowMs: number, paused: boolean): number {
      if (lastMs !== null && !paused) {
        seconds += Math.min(Math.max(0, nowMs - lastMs), CLOCK_STALL_MS) / 1000;
      }
      lastMs = nowMs;
      return seconds;
    },
  };
}
