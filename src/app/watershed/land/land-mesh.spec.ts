import * as THREE from 'three';
import { EROSION, IErosionConstants } from '../model/erosion-calibration';
import { raise } from '../model/reference';
import { HERO_SEED } from '../seed/seed';
import { createSimDriver, ISimDriver } from '../sim/sim-driver';
import { LAND_LOOK } from './land-calibration';
import { landGeometry } from './land-geometry';
import { createLandMesh, ILandMesh, LAND_MESH } from './land-mesh';
import { GREENING, LAND_FRAGMENT, LAND_VERTEX, SUN_DIRECTION } from './land-shaders';
import { createLightPass, ILightPass } from './light-pass';

const SIZE = 8;
const CONSTANTS: IErosionConstants = { ...EROSION, extent: SIZE * 16 };

/** enough of a renderer for the driver and the light pass to be built on and stepped */
const RENDERER = {
  getRenderTarget: (): null => null,
  setRenderTarget: (): void => undefined,
  render: (): void => undefined,
} as unknown as THREE.WebGLRenderer;

const build = (): { sim: ISimDriver; light: ILightPass; land: ILandMesh } => {
  const sim = createSimDriver(RENDERER, raise(HERO_SEED, SIZE, CONSTANTS), CONSTANTS);
  const light = createLightPass(RENDERER, sim, CONSTANTS);
  return { sim, light, land: createLandMesh(sim, light, CONSTANTS) };
};

describe('land mesh', () => {
  it('is the land’s geometry on the simulation’s grid, at the block’s size', () => {
    const { land } = build();
    const expected = landGeometry(SIZE, CONSTANTS.extent);
    const { geometry } = land.mesh;

    expect(geometry.getAttribute('position').array).toEqual(expected.positions);
    expect(geometry.getIndex()?.array).toEqual(expected.indices);
  });

  it('is never culled: its vertices carry a kind where a height would be', () => {
    expect(build().land.mesh.frustumCulled).toBe(false);
  });

  it('reads the simulation’s own textures, and the light worked out for them', () => {
    const { sim, light, land } = build();
    const { uniforms } = land.mesh.material;

    expect(uniforms['land'].value).toBe(sim.current('land'));
    expect(uniforms['terrain'].value).toBe(sim.terrain);
    expect(uniforms['strata'].value).toBe(sim.strata);
    expect(uniforms['light'].value).toBe(light.texture);
  });

  it('is shaded by the very vector the light was marched along', () => {
    const { light, land } = build();

    expect(land.mesh.material.uniforms[SUN_DIRECTION].value).toBe(light.sun);
  });

  it('follows the land to whichever copy the simulation says it is in', () => {
    const { sim, land } = build();
    const elsewhere = new THREE.Texture();
    vi.spyOn(sim, 'current').mockReturnValue(elsewhere);
    land.follow();

    expect(land.mesh.material.uniforms['land'].value).toBe(elsewhere);
  });

  it('grows nothing yet', () => {
    expect(build().land.mesh.material.uniforms[GREENING].value).toBe(0);
  });

  it('supplies every uniform its shaders declare, at the calibrated value', () => {
    const { land } = build();
    const { uniforms } = land.mesh.material;
    const declared = [...`${LAND_VERTEX}\n${LAND_FRAGMENT}`.matchAll(/^uniform \w+ (\w+);/gm)]
      .map((match) => match[1])
      // three.js supplies the camera's two
      .filter((name) => !['viewMatrix', 'projectionMatrix'].includes(name));

    expect(declared.length).toBeGreaterThan(30);
    for (const name of declared) {
      expect(uniforms[name]?.value, name).toBeDefined();
    }
    expect(uniforms['snowLine'].value).toBe(LAND_LOOK.snowLine);
    expect(uniforms['strataSpan'].value).toBe(CONSTANTS.strataSpan);
    expect((uniforms['screeColour'].value as THREE.Vector3).toArray()).toEqual([
      ...LAND_LOOK.screeColour,
    ]);
  });

  it('is a raw GLSL 3 material, named so the scene can be searched for it', () => {
    const { land } = build();

    expect(land.mesh.material).toBeInstanceOf(THREE.RawShaderMaterial);
    expect(land.mesh.material.glslVersion).toBe(THREE.GLSL3);
    expect(land.mesh.name).toBe(LAND_MESH);
  });

  it('frees its geometry and its material', () => {
    const { land } = build();
    const geometry = vi.spyOn(land.mesh.geometry, 'dispose');
    const material = vi.spyOn(land.mesh.material, 'dispose');
    land.dispose();

    expect(geometry).toHaveBeenCalledTimes(1);
    expect(material).toHaveBeenCalledTimes(1);
  });
});
