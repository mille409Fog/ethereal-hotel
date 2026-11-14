/**
 * the air: one sky, the light it lets through, the haze and mist and cloud between the eye and the land, and
 * the rain in front of all of it.
 *
 * ## one sky, used everywhere a sky is seen
 *
 * `SKY_RADIANCE` is the sky as GLSL: `skyRadiance(direction, sun, weather)`, overcast grey-blue at `weather = 0`
 * and at 1 a clear gradient, warm along the horizon toward a low sun, with a glow round the sun and its disc. it
 * is called by the dome behind the block, by the water for what it reflects, and by the fog for the colour of
 * the light it scatters toward the eye, and the ground is lit by it. three skies tuned apart drift apart in a
 * week, so there is one, and `air.spec.ts` asserts its source appears in every shader that draws.
 *
 * it is a string interpolated into each shader, inside `AIR_FRAGMENT`, which carries everything else the air
 * needs. every function there takes the sun and the weather as arguments rather than reading uniforms of its
 * host's, so the chunk can go into a shader that names its own sun however it likes, and it declares only the
 * uniforms that are its own. the ground's chunk (`land/land-shaders.ts`) is built round it, so the land and the
 * water, which is built on the ground's chunk, have it once each and cannot have it twice.
 *
 * below the horizon the sky is the horizon. the deck covers everything below it near the block, and what is
 * left is a direction the fog has already turned to the horizon's colour, so the two meet without a seam.
 *
 * ## the sun's light comes through the air
 *
 * the sun's light is `sunColour` thinned by the air it has crossed, which is `1 / sin(elevation)` thicknesses,
 * more of the blue than of the red: so a low sun is a gold one and nothing has to tint it. under overcast there
 * is none, and the sky is the only light, which is what makes a storm flat. the light the sky sends onto ground
 * facing some way is the sky halfway between that way and straight up, for the share of the sky that ground
 * faces, and light come back off the ground for the rest. that is cruder than integrating the sky and it is
 * one fetch-free function; the look phase may want better.
 *
 * ## the fog is integrated, not stepped
 *
 * three things lie between the eye and a point, and each has a density whose integral along a straight ray has
 * a closed form, so `fogged` costs a few exponentials and no loop.
 *
 * - **haze** thins exponentially with height and is heavier in a storm.
 * - **mist** is full on humid ground and thins to nothing `mistCeiling` above it, so it lies in the valleys
 *   the water cut and follows the rivers. it is taken to lie as it does at the point being drawn: the humidity
 *   is that point's, from the light pass. the ray's last stretch, which is all of it that is in the mist, is
 *   over ground close by, so that is nearly right and needs no march.
 * - **the deck** is cloud full below `deckHeight` and thinning to none over `deckSoft` above it. so the block's
 *   walls do not stop at a line on the deck's surface; they go down into it and are gone before they reach it.
 *
 * each scatters light toward the eye. haze and mist scatter the sky in the ray's direction, which is what makes
 * a view toward a low sun golden and a view away from it blue; the deck scatters its own light. the light of
 * all three is weighed by how much of the thickness each is.
 *
 * ## the clouds overhead cast shadows
 *
 * a pattern of clouds is carried on the wind at `cloudHeight`, and a point is under one if the line from it to
 * the sun passes through one. that dims the sun's light and nothing else: the sky's light comes from the whole
 * sky. the shadows fade as the weather closes, because under overcast there is no direct light to shadow.
 *
 * ## the rain is in front of everything
 *
 * `RAIN_STREAKS` is slanted streaks falling across the screen, and their density is the rain's strength and
 * nothing else. there is no lightning: it would be the one effect here that shows no state. it is a function
 * of a pixel so that the route's post pass (`rain-pass.ts`) and the verifying script can each wrap it.
 *
 * ## what it costs
 *
 * on this box's graphics card nothing that shows: the route held 16.7 ms a frame, the display's 60, through a
 * whole storm on the 1,024 grid with all of it running (2026-11-14). on the software rasteriser it is the
 * dearest thing yet added. timed alone at 512 in the rain, back to back with the commit before it, the land's
 * draw went from 146 ms to 292 and the water's from 128 to 275, and the deck adds 151, the dome 31 and the rain
 * 33; the route's storm frame there went from about 690 ms to 840. the branches on the weather and on each fog
 * layer are exact and skip the work on a card; the software rasteriser runs both sides and was measured not to
 * notice, so what would cut it there is less arithmetic, which is the look phase's to trade.
 *
 * colour leaves here linear and unbounded. GLSL lives in template literals, so a backtick in a comment ends the
 * string, and GLSL ES 3.00 reserves a long list of ordinary words: the obvious name for a filter is one of them.
 *
 * a leaf module: see `model/fields.ts`.
 */
import type { Colour } from '../land/land-calibration';
import type { IAirLook } from './air-calibration';

type LookKeys<T> = { [K in keyof IAirLook]: IAirLook[K] extends T ? K : never }[keyof IAirLook];

/** how clear the sky is, in [0, 1]: overcast at 0, clear at 1. the storm sets it */
export const WEATHER = 'weather';

/** seconds on a clock that only runs forward: the wind and the rain are carried by it */
export const AIR_CLOCK = 'airClock';

/** what `AIR_FRAGMENT` reads: floats and colours */
export const AIR_FLOATS: ReadonlyArray<LookKeys<number>> = [
  'sunDiscRadius',
  'sunDiscGain',
  'clearFalloff',
  'warmthFalloff',
  'warmthElevation',
  'glowTightness',
  'duskSky',
  'duskElevation',
  'groundBounce',
  'hazeStorm',
  'hazeClear',
  'fogBase',
  'fogFalloff',
  'mistDensity',
  'mistCeiling',
  'deckHeight',
  'deckSoft',
  'deckDensity',
  'deckGrain',
  'deckRelief',
  'deckReach',
  'windX',
  'windZ',
  'cloudHeight',
  'cloudGrain',
  'cloudCover',
  'cloudSoftness',
  'cloudShadow',
];
export const AIR_COLOURS: ReadonlyArray<LookKeys<Colour>> = [
  'sunColour',
  'sunExtinction',
  'overcastZenith',
  'clearZenith',
  'clearHorizon',
  'horizonWarmth',
  'sunGlow',
  'deckColour',
];

/** what `RAIN_STREAKS` reads: floats, whole numbers and colours */
export const RAIN_FLOATS: ReadonlyArray<LookKeys<number>> = [
  'rainSlant',
  'rainColumn',
  'rainWidth',
  'rainLength',
  'rainSpeed',
  'rainDensity',
  'rainOpacity',
  'rainLayerScale',
];
export const RAIN_COUNTS: ReadonlyArray<LookKeys<number>> = ['rainLayers'];
export const RAIN_COLOURS: ReadonlyArray<LookKeys<Colour>> = ['rainColour'];

const declare = (kind: string, names: readonly string[]): string =>
  names.map((name) => `uniform ${kind} ${name};`).join('\n');

const PRECISION = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2D;
`;

/**
 * the sky, and the sun's light it is built from. every shader that draws has this source in it, to the
 * character, by way of `AIR_FRAGMENT`
 */
export const SKY_RADIANCE = /* glsl */ `
// the light of the sun on a white surface facing it: what is left of it after the air it has crossed, which is
// more the lower the sun stands and takes more of the blue. none under overcast
vec3 sunLight(vec3 sun, float weather) {
  if (weather <= 0.0) {
    return vec3(0.0);
  }
  float thickness = 1.0 / max(sun.y, 0.02);
  return sunColour * exp(-sunExtinction * thickness) * weather;
}

// the sky in a direction, without the sun's disc: what the haze and the mist scatter. below the horizon it is
// the horizon
vec3 skyGlow(vec3 direction, vec3 sun, float weather) {
  vec3 d = normalize(vec3(direction.x, max(direction.y, 0.0), direction.z) + vec3(0.0, 1e-4, 0.0));
  float up = d.y;
  // overcast: the same all round, and three times as bright overhead as at the horizon
  vec3 overcast = overcastZenith * (1.0 + 2.0 * up) / 3.0;
  // the weather is the same for every pixel, so on a graphics card this costs nothing to ask, and a storm is
  // all overcast: the clear sky is three powers a call, and this function is called three times a pixel
  if (weather <= 0.0) {
    return overcast;
  }
  // clear: horizon to zenith, warm along the horizon toward a low sun, and a glow round the sun
  float toward = 0.5 + 0.5 * dot(d, sun);
  float low = 1.0 - smoothstep(0.0, warmthElevation, sun.y);
  vec3 clear =
    mix(clearHorizon, clearZenith, pow(up, clearFalloff)) +
    horizonWarmth * low * pow(1.0 - up, warmthFalloff) * toward * toward +
    sunGlow * pow(max(dot(d, sun), 0.0), glowTightness);
  clear *= mix(duskSky, 1.0, smoothstep(0.0, duskElevation, sun.y));
  return mix(overcast, clear, weather);
}

// the sky in a direction, and the sun's disc in it
vec3 skyRadiance(vec3 direction, vec3 sun, float weather) {
  vec3 d = normalize(direction);
  float disc = smoothstep(cos(sunDiscRadius * 1.2), cos(sunDiscRadius), dot(d, sun));
  return skyGlow(d, sun, weather) + sunLight(sun, weather) * sunDiscGain * disc;
}
`;

/**
 * everything a shader needs to light something under this sky and to see it through this air. it declares the
 * air's own uniforms and no precision: the shader it opens says that first
 */
export const AIR_FRAGMENT = /* glsl */ `
uniform float ${WEATHER};
uniform float ${AIR_CLOCK};
${declare('float', AIR_FLOATS)}
${declare('vec3', AIR_COLOURS)}

float airHash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

// smooth noise one lump to the unit: its value in [0, 1], then its slope in x and z
vec3 airNoise(vec2 at) {
  vec2 corner = floor(at);
  vec2 f = fract(at);
  vec2 ease = f * f * (3.0 - 2.0 * f);
  vec2 easeSlope = 6.0 * f * (1.0 - f);
  float a = airHash(corner);
  float b = airHash(corner + vec2(1.0, 0.0));
  float c = airHash(corner + vec2(0.0, 1.0));
  float d = airHash(corner + vec2(1.0, 1.0));
  float twist = a - b - c + d;
  return vec3(
    a + (b - a) * ease.x + (c - a) * ease.y + twist * ease.x * ease.y,
    easeSlope * vec2(b - a + twist * ease.y, c - a + twist * ease.x)
  );
}
${SKY_RADIANCE}
// what a white surface facing this way sends back of the sky's light: the sky halfway between this way and
// straight up, for the share of the sky it faces, and the light come back off the ground for the rest
vec3 skyLight(vec3 normal, vec3 sun, float weather) {
  vec3 overhead = vec3(0.0, 1.0, 0.0);
  vec3 sky = skyGlow(normal + overhead * 1.001, sun, weather);
  vec3 bounced =
    groundBounce * (sunLight(sun, weather) * max(sun.y, 0.0) + skyGlow(overhead, sun, weather));
  return mix(bounced, sky, 0.5 + 0.5 * normal.y);
}

// the share of the sun's light the clouds overhead let reach this point: their pattern, carried on the wind,
// where the line from the point to the sun meets them. it fades as the weather closes
float cloudShade(vec3 at, vec3 sun, float weather) {
  float strength = cloudShadow * weather;
  // under overcast there is nothing to shadow, and that is the whole of a storm: the noise is not worth asking
  // on a card that can skip it
  if (strength <= 0.0) {
    return 1.0;
  }
  vec2 overhead = at.xz + sun.xz * ((cloudHeight - at.y) / max(sun.y, 0.05));
  vec2 drifted = (overhead - vec2(windX, windZ) * ${AIR_CLOCK}) / cloudGrain;
  float pattern = 0.65 * airNoise(drifted).x + 0.35 * airNoise(drifted * 2.3 + 7.1).x;
  float cloud = smoothstep(cloudCover - cloudSoftness, cloudCover + cloudSoftness, pattern);
  return 1.0 - strength * cloud;
}

// the cloud of the deck lit from above: what it scatters toward the eye
vec3 deckLight(vec3 sun, float weather) {
  return deckColour * (sunLight(sun, weather) * max(sun.y, 0.0) + skyLight(vec3(0.0, 1.0, 0.0), sun, weather));
}

// an antiderivative, in height, of a density that is 1 below top, falls to 0 over soft above it, and is 0 above
float layerRise(float y, float top, float soft) {
  float within = clamp((top + soft - y) / soft, 0.0, 1.0);
  return -0.5 * soft * within * within + min(y - top, 0.0);
}

// metres of that layer, at density 1, on the straight line from the eye to the point
float throughLayer(vec3 eye, vec3 point, float top, float soft) {
  float rise = eye.y - point.y;
  float span = distance(eye, point);
  if (abs(rise) < 0.01) {
    return span * clamp((top + soft - point.y) / soft, 0.0, 1.0);
  }
  return span * (layerRise(eye.y, top, soft) - layerRise(point.y, top, soft)) / rise;
}

// the haze on that line: density at fogBase, thinning by e every fogFalloff metres up
float throughHaze(vec3 eye, vec3 point, float density) {
  float rise = eye.y - point.y;
  float span = distance(eye, point);
  float atPoint = exp(-(point.y - fogBase) / fogFalloff);
  if (abs(rise) < 0.01) {
    return density * atPoint * span;
  }
  float atEye = exp(-(eye.y - fogBase) / fogFalloff);
  return density * fogFalloff * (atPoint - atEye) * span / rise;
}

// a colour at the point, as the eye sees it through the haze, the mist the point's humidity makes, and the deck
vec3 fogged(vec3 colour, vec3 eye, vec3 point, vec3 sun, float weather, float humidity) {
  float haze = throughHaze(eye, point, mix(hazeStorm, hazeClear, weather));
  // each layer is skipped where it is none, which is most of the picture: mist over dry ground, and the
  // deck for everything above its top. the answer is the same to the bit. a graphics card skips the work;
  // the software rasteriser runs both sides of a branch and was measured not to notice
  float mist =
    humidity > 0.0 ? mistDensity * humidity * throughLayer(eye, point, point.y, mistCeiling) : 0.0;
  float deck =
    point.y < deckHeight + deckSoft ? deckDensity * throughLayer(eye, point, deckHeight, deckSoft) : 0.0;
  float thickness = haze + mist + deck;
  if (thickness <= 0.0) {
    return colour;
  }
  vec3 scattered = (haze + mist) * skyGlow(point - eye, sun, weather);
  if (deck > 0.0) {
    scattered += deck * deckLight(sun, weather);
  }
  scattered /= thickness;
  float passed = exp(-thickness);
  return colour * passed + scattered * (1.0 - passed);
}
`;

/** the dome: one triangle over the whole screen, at the far plane, drawn only where nothing else is */
export const DOME_VERTEX = /* glsl */ `${PRECISION}
// a corner of the screen, x and y in [-1, 3]
in vec3 position;

uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;

// the direction this corner looks, in the world
out vec3 vRay;

void main() {
  vec3 seen = vec3(position.x / projectionMatrix[0][0], position.y / projectionMatrix[1][1], -1.0);
  vRay = transpose(mat3(viewMatrix)) * seen;
  // at the far plane exactly: a depth test that lets equal through draws it only where nothing stands
  gl_Position = vec4(position.xy, 1.0, 1.0);
}`;

export const DOME_FRAGMENT = /* glsl */ `${PRECISION}
${AIR_FRAGMENT}
uniform vec3 sunDirection;

in vec3 vRay;
out vec4 result;

void main() {
  result = vec4(skyRadiance(vRay, sunDirection, ${WEATHER}), 1.0);
}`;

/** the deck: one sheet at the height of its top, reaching far past the block in every direction */
export const DECK_VERTEX = /* glsl */ `${PRECISION}
// x and z in metres; y is unused
in vec3 position;

uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform float deckHeight;

out vec3 vWorld;

void main() {
  vWorld = vec3(position.x, deckHeight, position.z);
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}`;

export const DECK_FRAGMENT = /* glsl */ `${PRECISION}
${AIR_FRAGMENT}
uniform vec3 sunDirection;
uniform vec3 cameraPosition;

in vec3 vWorld;
out vec4 result;

void main() {
  // billows carried on the wind, in two sizes; they tip the surface and are not a height
  vec2 at = (vWorld.xz - vec2(windX, windZ) * ${AIR_CLOCK}) / deckGrain;
  vec2 slope = airNoise(at).yz + 0.5 * airNoise(at * 2.7 + 11.0).yz * 2.7;
  vec3 normal = normalize(vec3(-slope.x * deckRelief, 1.0, -slope.y * deckRelief));

  float facing = max(dot(normal, sunDirection), 0.0);
  float shade = cloudShade(vWorld, sunDirection, ${WEATHER});
  vec3 colour = deckColour * (
    sunLight(sunDirection, ${WEATHER}) * facing * shade + skyLight(normal, sunDirection, ${WEATHER})
  );
  colour = fogged(colour, cameraPosition, vWorld, sunDirection, ${WEATHER}, 0.0);

  // gone into the sky long before its edge, so where it ends is never seen
  float distant = smoothstep(0.5 * deckReach, 0.9 * deckReach, length(vWorld.xz));
  result = vec4(mix(colour, skyGlow(vWorld - cameraPosition, sunDirection, ${WEATHER}), distant), 1.0);
}`;

/**
 * how much of a pixel the rain's streaks cover, in [0, 1], for a rain of this strength at this time. it
 * declares its own uniforms; the strength and the time are arguments, so each wrapper names them
 */
export const RAIN_STREAKS = /* glsl */ `
${declare('float', RAIN_FLOATS)}
${declare('int', RAIN_COUNTS)}
${declare('vec3', RAIN_COLOURS)}

float rainHash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

float streaksAt(vec2 pixel, float strength, float seconds) {
  float covered = 0.0;
  float scale = 1.0;
  for (int sheet = 0; sheet < rainLayers; sheet++) {
    vec2 p = pixel / scale;
    // a column leans by the slant, so a streak falling down it falls aslant
    p.x += p.y * rainSlant;
    float column = floor(p.x / rainColumn);
    float across = fract(p.x / rainColumn) - 0.5;
    vec2 named = vec2(column, float(sheet) * 31.0);
    float speed = rainSpeed * (0.75 + 0.5 * rainHash(named));
    float along = (p.y + speed * seconds) / rainLength + rainHash(named + 3.7);
    float slot = floor(along);
    float into = fract(along);
    float falls = step(rainHash(vec2(column, slot) + named * 0.37), strength * rainDensity);
    float streak = smoothstep(0.0, 0.08, into) * (1.0 - smoothstep(0.42, 0.5, into));
    float thin = 1.0 - smoothstep(0.5 * rainWidth, rainWidth, abs(across));
    // the sheets behind are fainter, as they are smaller
    covered = max(covered, falls * streak * thin * scale);
    scale *= rainLayerScale;
  }
  return covered;
}
`;
