import * as THREE from 'three';
import { LAND_MESH } from '../land/land-mesh';
import { RAIN } from '../land/land-shaders';
import { LIGHT_PASS } from '../land/light-pass';
import { EROSION, IErosionConstants } from '../model/erosion-calibration';
import { IQualityTier } from '../quality/quality-calibration';
import { HERO_SEED } from '../seed/seed';
import { createStage, IStage } from '../stage/create-stage';
import { WATER_LOOK } from '../water/water-calibration';
import { WATER_MESH } from '../water/water-mesh';
import { RIPPLE } from '../water/water-shaders';
import { RAIN_SHARE, STORM_SECONDS } from './sim-calibration';
import { SIM_PASSES, SIM_STRENGTH } from './sim-shaders';
import { rainAt, startStorm } from './storm';

/**
 * a storm of nine thousand steps on a grid of eight cells. the count is not free: a storm always lasts
 * `STORM_SECONDS`, so fewer steps are longer ones, and at twenty a step is four and a half seconds, which the clock
 * rightly takes for a hidden tab. nine thousand makes a step ten milliseconds, shorter than a frame.
 */
const CONSTANTS: IErosionConstants = { ...EROSION, extent: 8 * 16, stormSteps: 9000 };
const TIER: IQualityTier = { name: 'spec', resolutionScale: 1, grid: 8, stepsPerFrame: 6 };
/** the frame length at which exactly one step is due */
const STEP_MS = (STORM_SECONDS * 1000) / CONSTANTS.stormSteps;

/** records the rain's strength at each step, from the first pass of every step, and counts the light's draws */
class FakeRenderer {
  public readonly strengths: number[] = [];
  public lit = 0;

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
  }
}

const landIn = (stage: IStage): THREE.Object3D | undefined =>
  stage.scene.children.find((child) => child.name === LAND_MESH);

const begin = (): {
  renderer: FakeRenderer;
  stage: IStage;
  storm: ReturnType<typeof startStorm>;
} => {
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

describe('storm', () => {
  it('rains for the first share of its steps and then stops, so the land can drain', () => {
    const lastWet = Math.ceil(20 * RAIN_SHARE) - 1;

    expect(rainAt(0, 20)).toBe(1);
    expect(rainAt(lastWet, 20)).toBe(1);
    expect(rainAt(lastWet + 1, 20)).toBe(0);
    expect(rainAt(19, 20)).toBe(0);
  });

  it('is as long as the calibration says', () => {
    expect(begin().storm.total).toBe(CONSTANTS.stormSteps);
  });

  it('stands its land on the stage in the slab’s place as soon as it starts', () => {
    const { stage } = begin();

    expect(landIn(stage)).toBeInstanceOf(THREE.Mesh);
    expect(stage.placeholder.visible).toBe(false);
  });

  it('lays the water’s mesh over the land, to be drawn after it', () => {
    const { stage } = begin();
    const water = stage.scene.children.find((child) => child.name === WATER_MESH);

    expect(water).toBeInstanceOf(THREE.Mesh);
    expect(water?.renderOrder).toBeGreaterThan(landIn(stage)?.renderOrder ?? Infinity);
  });

  it('tells the ground it is raining while it is, and that it has stopped when it has', () => {
    const { stage, storm } = begin();
    const { uniforms } = (
      landIn(stage) as THREE.Mesh<THREE.BufferGeometry, THREE.RawShaderMaterial>
    ).material;
    storm.advance(0);

    expect(uniforms[RAIN].value).toBe(1);

    for (let frame = 1; frame <= CONSTANTS.stormSteps + 5; frame++) {
      storm.advance(frame * STEP_MS);
    }

    expect(uniforms[RAIN].value).toBe(0);
  });

  it('keeps the water’s ripples running on the frame’s clock, step or no step', () => {
    const { stage, storm } = begin();
    const water = stage.scene.children.find((child) => child.name === WATER_MESH) as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.RawShaderMaterial
    >;
    storm.advance(WATER_LOOK.ripplePeriod * 250);
    storm.advance(WATER_LOOK.ripplePeriod * 1250);

    expect(water.material.uniforms[RIPPLE].value).toBeCloseTo(0.25, 9);
  });

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

  it('leaves the light alone in a frame that ran no step: a paused land is lit already', () => {
    const { renderer, storm } = begin();
    storm.advance(1_000);
    storm.advance(1_000 + STEP_MS * 2);
    const lit = renderer.lit;
    // three frames with no time between them: nothing is due, as when the simulation is paused
    storm.advance(1_000 + STEP_MS * 2);
    storm.advance(1_000 + STEP_MS * 2);
    storm.advance(1_000 + STEP_MS * 2);

    expect(renderer.strengths).toHaveLength(2);
    expect(storm.light.dirty).toBe(false);
    expect(renderer.lit).toBe(lit);
  });

  it('stops lighting the land when the storm is over', () => {
    const { renderer, storm } = begin();
    storm.advance(0);
    for (let frame = 1; frame <= CONSTANTS.stormSteps + 5; frame++) {
      storm.advance(frame * STEP_MS);
    }
    const lit = renderer.lit;
    storm.advance((CONSTANTS.stormSteps + 50) * STEP_MS);
    storm.advance((CONSTANTS.stormSteps + 100) * STEP_MS);

    expect(storm.light.dirty).toBe(false);
    expect(renderer.lit).toBe(lit);
  });

  it('runs the steps each frame is worth, and says how many it has run in all', () => {
    const { renderer, storm } = begin();

    expect(storm.advance(1_000)).toBe(0);
    expect(storm.advance(1_000 + STEP_MS * 2)).toBe(2);
    expect(storm.advance(1_000 + STEP_MS * 3)).toBe(3);
    expect(renderer.strengths).toHaveLength(3);
  });

  it('gives each step the rain its place in the storm calls for, to the last step and no further', () => {
    const { renderer, storm } = begin();
    let done = storm.advance(0);
    for (let frame = 1; frame <= CONSTANTS.stormSteps + 5; frame++) {
      done = storm.advance(frame * STEP_MS);
    }

    expect(done).toBe(CONSTANTS.stormSteps);
    expect(renderer.strengths).toEqual(
      Array.from({ length: CONSTANTS.stormSteps }, (_, step) => rainAt(step, CONSTANTS.stormSteps))
    );
  });

  it('runs no more in a frame than its tier allows', () => {
    const { renderer, storm } = begin();
    storm.advance(0);
    // twenty steps' worth of time in one frame
    storm.advance(STEP_MS * 20);

    expect(renderer.strengths).toHaveLength(TIER.stepsPerFrame);
  });

  it('takes its land off the stage when it is over, frees it, and puts the slab back', () => {
    const { stage, storm } = begin();
    const land = landIn(stage) as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
    const geometry = vi.spyOn(land.geometry, 'dispose');
    const material = vi.spyOn(land.material, 'dispose');
    const light = vi.spyOn(storm.light, 'dispose');
    storm.dispose();

    expect(stage.scene.children.some((child) => child.name === WATER_MESH)).toBe(false);
    expect(landIn(stage)).toBeUndefined();
    expect(stage.placeholder.visible).toBe(true);
    expect(geometry).toHaveBeenCalledTimes(1);
    expect(material).toHaveBeenCalledTimes(1);
    expect(light).toHaveBeenCalledTimes(1);
  });
});
