import * as THREE from 'three';
import { AIR_CLOCK, WEATHER } from '../air/air-shaders';
import { DIRECTION } from '../direction/direction-calibration';
import { greeningAt, rainAt, sunAt } from '../direction/direction';
import { READBACK_PASS } from '../direction/readback';
import { LAND_MESH } from '../land/land-mesh';
import { GREENING, RAIN, SUN_DIRECTION } from '../land/land-shaders';
import { LIGHT_PASS } from '../land/light-pass';
import { EROSION, IErosionConstants } from '../model/erosion-calibration';
import { IQualityTier } from '../quality/quality-calibration';
import { HERO_SEED } from '../seed/seed';
import { createStage, IStage } from '../stage/create-stage';
import { WATER_LOOK } from '../water/water-calibration';
import { WATER_MESH } from '../water/water-mesh';
import { RIPPLE } from '../water/water-shaders';
import { READ_EVERY_MS, STORM_SECONDS } from './sim-calibration';
import { SIM_PASSES, SIM_STRENGTH } from './sim-shaders';
import { IStorm, startStorm } from './storm';

/**
 * a storm of 3,600 steps on a grid of sixteen cells. the count is not free: a storm always lasts
 * `STORM_SECONDS`, so fewer steps are longer ones, and at twenty a step is four and a half seconds, which the clock
 * rightly takes for a hidden tab. 3,600 makes a step 25 milliseconds, so the tier's cap of six a frame is reached
 * well inside the clock's stall limit, and a whole storm is few enough frames to run many times under coverage.
 * sixteen is the smallest grid whose quarter copy is big enough to have a valley in it.
 */
const CONSTANTS: IErosionConstants = { ...EROSION, extent: 16 * 16, stormSteps: 3600 };
const TIER: IQualityTier = { name: 'spec', resolutionScale: 1, grid: 16, stepsPerFrame: 6 };
/** the frame length at which exactly one step is due */
const STEP_MS = (STORM_SECONDS * 1000) / CONSTANTS.stormSteps;

/** records the rain's strength at each step, and counts the light's draws and the land's reads */
class FakeRenderer {
  public readonly strengths: number[] = [];
  public lit = 0;
  public quarters = 0;
  public sums = 0;

  public getRenderTarget(): null {
    return null;
  }

  public setRenderTarget(): void {
    // nothing to bind
  }

  public render(scene: THREE.Scene): void {
    const { material } = scene.children[0] as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.RawShaderMaterial
    >;
    if (material.name === SIM_PASSES[0].name) {
      this.strengths.push(material.uniforms[SIM_STRENGTH].value as number);
    }
    if (material.name === LIGHT_PASS) {
      this.lit++;
    }
    expect([...SIM_PASSES.map((pass) => pass.name), LIGHT_PASS, READBACK_PASS]).toContain(
      material.name
    );
  }

  /** the quarter copy: a land cut nowhere, dry and bare, so the valley is the raised land's own */
  public readRenderTargetPixels(
    _target: unknown,
    _x: number,
    _y: number,
    _w: number,
    _h: number,
    buffer: Float32Array
  ): void {
    this.quarters++;
    buffer.fill(0);
  }

  public readRenderTargetPixelsAsync(
    _target: unknown,
    _x: number,
    _y: number,
    _w: number,
    _h: number,
    buffer: Float32Array
  ): Promise<Float32Array> {
    this.sums++;
    buffer.set([2, 0.5, 9, 0.25]);
    return Promise.resolve(buffer);
  }
}

const landIn = (stage: IStage): THREE.Mesh<THREE.BufferGeometry, THREE.RawShaderMaterial> =>
  stage.scene.children.find((child) => child.name === LAND_MESH) as THREE.Mesh<
    THREE.BufferGeometry,
    THREE.RawShaderMaterial
  >;

const waterIn = (stage: IStage): THREE.Mesh<THREE.BufferGeometry, THREE.RawShaderMaterial> =>
  stage.scene.children.find((child) => child.name === WATER_MESH) as THREE.Mesh<
    THREE.BufferGeometry,
    THREE.RawShaderMaterial
  >;

const begin = (): { renderer: FakeRenderer; stage: IStage; storm: IStorm } => {
  const renderer = new FakeRenderer();
  const stage = createStage();
  const storm = startStorm(
    renderer as unknown as THREE.WebGLRenderer,
    stage,
    HERO_SEED,
    TIER,
    CONSTANTS
  );
  return { renderer, stage, storm };
};

/** a frame a step long from `from` until the storm's last step has run; returns the last frame's time */
const runOut = (storm: IStorm, from = 0): number => {
  let now = from;
  storm.advance(now);
  while (storm.advance((now += STEP_MS)).steps < CONSTANTS.stormSteps) {
    // the loop's condition is the frame
  }
  return now;
};

/** lets every read already handed back be taken in */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** frames a step long for `seconds` more, from `from`; returns the last frame's time */
const runOn = (storm: IStorm, from: number, seconds: number, paused = false): number => {
  let now = from;
  for (let k = 0; k < (seconds * 1000) / STEP_MS; k++) {
    storm.advance((now += STEP_MS), paused);
  }
  return now;
};

describe('storm', () => {
  it('is as long as the calibration says', () => {
    expect(begin().storm.total).toBe(CONSTANTS.stormSteps);
  });

  it('stands its land on the stage as soon as it starts', () => {
    const { stage } = begin();

    expect(landIn(stage)).toBeInstanceOf(THREE.Mesh);
  });

  it('lays the water’s mesh over the land, to be drawn after it', () => {
    const { stage } = begin();

    expect(waterIn(stage)).toBeInstanceOf(THREE.Mesh);
    expect(waterIn(stage).renderOrder).toBeGreaterThan(landIn(stage).renderOrder);
  });

  it('marches the light along the air’s own sun, so the sky and the shadows agree', () => {
    const { stage, storm } = begin();
    const land = landIn(stage);

    expect(storm.light.sun).toBe(stage.air.sun);
    expect(land.material.uniforms[SUN_DIRECTION].value).toBe(stage.air.sun);
    expect(land.material.uniforms[WEATHER]).toBe(stage.air.uniforms[WEATHER]);
  });

  describe('its steps', () => {
    it('runs the steps each frame is worth, and says how many it has run in all', () => {
      const { renderer, storm } = begin();

      expect(storm.advance(1_000).steps).toBe(0);
      expect(storm.advance(1_000 + STEP_MS * 2).steps).toBe(2);
      expect(storm.advance(1_000 + STEP_MS * 3).steps).toBe(3);
      expect(renderer.strengths).toHaveLength(3);
    });

    it('gives each step the rain its place in the storm calls for, to the last step and no further', () => {
      const { renderer, storm } = begin();
      runOut(storm);
      storm.advance(CONSTANTS.stormSteps * STEP_MS * 2);

      expect(renderer.strengths).toEqual(
        Array.from({ length: CONSTANTS.stormSteps }, (_, step) =>
          rainAt(step / CONSTANTS.stormSteps, DIRECTION)
        )
      );
    });

    it('runs no more in a frame than its tier allows', () => {
      const { renderer, storm } = begin();
      storm.advance(0);
      // twenty steps' worth of time in one frame
      storm.advance(STEP_MS * 20);

      expect(renderer.strengths).toHaveLength(TIER.stepsPerFrame);
    });

    it('says how far it has got, and how long ago it ended', () => {
      const { storm } = begin();
      storm.advance(0);
      const halfway = storm.advance(STEP_MS * 3);

      expect(halfway.progress).toBe(3 / CONSTANTS.stormSteps);
      expect(halfway.ended).toBe(0);

      const last = runOut(storm, STEP_MS * 3);
      const after = storm.advance(last + 200);

      expect(after.progress).toBe(1);
      expect(after.ended).toBeCloseTo(0.2, 9);
    });
  });

  describe('a pause', () => {
    it('runs no step, and does not make the steps up afterwards', () => {
      const { renderer, storm } = begin();
      storm.advance(0);
      storm.advance(STEP_MS * 2);
      const now = runOn(storm, STEP_MS * 2, 1, true);

      expect(renderer.strengths).toHaveLength(2);

      storm.advance(now + STEP_MS);

      expect(renderer.strengths).toHaveLength(3);
    });

    it('stops the air’s clock and the water’s with it, so the rain and the ripples hold still', () => {
      const { stage, storm } = begin();
      storm.advance(0);
      const now = runOn(storm, 0, 0.5);
      const clock = stage.air.uniforms[AIR_CLOCK].value as number;
      const ripple = waterIn(stage).material.uniforms[RIPPLE].value as number;
      runOn(storm, now, 2, true);

      expect(stage.air.uniforms[AIR_CLOCK].value).toBe(clock);
      expect(waterIn(stage).material.uniforms[RIPPLE].value).toBe(ripple);
    });

    it('lights nothing: a paused land is lit already', () => {
      const { renderer, storm } = begin();
      storm.advance(1_000);
      storm.advance(1_000 + STEP_MS * 2);
      const lit = renderer.lit;
      runOn(storm, 1_000 + STEP_MS * 2, 1, true);

      expect(storm.light.dirty).toBe(false);
      expect(renderer.lit).toBe(lit);
    });

    it('holds the hour after the storm too: the sun, the weather and the plants wait', () => {
      const { stage, storm } = begin();
      const now = runOn(storm, runOut(storm), 2);
      const sun = stage.air.sun.clone();
      const weather = stage.air.uniforms[WEATHER].value as number;
      const ended = storm.advance(now + STEP_MS, true).ended;
      runOn(storm, now + STEP_MS, 3, true);

      expect(stage.air.sun.equals(sun)).toBe(true);
      expect(stage.air.uniforms[WEATHER].value).toBe(weather);
      expect(storm.advance(now + 10_000, true).ended).toBe(ended);
    });
  });

  describe('its clock', () => {
    it('tells the air and the water the seconds the piece has run, starting from none', () => {
      const { stage, storm } = begin();
      storm.advance(2_500);

      expect(stage.air.uniforms[AIR_CLOCK].value).toBe(0);

      storm.advance(2_500 + 100);

      expect(stage.air.uniforms[AIR_CLOCK].value).toBeCloseTo(0.1, 9);
    });

    it('does not count a hidden tab’s absence as time', () => {
      const { stage, storm } = begin();
      storm.advance(0);
      storm.advance(60_000);

      expect(stage.air.uniforms[AIR_CLOCK].value).toBeLessThan(0.3);
    });

    it('keeps the water’s ripples running on it, step or no step', () => {
      const { stage, storm } = begin();
      // a quarter of a ripple's period, in frames that run no step once the storm is over
      const now = runOut(storm);
      const from = waterIn(stage).material.uniforms[RIPPLE].value as number;
      runOn(storm, now, WATER_LOOK.ripplePeriod / 4);
      const to = waterIn(stage).material.uniforms[RIPPLE].value as number;

      expect((to - from + 1) % 1).toBeCloseTo(0.25, 2);
    });
  });

  describe('the hour', () => {
    it('is overcast and raining in the storm, and clear and dry once the cloud has broken after it', () => {
      const { stage, storm } = begin();
      const uniforms = landIn(stage).material.uniforms;
      storm.advance(0);
      // a ninth of the way in, where the rain is full
      const now = runOn(storm, 0, 10);

      expect(stage.air.uniforms[WEATHER].value).toBe(0);
      expect(uniforms[RAIN].value).toBe(1);
      expect(stage.air.rain.enabled).toBe(true);

      runOn(storm, runOut(storm, now), DIRECTION.clearSeconds);

      expect(stage.air.uniforms[WEATHER].value).toBe(1);
      expect(uniforms[RAIN].value).toBe(0);
      expect(stage.air.rain.enabled).toBe(false);
    });

    it('is still overcast in the moment the last step runs, so the land drains under the cloud that rained on it', () => {
      const { stage, storm } = begin();
      runOut(storm);

      expect(stage.air.uniforms[WEATHER].value).toBe(0);
    });

    it('moves the sun only after the storm, and lights the land again only while it moves', () => {
      const { renderer, stage, storm } = begin();
      const now = runOut(storm);
      const [x, y, z] = sunAt(1, 0, DIRECTION);

      expect(stage.air.sun.toArray()).toEqual([x, y, z]);

      runOn(storm, now, DIRECTION.sunSeconds + 1);
      const golden = sunAt(1, DIRECTION.sunSeconds, DIRECTION);

      expect(stage.air.sun.toArray()).toEqual([...golden]);
      const lit = renderer.lit;
      runOn(storm, now + (DIRECTION.sunSeconds + 1) * 1000, 2);

      expect(renderer.lit).toBe(lit);
    });

    it('brings the plants in after the light', () => {
      const { stage, storm } = begin();
      const uniforms = landIn(stage).material.uniforms;
      const now = runOut(storm);

      expect(uniforms[GREENING].value).toBe(0);

      runOn(storm, now, DIRECTION.greenTo + 1);

      expect(uniforms[GREENING].value).toBe(greeningAt(DIRECTION.greenTo + 1, DIRECTION));
      expect(uniforms[GREENING].value).toBe(1);
    });
  });

  describe('the light', () => {
    it('lights the land in its first frame, before any step has run', () => {
      const { renderer, storm } = begin();
      storm.advance(1_000);

      expect(renderer.strengths).toHaveLength(0);
      expect(renderer.lit).toBe(1);
      expect(storm.light.dirty).toBe(false);
    });

    it('works the light out once in a frame that ran steps, however many', () => {
      const { renderer, storm } = begin();
      storm.advance(1_000);
      storm.advance(1_000 + STEP_MS * 4);

      expect(renderer.strengths).toHaveLength(4);
      expect(renderer.lit).toBe(2);
    });
  });

  describe('the valley', () => {
    it('is not looked for until the last step has run, and then is read once, at once', () => {
      const { renderer, storm } = begin();
      storm.advance(0);
      runOn(storm, 0, 10);

      expect(storm.valley).toBeNull();
      expect(renderer.quarters).toBe(0);

      const now = runOut(storm, 10_000);

      expect(renderer.quarters).toBe(1);
      expect(storm.valley?.points.length).toBeGreaterThan(1);

      runOn(storm, now, 1);

      expect(renderer.quarters).toBe(1);
    });
  });

  describe('the readout', () => {
    it('counts the rain delivered, step by step', () => {
      const { storm } = begin();
      runOut(storm);
      let expected = 0;
      for (let step = 0; step < CONSTANTS.stormSteps; step++) {
        expected +=
          rainAt(step / CONSTANTS.stormSteps, DIRECTION) * CONSTANTS.rainRate * CONSTANTS.timestep;
      }

      expect(storm.readout.rain).toBeCloseTo(expected, 12);
      expect(storm.readout.steps).toBe(CONSTANTS.stormSteps);
    });

    it('has read no rock until a second has passed, and then reads it without waiting', async () => {
      const { renderer, storm } = begin();
      storm.advance(0);
      runOn(storm, 0, (READ_EVERY_MS - 100) / 1000);

      expect(renderer.sums).toBe(0);
      expect(storm.readout.moved).toBeNull();

      runOn(storm, READ_EVERY_MS - 100, 0.2);
      await settle();

      expect(renderer.sums).toBe(1);
      const area = (CONSTANTS.extent / TIER.grid) ** 2;
      expect(storm.readout.moved).toBe(2 * area);
      expect(storm.readout.exported).toBe(1.25 * area);
    });

    it('reads once more after a pause begins, to catch the last steps, and then nothing while nothing changes', async () => {
      const { renderer, storm } = begin();
      storm.advance(0);
      let now = runOn(storm, 0, 1.1);
      await settle();
      now = runOn(storm, now, 2, true);
      await settle();
      const reads = renderer.sums;
      runOn(storm, now, 5, true);

      expect(reads).toBe(2);
      expect(renderer.sums).toBe(reads);
    });

    it('drops a read that comes back after the storm is gone', async () => {
      const { storm } = begin();
      storm.advance(0);
      runOn(storm, 0, 1.1);
      storm.dispose();
      await settle();

      expect(storm.readout.moved).toBeNull();
    });
  });

  it('takes its land off the stage when it is over, and frees it', () => {
    const { stage, storm } = begin();
    const land = landIn(stage);
    const geometry = vi.spyOn(land.geometry, 'dispose');
    const material = vi.spyOn(land.material, 'dispose');
    const light = vi.spyOn(storm.light, 'dispose');
    storm.dispose();

    expect(stage.scene.children.some((child) => child.name === WATER_MESH)).toBe(false);
    expect(stage.scene.children.some((child) => child.name === LAND_MESH)).toBe(false);
    expect(geometry).toHaveBeenCalledTimes(1);
    expect(material).toHaveBeenCalledTimes(1);
    expect(light).toHaveBeenCalledTimes(1);
  });
});
