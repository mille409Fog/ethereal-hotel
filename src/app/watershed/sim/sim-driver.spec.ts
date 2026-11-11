import * as THREE from 'three';
import { EROSION, IErosionConstants } from '../model/erosion-calibration';
import { raise } from '../model/reference';
import { HERO_SEED } from '../seed/seed';
import { createSimDriver, ISimDriver } from './sim-driver';
import { CHANNELS } from './sim-layout';
import { SIM_CONSTANTS, SIM_PASSES, SIM_STATES, SIM_STRENGTH } from './sim-shaders';

const SIZE = 8;
const CONSTANTS: IErosionConstants = { ...EROSION, extent: SIZE * 16 };

interface IDraw {
  readonly pass: string;
  readonly into: THREE.WebGLRenderTarget | null;
  /** the textures the pass's samplers held when it drew, by sampler name */
  readonly read: Readonly<Record<string, THREE.Texture>>;
  readonly strength: number;
}

/**
 * jsdom has no WebGL, so nothing here is compiled or drawn; `scripts/verify-watershed.mjs` is where the shaders
 * meet a compiler. this renderer records what the driver asked for, which is the whole of the driver's own job.
 */
class FakeRenderer {
  public bound: THREE.WebGLRenderTarget | null = null;
  public readonly draws: IDraw[] = [];

  public getRenderTarget(): THREE.WebGLRenderTarget | null {
    return this.bound;
  }

  public setRenderTarget(target: THREE.WebGLRenderTarget | null): void {
    this.bound = target;
  }

  public render(scene: THREE.Scene): void {
    const { material } = scene.children[0] as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.RawShaderMaterial
    >;
    const read: Record<string, THREE.Texture> = {};
    for (const [name, uniform] of Object.entries(material.uniforms)) {
      if (uniform.value instanceof THREE.Texture) {
        read[name] = uniform.value;
      }
    }
    this.draws.push({
      pass: material.name,
      into: this.bound,
      read,
      strength: material.uniforms[SIM_STRENGTH].value as number,
    });
  }
}

const build = (): { driver: ISimDriver; renderer: FakeRenderer } => {
  const renderer = new FakeRenderer();
  const driver = createSimDriver(
    renderer as unknown as THREE.WebGLRenderer,
    raise(HERO_SEED, SIZE, CONSTANTS),
    CONSTANTS
  );
  return { driver, renderer };
};

describe('sim driver', () => {
  it('runs every pass of the table once a step, in the table’s order', () => {
    const { driver, renderer } = build();
    driver.step(1);
    driver.step(1);
    const order = SIM_PASSES.map((pass) => pass.name);

    expect(renderer.draws.map((draw) => draw.pass)).toEqual([...order, ...order]);
  });

  it('never hands a pass the copy of a texture it is drawing into', () => {
    const { driver, renderer } = build();
    for (let n = 0; n < 3; n++) {
      driver.step(1);
    }

    for (const draw of renderer.draws) {
      expect(draw.into).not.toBeNull();
      expect(Object.values(draw.read)).not.toContain(draw.into?.texture);
    }
  });

  it('gives each pass exactly the textures the table says it reads', () => {
    const { driver, renderer } = build();
    driver.step(1);

    renderer.draws.forEach((draw, index) => {
      expect(Object.keys(draw.read).sort()).toEqual([...SIM_PASSES[index].reads].sort());
    });
  });

  it('hands every pass what the last pass to write a texture wrote, across steps too', () => {
    const { driver, renderer } = build();
    driver.step(1);
    driver.step(1);
    const latest = new Map<string, THREE.Texture>();

    renderer.draws.forEach((draw, index) => {
      const pass = SIM_PASSES[index % SIM_PASSES.length];
      for (const state of SIM_STATES) {
        const written = latest.get(state);
        if (written && pass.reads.includes(state)) {
          expect(draw.read[state]).toBe(written);
        }
      }
      latest.set(pass.writes, (draw.into as THREE.WebGLRenderTarget).texture);
    });
    for (const state of SIM_STATES) {
      expect(driver.current(state)).toBe(latest.get(state));
    }
  });

  it('reads the fixed textures from the same two objects every time', () => {
    const { driver, renderer } = build();
    driver.step(1);
    driver.step(1);

    for (const draw of renderer.draws) {
      if (draw.read['terrain']) {
        expect(draw.read['terrain']).toBe(driver.terrain);
      }
      if (draw.read['strata']) {
        expect(draw.read['strata']).toBe(driver.strata);
      }
    }
  });

  it('passes the rain’s strength to every pass of the step it was given for', () => {
    const { driver, renderer } = build();
    driver.step(1);
    driver.step(0.25);
    const strengths = renderer.draws.map((draw) => draw.strength);

    expect(new Set(strengths.slice(0, SIM_PASSES.length))).toEqual(new Set([1]));
    expect(new Set(strengths.slice(SIM_PASSES.length))).toEqual(new Set([0.25]));
  });

  it('gives every pass every constant the shaders read, at its calibrated value', () => {
    const { driver, renderer } = build();
    let materials: THREE.RawShaderMaterial[] = [];
    vi.spyOn(renderer, 'render').mockImplementation((scene: THREE.Scene) => {
      materials = [
        ...materials,
        (scene.children[0] as THREE.Mesh).material as THREE.RawShaderMaterial,
      ];
    });
    driver.step(1);

    expect(materials).toHaveLength(SIM_PASSES.length);
    for (const material of materials) {
      for (const key of SIM_CONSTANTS) {
        expect(material.uniforms[key].value).toBe(CONSTANTS[key]);
      }
      expect(material.glslVersion).toBe(THREE.GLSL3);
      expect(material).toBeInstanceOf(THREE.RawShaderMaterial);
    }
  });

  it('draws into square 32-bit float targets the size of the land, read one texel at a time', () => {
    const { driver, renderer } = build();
    driver.step(1);

    for (const draw of renderer.draws) {
      const target = draw.into as THREE.WebGLRenderTarget;
      expect([target.width, target.height]).toEqual([SIZE, SIZE]);
      expect(target.texture.type).toBe(THREE.FloatType);
      expect(target.texture.minFilter).toBe(THREE.NearestFilter);
      expect(target.texture.magFilter).toBe(THREE.NearestFilter);
      expect(target.depthBuffer).toBe(false);
    }
    expect(driver.size).toBe(SIZE);
  });

  it('uploads the land as raised and its beds, unfiltered', () => {
    const { driver } = build();
    const land = raise(HERO_SEED, SIZE, CONSTANTS);
    const terrain = driver.terrain as THREE.DataTexture;
    const strata = driver.strata as THREE.DataTexture;

    expect(terrain.image.width).toBe(SIZE);
    expect((terrain.image.data as Float32Array)[9 * CHANNELS]).toBe(land.terrain.uplift[9]);
    expect((terrain.image.data as Float32Array)[9 * CHANNELS + 1]).toBe(land.terrain.warp[9]);
    expect([strata.image.width, strata.image.height]).toEqual([land.strata.erodibility.length, 1]);
    expect((strata.image.data as Float32Array)[5 * CHANNELS + 3]).toBe(land.strata.erodibility[5]);
    expect(terrain.type).toBe(THREE.FloatType);
    expect(terrain.magFilter).toBe(THREE.NearestFilter);
  });

  it('hands the renderer back bound to what it had', () => {
    const { driver, renderer } = build();
    const before = new THREE.WebGLRenderTarget(1, 1);
    renderer.bound = before;
    driver.step(1);

    expect(renderer.bound).toBe(before);
    before.dispose();
  });

  it('frees everything it made: two targets a state, the fixed textures, a material a pass', () => {
    const { driver, renderer } = build();
    driver.step(1);
    const targets = new Set(renderer.draws.map((draw) => draw.into as THREE.WebGLRenderTarget));
    const target = vi.spyOn(THREE.WebGLRenderTarget.prototype, 'dispose');
    const material = vi.spyOn(THREE.Material.prototype, 'dispose');
    const terrain = vi.spyOn(driver.terrain, 'dispose');
    const strata = vi.spyOn(driver.strata, 'dispose');
    driver.dispose();

    // one step writes land five times, so both of its copies were seen; the rest have a copy not yet drawn into
    expect(targets.size).toBeGreaterThan(SIM_STATES.length);
    expect(target).toHaveBeenCalledTimes(SIM_STATES.length * 2);
    expect(material).toHaveBeenCalledTimes(SIM_PASSES.length);
    expect(terrain).toHaveBeenCalledTimes(1);
    expect(strata).toHaveBeenCalledTimes(1);
    target.mockRestore();
    material.mockRestore();
  });
});
