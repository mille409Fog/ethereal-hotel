/**
 * the water's two shaders: a second mesh on the land's own vertices, lifted to the water's level.
 *
 * ## nothing here decides where water is
 *
 * the vertex shader reads the depth of water in the simulation's `land` texture and the fragment shader throws
 * away every fragment where that depth is under `waterFrom`. there is no mask, no painted map and no noise in
 * that decision: a river is drawn where the model has water and stops being drawn when the model has let it
 * go. the one noise in this file tips the surface of water that is already there, and is scaled by how fast the
 * model says that water moves.
 *
 * ## the bed is shaded again, not read back
 *
 * water shows the ground under it, dimmed by the depth in between. the ground's colour can come from the picture
 * already drawn, read back as a texture, or from working it out a second time. it is worked out a second time:
 * the fragment shader begins with the land's own `GROUND_FRAGMENT` and calls `ground()`.
 *
 * - **it is exact.** the water stands on the land's vertices and triangles (`surfaceGeometry`), so what
 *   `ground()` is handed here is what it was handed when the land drew this pixel, and it returns the same
 *   colour. the water therefore fades in from *precisely* the land's colour, which is what lets it be an opaque
 *   mesh: nothing is blended, nothing is sorted, and where the depth buffer cannot tell shallow water from its
 *   bed the two candidates for the pixel are the same colour.
 * - **it was measured, and the measurement did not settle it.** on this box's graphics card, 512 grid, in the
 *   rain, the whole of the water's draw took 8 ms and a copy of the frame alone took 11 ms, each mostly the
 *   read-back that stops the clock: no difference to be had. on the software rasteriser the second `ground()`
 *   is about 10 ms of the water's 107 and the copy is 2 ms, so there the copy wins by 8 ms in a frame of
 *   some 300. what settled it is that a copy cannot be taken from a multisampled target, and the composer's
 *   samples are meant to become a property of the tier (`watershed.tokens.ts`); a copy also has to follow
 *   the canvas's size and the tier's resolution every time either moves.
 * - **what it gives up is refraction**: the bed is seen straight down, not bent. from the storm's vantage that is
 *   below a pixel.
 *
 * ## the sheet runs into the bank
 *
 * a vertex on a wet cell stands at the water's level. a vertex on a dry cell beside one stands at the lowest
 * level among its wet neighbours, or on its own ground if that is lower: so along a river the sheet runs out
 * level under the bank instead of climbing it, and the shoreline is where that level meets the land, between
 * the cells, not a staircase along their edges. the depth handed on is the sheet's height above the ground, so
 * it is below zero under a bank, and interpolated it crosses `waterFrom` where the sheet really is that deep.
 * a dry vertex is never lifted above its own ground, so no sheet ever hangs in the air below a wet cell.
 *
 * ## dry land costs nothing
 *
 * nearly all of this mesh is dry at any moment. a vertex with no water on itself or on any of the six vertices
 * it shares a triangle with is put outside the view, so a triangle of three such vertices is never rasterised.
 * without that the whole land was rasterised a second time to be thrown away one fragment at a time: on this
 * box's graphics card, on the 1,024 grid, the frame went from 16.6 ms to between 22 and 27 through the second
 * half of the storm, and with it the frame is 16.6 ms from the first step to the last. the six are the mesh's
 * own adjacency, so `land-geometry.ts`'s choice of diagonal is repeated in the vertex shader; the verifying
 * script draws the same pixels with the test taken out, and fewer with the other diagonal.
 *
 * ## ripples are carried by the flow, in two patterns
 *
 * a pattern dragged along a velocity field shears until it is streaks. so there are two, half a period apart,
 * each carried for one period and then put back, and each is faded to nothing at the moment it is put back.
 * their amplitude is the water's speed over `rippleSpeed`: a lake is still, so it is glass, and that is the
 * simulation's doing and not a mask.
 *
 * ## two stand-ins
 *
 * the sky the water reflects is the land's two flat lights, `skyColour` above the horizon and `groundColour`
 * below it, dimmed by how much sky the cell can see. the phase that makes the air replaces `reflected()` with
 * the one sky function. and the reflection is of the sky alone: a lake does not show the mountain behind it.
 *
 * the names the ground's chunks declare are used freely below: `column()` and its globals in the vertex shader,
 * `ground()`, `glintOf`, `lumps`, `seen`, the three lights, `sunDirection`, `light` and `cameraPosition` in the
 * fragment's. a leaf cannot import the constants those names are kept in, so they are written out here, and the
 * verifying script's compile is what catches one that has been renamed.
 *
 * this lives inside template literals, so a backtick in a comment ends the string, and GLSL ES 3.00 reserves a
 * long list of ordinary words: the obvious name for a level surface's normal is one of them.
 *
 * a leaf module, which is why the ground's chunks arrive as arguments: see `model/fields.ts`.
 */
import type { Colour } from '../land/land-calibration';
import type { IWaterLook } from './water-calibration';

type LookKeys<T> = {
  [K in keyof IWaterLook]: IWaterLook[K] extends T ? K : never;
}[keyof IWaterLook];

/** how far through its period the ripples' pattern is, in [0, 1): `ripplePhase` */
export const RIPPLE = 'ripple';

/** what the water's shaders read beyond what the ground's chunks already declare: floats and colours */
export const WATER_FLOATS: ReadonlyArray<LookKeys<number>> = [
  'waterFrom',
  'waterFull',
  'turbidFull',
  'turbidExtinction',
  'rippleGrain',
  'ripplePeriod',
  'rippleStrength',
  'rippleSpeed',
  'foamSpeedFrom',
  'foamSpeedTo',
  'foamSlopeFrom',
  'foamSlopeTo',
  'reflectance',
  'sunGloss',
];
export const WATER_COLOURS: ReadonlyArray<LookKeys<Colour>> = [
  'absorption',
  'deepColour',
  'turbidColour',
  'foamColour',
];

const VARYINGS = (direction: 'in' | 'out'): string => /* glsl */ `
// the water's level, its height above the ground under it (below zero under a bank), and what it carries.
// taken inside the triangle always: on a multisampled target a pixel whose centre a triangle misses is
// otherwise given values carried on past the triangle's edge, and a bank falling fifty metres to a cell
// carries a depth of zero on to several metres of water that is not there
centroid ${direction} vec3 vWater;
// the water's velocity, metres a second, along x and z
${direction} vec2 vFlow;
// the normal of the water's own surface, from the levels of the four cells round the vertex
${direction} vec3 vSurface;
`;

/** `groundVertex` is `GROUND_VERTEX` from `land/land-shaders.ts` */
export function waterVertex(groundVertex: string): string {
  return /* glsl */ `${groundVertex}
// flow: velocity x, velocity y
uniform sampler2D flow;
uniform float waterFrom;
${VARYINGS('out')}

void main() {
  column();

  // a vertex shares a triangle with six others: the four beside it and the two on the mesh's diagonal.
  // where none of the seven has water every one of those triangles would be thrown away a fragment at a
  // time, so the vertex is put outside the view, and a triangle of three such vertices is never rasterised
  ivec2 last = textureSize(land, 0) - 1;
  float beside = max(max(waterRound.x, waterRound.y), max(waterRound.z, waterRound.w));
  float diagonal = max(
    texelFetch(land, clamp(cellHere + ivec2(1, -1), ivec2(0), last), 0).b,
    texelFetch(land, clamp(cellHere + ivec2(-1, 1), ivec2(0), last), 0).b
  );
  if (max(stateHere.b, max(beside, diagonal)) <= waterFrom) {
    // dry, so a triangle this vertex shares with one that is kept still throws every fragment away
    vWorld = vec3(0.0);
    vSkirt = 0.0;
    vWater = vec3(0.0);
    vFlow = vec2(0.0);
    vSurface = vec3(0.0, 1.0, 0.0);
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }

  float level = surfaceHere + stateHere.b;
  if (stateHere.b <= waterFrom) {
    // a dry cell: on its own ground, or level with the lowest water beside it and so under the bank
    level = surfaceHere;
    for (int k = 0; k < 4; k++) {
      if (waterRound[k] > waterFrom) {
        level = min(level, surfaceRound[k] + waterRound[k]);
      }
    }
  }
  // the surface tilts toward wet neighbours only; a dry one is taken to be level with this vertex
  vec4 levels;
  for (int k = 0; k < 4; k++) {
    levels[k] = waterRound[k] > waterFrom ? surfaceRound[k] + waterRound[k] : level;
  }
  vSurface = normalize(vec3(
    -(levels.y - levels.x) / spanRound.x,
    1.0,
    -(levels.w - levels.z) / spanRound.y
  ));

  // the ground's own varyings describe the bed, so vWorld is on the ground and not on the water
  vWorld = vec3(position.x, surfaceHere, position.z);
  vSkirt = 0.0;
  vWater = vec3(level, level - surfaceHere, stateHere.a);
  vFlow = texelFetch(flow, cellHere, 0).xy;
  gl_Position = projectionMatrix * viewMatrix * vec4(position.x, level, position.z, 1.0);
}`;
}

/** `groundFragment` is `GROUND_FRAGMENT` from `land/land-shaders.ts` */
export function waterFragment(groundFragment: string): string {
  return /* glsl */ `${groundFragment}
uniform float ${RIPPLE};
${declare('float', WATER_FLOATS)}
${declare('vec3', WATER_COLOURS)}
${VARYINGS('in')}

out vec4 result;

// the tilt of a pattern of ripples that has been carried along the flow for this share of its period
vec2 rippleAt(float carried, vec2 shift) {
  return lumps((vWorld.xz - vFlow * (carried - 0.5) * ripplePeriod) / rippleGrain + shift);
}

// the sky along a ray off the water. a stand-in: the land's two flat lights, until there is a sky function
vec3 reflected(vec3 ray) {
  return mix(groundColour, skyColour, smoothstep(-0.1, 0.1, ray.y));
}

void main() {
  float depth = vWater.y;
  if (depth <= waterFrom) {
    discard;
  }
  float present = smoothstep(waterFrom, waterFull, depth);
  vec3 bed = ground();
  vec2 lit = texture(light, vUv).rg;

  // the surface: the water's own slope, tipped by two patterns of ripples as far as the water is moving
  vec3 level = normalize(vSurface);
  float speed = length(vFlow);
  float footprint = max(length(fwidth(vWorld.xz)), 1e-3);
  float other = fract(${RIPPLE} + 0.5);
  vec2 tilt = mix(
    rippleAt(other, vec2(17.3, 5.1)),
    rippleAt(${RIPPLE}, vec2(0.0)),
    1.0 - abs(2.0 * ${RIPPLE} - 1.0)
  );
  float rough = rippleStrength * clamp(speed / rippleSpeed, 0.0, 1.0) * seen(rippleGrain, footprint);
  vec3 normal = normalize(level - rough * vec3(tilt.x, 0.0, tilt.y));

  // through the water: the bed, dimmed by the depth, and the light the water itself sends back
  float turbid = clamp(vWater.z / turbidFull, 0.0, 1.0);
  vec3 passed = exp(-mix(absorption, vec3(turbidExtinction), turbid) * depth);
  vec3 daylight = sunColour * max(sunDirection.y, 0.0) * lit.x + skyColour * lit.y;
  vec3 within = mix(mix(deepColour, turbidColour, turbid) * daylight, bed, passed);

  // off the water: the sky, more of it the shallower the look, and the sun
  vec3 toEye = normalize(cameraPosition - vec3(vWorld.x, vWater.x, vWorld.z));
  float mirror = reflectance + (1.0 - reflectance) * pow(1.0 - max(dot(normal, toEye), 0.0), 5.0);
  vec3 sky = reflected(reflect(-toEye, normal)) * lit.y;
  vec3 sun = sunColour * glintOf(normal, toEye, sunGloss) * lit.x;
  vec3 water = mix(within, sky, mirror) + sun * mirror;

  // whitewater, where the model's water is both fast and falling
  float foam =
    smoothstep(foamSpeedFrom, foamSpeedTo, speed) *
    smoothstep(foamSlopeFrom, foamSlopeTo, 1.0 - level.y);
  vec3 lather = foamColour * (sunColour * max(dot(normal, sunDirection), 0.0) * lit.x + skyColour * lit.y);
  water = mix(water, lather, foam);

  result = vec4(mix(bed, water, present), 1.0);
}`;
}

function declare(kind: string, names: readonly string[]): string {
  return names.map((name) => `uniform ${kind} ${name};`).join('\n');
}
