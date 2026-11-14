/**
 * the air as something in the scene: the dome behind the block, the deck of cloud it stands in, the rain's
 * pass, and the uniforms every material with the air in it reads.
 *
 * - **one set of uniforms.** `uniforms` holds the air's numbers, the weather and the clock, and the land's
 *   material takes them as the same objects, not copies, as the water then takes the land's. so a weather set
 *   here is the weather the dome, the deck, the land, the water and the fog are all drawn under.
 * - **one sun.** `sun` is the vector the dome and the deck are lit by. the storm hands this same vector to its
 *   light pass, which the land and the water are shaded by, so moving it with the light pass's `sunTo` moves
 *   the sun in the sky and on the ground at once, and marks the shadows to be worked out again.
 * - **the dome is drawn last and costs only what is left.** it is one triangle over the screen at the far
 *   plane, depth-tested and writing no depth, so every pixel the land, the water or the deck has covered fails
 *   the test before its shader runs.
 * - **the deck reaches far past the block** and is faded into the sky before its edge (`air-shaders.ts`); the
 *   walls go down into it.
 *
 * the stage owns the air from the start, so the sky is there while the meter measures and before any land is.
 */
import * as THREE from 'three';
import { LAND_LOOK, sunDirection } from '../land/land-calibration';
import { SUN_DIRECTION } from '../land/land-shaders';
import { SIM_TRIANGLE } from '../sim/sim-shaders';
import { AIR_LOOK, IAirLook } from './air-calibration';
import {
  AIR_CLOCK,
  AIR_COLOURS,
  AIR_FLOATS,
  DECK_FRAGMENT,
  DECK_VERTEX,
  DOME_FRAGMENT,
  DOME_VERTEX,
  WEATHER,
} from './air-shaders';
import { RainPass } from './rain-pass';

export const DOME_MESH = 'WatershedDome';
export const DECK_MESH = 'WatershedDeck';

export interface IAir {
  /** the air's uniforms, to be spread into any material whose shader has `AIR_FRAGMENT` in it */
  readonly uniforms: Readonly<Record<string, THREE.IUniform>>;
  /** toward the sun: hand it to the light pass, which owns moving it */
  readonly sun: THREE.Vector3;
  readonly dome: THREE.Mesh<THREE.BufferGeometry, THREE.RawShaderMaterial>;
  readonly deck: THREE.Mesh<THREE.BufferGeometry, THREE.RawShaderMaterial>;
  /** the rain's pass, for the composer, which frees it */
  readonly rain: RainPass;
  /** how clear the sky is and how hard it rains, each in [0, 1], and the time on the air's clock, seconds */
  follow(weather: number, rain: number, seconds: number): void;
  dispose(): void;
}

export function createAir(look: IAirLook = AIR_LOOK): IAir {
  const uniforms: Record<string, THREE.IUniform> = {
    // overcast until a storm says otherwise
    [WEATHER]: { value: 0 },
    [AIR_CLOCK]: { value: 0 },
  };
  for (const key of AIR_FLOATS) {
    uniforms[key] = { value: look[key] };
  }
  for (const key of AIR_COLOURS) {
    uniforms[key] = { value: new THREE.Vector3(...look[key]) };
  }
  const sun = new THREE.Vector3(...sunDirection(LAND_LOOK));
  const lit = { ...uniforms, [SUN_DIRECTION]: { value: sun } };

  const domeGeometry = new THREE.BufferGeometry();
  domeGeometry.setAttribute('position', new THREE.Float32BufferAttribute([...SIM_TRIANGLE], 3));
  const dome = new THREE.Mesh(
    domeGeometry,
    new THREE.RawShaderMaterial({
      name: DOME_MESH,
      glslVersion: THREE.GLSL3,
      vertexShader: DOME_VERTEX,
      fragmentShader: DOME_FRAGMENT,
      uniforms: lit,
      depthWrite: false,
    })
  );
  dome.name = DOME_MESH;
  dome.frustumCulled = false;
  // after the land (0), the water (1) and the deck (1): it is drawn only where none of them is
  dome.renderOrder = 2;

  const reach = look.deckReach;
  const deckGeometry = new THREE.BufferGeometry();
  // prettier-ignore
  deckGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -reach, 0, -reach,
    reach, 0, -reach,
    reach, 0, reach,
    -reach, 0, reach,
  ], 3));
  // anticlockwise seen from above
  deckGeometry.setIndex([0, 3, 2, 0, 2, 1]);
  const deck = new THREE.Mesh(
    deckGeometry,
    new THREE.RawShaderMaterial({
      name: DECK_MESH,
      glslVersion: THREE.GLSL3,
      vertexShader: DECK_VERTEX,
      fragmentShader: DECK_FRAGMENT,
      uniforms: lit,
    })
  );
  deck.name = DECK_MESH;
  // its vertices carry no height, so the box three.js would cull against is not where it is drawn
  deck.frustumCulled = false;
  deck.renderOrder = 1;

  const rain = new RainPass(look);

  return {
    uniforms,
    sun,
    dome,
    deck,
    rain,
    follow(weather: number, raining: number, seconds: number): void {
      uniforms[WEATHER].value = weather;
      uniforms[AIR_CLOCK].value = seconds;
      rain.follow(raining, seconds);
    },
    dispose(): void {
      dome.geometry.dispose();
      dome.material.dispose();
      deck.geometry.dispose();
      deck.material.dispose();
    },
  };
}
