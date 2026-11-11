import * as THREE from 'three';
import { EROSION, IErosionConstants } from '../model/erosion-calibration';
import { IQualityTier } from '../quality/quality-calibration';
import { HERO_SEED } from '../seed/seed';
import { createStage, IStage } from '../stage/create-stage';
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

/** records the rain's strength at each step: the first pass of every nine */
class FakeRenderer {
  public readonly strengths: number[] = [];
  private draws = 0;

  public getRenderTarget(): null {
    return null;
  }

  public setRenderTarget(): void {
    // nothing to bind
  }

  public render(scene: THREE.Scene): void {
    if (this.draws % SIM_PASSES.length === 0) {
      const { material } = scene.children[0] as THREE.Mesh<
        THREE.BufferGeometry,
        THREE.RawShaderMaterial
      >;
      this.strengths.push(material.uniforms[SIM_STRENGTH].value as number);
    }
    this.draws++;
  }
}

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

  it('puts the map of its land on the slab as soon as it starts', () => {
    const { stage } = begin();

    expect(stage.placeholder.material).toBeInstanceOf(THREE.ShaderMaterial);
    expect(stage.placeholder.material).not.toBe(stage.plain);
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

  it('gives the slab its own material back when it is over, and frees its map', () => {
    const { stage, storm } = begin();
    const map = vi.spyOn(stage.placeholder.material, 'dispose');
    storm.dispose();

    expect(stage.placeholder.material).toBe(stage.plain);
    expect(map).toHaveBeenCalledTimes(1);
  });
});
