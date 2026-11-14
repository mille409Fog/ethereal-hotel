import * as THREE from 'three';
import { LAND_LOOK, sunDirection } from '../land/land-calibration';
import {
  CAMERA_UNIFORMS,
  GROUND_VERTEX,
  groundFragment,
  LAND_VERTEX,
  landFragment,
  SUN_DIRECTION,
} from '../land/land-shaders';
import { waterFragment, waterVertex } from '../water/water-shaders';
import { AIR_LOOK } from './air-calibration';
import { createAir, DECK_MESH, DOME_MESH } from './air';
import {
  AIR_CLOCK,
  AIR_FRAGMENT,
  DECK_FRAGMENT,
  DECK_VERTEX,
  DOME_FRAGMENT,
  DOME_VERTEX,
  SKY_RADIANCE,
  WEATHER,
} from './air-shaders';
import { RainPass } from './rain-pass';

const declaredIn = (...sources: string[]): string[] =>
  [...sources.join('\n').matchAll(/^uniform \w+ (\w+);/gm)]
    .map((match) => match[1])
    // three.js supplies the camera's three
    .filter((name) => !CAMERA_UNIFORMS.includes(name));

/** every fragment shader the route draws with, as the meshes build them */
const DRAWN = {
  dome: DOME_FRAGMENT,
  deck: DECK_FRAGMENT,
  land: landFragment(AIR_FRAGMENT),
  water: waterFragment(groundFragment(AIR_FRAGMENT)),
};

describe('the air', () => {
  describe('one sky', () => {
    // the Definition of Done: the dome, the water's reflection and the fog are one function
    it('is the same source in every shader that draws: the dome, the deck, the land and the water', () => {
      for (const [name, source] of Object.entries(DRAWN)) {
        expect(source.includes(SKY_RADIANCE), name).toBe(true);
        expect(source.split(SKY_RADIANCE), name).toHaveLength(2);
      }
    });

    it('is what the dome draws, what the water reflects, and what the fog scatters', () => {
      expect(DOME_FRAGMENT).toMatch(/result = vec4\(skyRadiance\(vRay,/);
      expect(DRAWN.water).toMatch(/skyRadiance\(reflect\(-toEye, normal\)/);
      expect(AIR_FRAGMENT).toMatch(/\* skyGlow\(point - eye, sun, weather\)/);
    });

    it('fogs the land, the water and the deck through the same air', () => {
      for (const name of ['land', 'water', 'deck'] as const) {
        expect(DRAWN[name], name).toMatch(/fogged\(/);
      }
    });

    it('is not the land’s three flat lights any more', () => {
      for (const source of [DRAWN.land, DRAWN.water]) {
        expect(source).not.toMatch(/\b(skyColour|groundColour)\b/);
        expect(source).not.toMatch(/vec3 reflected\(/);
      }
    });
  });

  describe('in the scene', () => {
    it('draws the dome last, at the far plane, writing no depth, so only what is left is sky', () => {
      const { dome } = createAir();

      expect(dome.name).toBe(DOME_MESH);
      expect(dome.renderOrder).toBeGreaterThan(1);
      expect(dome.material.depthWrite).toBe(false);
      expect(dome.material.depthTest).toBe(true);
      expect(dome.frustumCulled).toBe(false);
    });

    it('lays the deck flat, as far out as it is calibrated to reach', () => {
      const { deck } = createAir();
      deck.geometry.computeBoundingBox();
      const size = deck.geometry.boundingBox?.getSize(new THREE.Vector3());

      expect(deck.name).toBe(DECK_MESH);
      expect(size?.x).toBe(2 * AIR_LOOK.deckReach);
      expect(size?.z).toBe(2 * AIR_LOOK.deckReach);
      expect(size?.y).toBe(0);
      expect(deck.frustumCulled).toBe(false);
    });

    it('supplies every uniform the dome and the deck declare', () => {
      const { dome, deck } = createAir();

      for (const [mesh, vertex, fragment] of [
        [dome, DOME_VERTEX, DOME_FRAGMENT],
        [deck, DECK_VERTEX, DECK_FRAGMENT],
      ] as const) {
        const declared = declaredIn(vertex, fragment);
        expect(declared.length).toBeGreaterThan(30);
        for (const name of declared) {
          expect(mesh.material.uniforms[name]?.value, name).toBeDefined();
        }
      }
    });

    it('offers the uniforms the land’s shaders take from it, and nothing of the land’s own', () => {
      const { uniforms } = createAir();
      const airs = declaredIn(AIR_FRAGMENT);

      expect(Object.keys(uniforms).sort()).toEqual([...airs].sort());
      expect(declaredIn(LAND_VERTEX, DRAWN.land)).toEqual(expect.arrayContaining(airs));
      expect(declaredIn(waterVertex(GROUND_VERTEX), DRAWN.water)).toEqual(
        expect.arrayContaining(airs)
      );
    });

    it('lights the dome and the deck by one sun, where the land’s calibration puts it', () => {
      const { sun, dome, deck } = createAir();

      expect(sun.toArray()).toEqual(sunDirection(LAND_LOOK));
      expect(dome.material.uniforms[SUN_DIRECTION].value).toBe(sun);
      expect(deck.material.uniforms[SUN_DIRECTION].value).toBe(sun);
    });

    it('shares one weather and one clock among everything drawn under it', () => {
      const air = createAir();
      air.follow(0.4, 0, 12);

      for (const mesh of [air.dome, air.deck]) {
        expect(mesh.material.uniforms[WEATHER]).toBe(air.uniforms[WEATHER]);
      }
      expect(air.uniforms[WEATHER].value).toBe(0.4);
      expect(air.uniforms[AIR_CLOCK].value).toBe(12);
    });

    it('is overcast and dry until it is told otherwise', () => {
      const air = createAir();

      expect(air.uniforms[WEATHER].value).toBe(0);
      expect(air.rain.enabled).toBe(false);
    });

    it('frees its two meshes', () => {
      const air = createAir();
      const freed = [air.dome, air.deck].flatMap((mesh) => [
        vi.spyOn(mesh.geometry, 'dispose'),
        vi.spyOn(mesh.material, 'dispose'),
      ]);
      air.dispose();

      for (const spy of freed) {
        expect(spy).toHaveBeenCalledTimes(1);
      }
    });
  });

  describe('the rain', () => {
    it('runs only while it is raining, and is as heavy as it is told', () => {
      const air = createAir();
      air.follow(0, 0.7, 3);

      expect(air.rain.enabled).toBe(true);
      expect(air.rain.uniforms['rain'].value).toBe(0.7);
      expect(air.rain.uniforms[AIR_CLOCK].value).toBe(3);

      air.follow(1, 0, 4);

      expect(air.rain.enabled).toBe(false);
    });

    it('is a pass of its own, with every uniform its streaks declare', () => {
      const pass = new RainPass();
      const material = pass.material as THREE.ShaderMaterial;
      const declared = [...material.fragmentShader.matchAll(/^uniform \w+ (\w+);/gm)].map(
        (match) => match[1]
      );

      expect(declared).toContain('rainDensity');
      for (const name of declared) {
        expect(pass.uniforms[name], name).toBeDefined();
      }
      expect(pass.uniforms['rainLayers'].value).toBe(AIR_LOOK.rainLayers);
    });
  });
});
