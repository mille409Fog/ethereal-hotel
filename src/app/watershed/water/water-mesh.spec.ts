import * as THREE from 'three';
import { surfaceGeometry } from '../land/land-geometry';
import { createLandMesh, ILandMesh } from '../land/land-mesh';
import {
  CAMERA_UNIFORMS,
  GROUND_FRAGMENT,
  GROUND_VERTEX,
  RAIN,
  SUN_DIRECTION,
} from '../land/land-shaders';
import { createLightPass } from '../land/light-pass';
import { EROSION, IErosionConstants } from '../model/erosion-calibration';
import { raise } from '../model/reference';
import { HERO_SEED } from '../seed/seed';
import { createSimDriver, ISimDriver } from '../sim/sim-driver';
import { WATER_LOOK } from './water-calibration';
import { createWaterMesh, IWaterMesh, WATER_MESH } from './water-mesh';
import { RIPPLE, waterFragment, waterVertex } from './water-shaders';

const SIZE = 8;
const CONSTANTS: IErosionConstants = { ...EROSION, extent: SIZE * 16 };

const RENDERER = {
  getRenderTarget: (): null => null,
  setRenderTarget: (): void => undefined,
  render: (): void => undefined,
} as unknown as THREE.WebGLRenderer;

const build = (): { sim: ISimDriver; land: ILandMesh; water: IWaterMesh } => {
  const sim = createSimDriver(RENDERER, raise(HERO_SEED, SIZE, CONSTANTS), CONSTANTS);
  const land = createLandMesh(sim, createLightPass(RENDERER, sim, CONSTANTS), CONSTANTS);
  return { sim, land, water: createWaterMesh(sim, land, CONSTANTS) };
};

const VERTEX = waterVertex(GROUND_VERTEX);
const FRAGMENT = waterFragment(GROUND_FRAGMENT);

describe('water mesh', () => {
  it('stands on the land’s own ground: the same vertices and triangles, and no walls', () => {
    const { water } = build();
    const expected = surfaceGeometry(SIZE, CONSTANTS.extent);
    const { geometry } = water.mesh;

    expect(geometry.getAttribute('position').array).toEqual(expected.positions);
    expect(geometry.getIndex()?.array).toEqual(expected.indices);
  });

  it('shades the bed with the land’s own uniforms, the same objects and not copies', () => {
    const { land, water } = build();
    const mine = water.mesh.material.uniforms;

    for (const [name, uniform] of Object.entries(land.mesh.material.uniforms)) {
      expect(mine[name], name).toBe(uniform);
    }
  });

  it('so it follows the land and the rain when the land’s mesh is told of them', () => {
    const { sim, land, water } = build();
    const elsewhere = new THREE.Texture();
    vi.spyOn(sim, 'current').mockReturnValue(elsewhere);
    land.follow(0.5);

    expect(water.mesh.material.uniforms['land'].value).toBe(elsewhere);
    expect(water.mesh.material.uniforms[RAIN].value).toBe(0.5);
  });

  it('reads the flow from whichever copy the simulation says it is in', () => {
    const { sim, water } = build();

    expect(water.mesh.material.uniforms['flow'].value).toBe(sim.current('flow'));

    const elsewhere = new THREE.Texture();
    const current = vi.spyOn(sim, 'current').mockReturnValue(elsewhere);
    water.follow(0);

    expect(current).toHaveBeenCalledWith('flow');
    expect(water.mesh.material.uniforms['flow'].value).toBe(elsewhere);
  });

  it('carries its ripples by the time it is told, and by nothing else', () => {
    const { water } = build();
    water.follow(WATER_LOOK.ripplePeriod * 10.25);

    expect(water.mesh.material.uniforms[RIPPLE].value).toBeCloseTo(0.25, 9);
  });

  it('is drawn after the land, a little nearer than it is, and is never culled', () => {
    const { water } = build();
    const { material } = water.mesh;

    expect(water.mesh.renderOrder).toBeGreaterThan(0);
    expect(water.mesh.frustumCulled).toBe(false);
    expect(material.polygonOffset).toBe(true);
    expect(material.polygonOffsetFactor).toBe(WATER_LOOK.offsetFactor);
    expect(material.polygonOffsetUnits).toBe(WATER_LOOK.offsetUnits);
  });

  it('is opaque: the shader fades it in from the land’s own colour, so nothing is blended', () => {
    const { material } = build().water.mesh;

    expect(material.transparent).toBe(false);
    expect(material.depthWrite).toBe(true);
  });

  it('supplies every uniform its shaders declare, at the calibrated value', () => {
    const { water } = build();
    const { uniforms } = water.mesh.material;
    const declared = [...`${VERTEX}\n${FRAGMENT}`.matchAll(/^uniform \w+ (\w+);/gm)]
      .map((match) => match[1])
      .filter((name) => !CAMERA_UNIFORMS.includes(name));

    expect(declared.length).toBeGreaterThan(50);
    for (const name of declared) {
      expect(uniforms[name]?.value, name).toBeDefined();
    }
    expect(uniforms['waterFrom'].value).toBe(WATER_LOOK.waterFrom);
    expect((uniforms['absorption'].value as THREE.Vector3).toArray()).toEqual([
      ...WATER_LOOK.absorption,
    ]);
  });

  it('decides where water is by the depth in the land texture, and throws the rest away', () => {
    expect(VERTEX).toContain('uniform sampler2D land;');
    expect(FRAGMENT).toMatch(/if \(depth <= waterFrom\) \{\s*discard;/);
  });

  it('lights the water by the sun the land is lit by', () => {
    const { land, water } = build();

    expect(water.mesh.material.uniforms[SUN_DIRECTION].value).toBe(
      land.mesh.material.uniforms[SUN_DIRECTION].value
    );
  });

  it('is a raw GLSL 3 material, named so the scene can be searched for it', () => {
    const { water } = build();

    expect(water.mesh.material).toBeInstanceOf(THREE.RawShaderMaterial);
    expect(water.mesh.material.glslVersion).toBe(THREE.GLSL3);
    expect(water.mesh.name).toBe(WATER_MESH);
  });

  it('frees its geometry and its material', () => {
    const { water } = build();
    const geometry = vi.spyOn(water.mesh.geometry, 'dispose');
    const material = vi.spyOn(water.mesh.material, 'dispose');
    water.dispose();

    expect(geometry).toHaveBeenCalledTimes(1);
    expect(material).toHaveBeenCalledTimes(1);
  });
});
