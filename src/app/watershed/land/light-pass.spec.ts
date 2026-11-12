import * as THREE from 'three';
import { EROSION, IErosionConstants } from '../model/erosion-calibration';
import { raise } from '../model/reference';
import { HERO_SEED } from '../seed/seed';
import { createSimDriver, ISimDriver } from '../sim/sim-driver';
import { LAND_LOOK, sunDirection } from './land-calibration';
import { LIGHT_FRAGMENT, SUN_DIRECTION } from './land-shaders';
import { createLightPass, ILightPass, LIGHT_PASS } from './light-pass';

const SIZE = 8;
const CONSTANTS: IErosionConstants = { ...EROSION, extent: SIZE * 16 };

interface IDraw {
  readonly pass: string;
  readonly into: THREE.WebGLRenderTarget | null;
  readonly land: THREE.Texture;
}

/** jsdom has no WebGL; this records what was drawn, into what, reading which land */
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
    this.draws.push({
      pass: material.name,
      into: this.bound,
      land: material.uniforms['land'].value as THREE.Texture,
    });
  }

  public lit(): IDraw[] {
    return this.draws.filter((draw) => draw.pass === LIGHT_PASS);
  }
}

const build = (): { renderer: FakeRenderer; sim: ISimDriver; light: ILightPass } => {
  const renderer = new FakeRenderer();
  const sim = createSimDriver(
    renderer as unknown as THREE.WebGLRenderer,
    raise(HERO_SEED, SIZE, CONSTANTS),
    CONSTANTS
  );
  const light = createLightPass(renderer as unknown as THREE.WebGLRenderer, sim, CONSTANTS);
  return { renderer, sim, light };
};

describe('light pass', () => {
  it('starts dirty: a land never lit has changed since it last was', () => {
    expect(build().light.dirty).toBe(true);
  });

  it('works the light out once, and then not again while nothing moves', () => {
    const { renderer, light } = build();

    expect(light.update()).toBe(true);
    expect(light.dirty).toBe(false);
    expect(light.update()).toBe(false);
    expect(light.update()).toBe(false);
    expect(renderer.lit()).toHaveLength(1);
  });

  it('works it out again after the land has moved, once however many steps it moved by', () => {
    const { renderer, light } = build();
    light.update();
    light.landMoved();
    light.landMoved();

    expect(light.dirty).toBe(true);
    expect(light.update()).toBe(true);
    expect(light.update()).toBe(false);
    expect(renderer.lit()).toHaveLength(2);
  });

  it('works it out again after the sun has moved, and not for a sun put where it already is', () => {
    const { renderer, light } = build();
    light.update();
    const { x, y, z } = light.sun;

    light.sunTo(x, y, z);
    expect(light.dirty).toBe(false);

    light.sunTo(0, 1, 0);
    expect(light.dirty).toBe(true);
    expect(light.sun.toArray()).toEqual([0, 1, 0]);
    light.update();
    expect(renderer.lit()).toHaveLength(2);
  });

  it('starts with the calibrated sun, and marches toward the vector it hands the mesh', () => {
    const { renderer, light } = build();
    let marched: unknown;
    vi.spyOn(renderer, 'render').mockImplementation((scene: THREE.Scene) => {
      marched = ((scene.children[0] as THREE.Mesh).material as THREE.RawShaderMaterial).uniforms[
        SUN_DIRECTION
      ].value;
    });
    light.update();

    expect(light.sun.toArray()).toEqual(sunDirection(LAND_LOOK));
    expect(marched).toBe(light.sun);
  });

  it('reads the land from whichever copy the simulation says it is in when the pass runs', () => {
    const { renderer, sim, light } = build();
    light.update();
    const elsewhere = new THREE.Texture();
    vi.spyOn(sim, 'current').mockReturnValue(elsewhere);
    light.landMoved();
    light.update();
    const [first, second] = renderer.lit();

    expect(second.land).toBe(elsewhere);
    expect(first.land).not.toBe(elsewhere);
  });

  it('draws into one eight-bit, filtered target the size of the land, and hands that texture out', () => {
    const { renderer, light } = build();
    light.update();
    const target = renderer.lit()[0].into as THREE.WebGLRenderTarget;

    expect(target.texture).toBe(light.texture);
    expect([target.width, target.height]).toEqual([SIZE, SIZE]);
    expect(target.texture.type).toBe(THREE.UnsignedByteType);
    expect(target.texture.magFilter).toBe(THREE.LinearFilter);
    expect(target.depthBuffer).toBe(false);
  });

  it('hands the renderer back bound to what it had', () => {
    const { renderer, light } = build();
    const before = new THREE.WebGLRenderTarget(1, 1);
    renderer.bound = before;
    light.update();

    expect(renderer.bound).toBe(before);
    before.dispose();
  });

  it('supplies every uniform its shader declares', () => {
    const { renderer, light } = build();
    let uniforms: Record<string, THREE.IUniform> = {};
    vi.spyOn(renderer, 'render').mockImplementation((scene: THREE.Scene) => {
      ({ uniforms } = (scene.children[0] as THREE.Mesh).material as THREE.RawShaderMaterial);
    });
    light.update();
    const declared = [...LIGHT_FRAGMENT.matchAll(/^uniform \w+ (\w+);/gm)].map((match) => match[1]);

    expect(declared.length).toBeGreaterThan(8);
    for (const name of declared) {
      expect(uniforms[name]?.value, name).toBeDefined();
    }
  });

  it('frees its target, its material and its triangle', () => {
    const { renderer, light } = build();
    light.update();
    const target = vi.spyOn(renderer.lit()[0].into as THREE.WebGLRenderTarget, 'dispose');
    const material = vi.spyOn(THREE.Material.prototype, 'dispose');
    const geometry = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    light.dispose();

    expect(target).toHaveBeenCalledTimes(1);
    expect(material).toHaveBeenCalledTimes(1);
    expect(geometry).toHaveBeenCalledTimes(1);
    material.mockRestore();
    geometry.mockRestore();
  });
});
