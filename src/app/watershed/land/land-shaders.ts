/**
 * the land's three shaders: the light pass, and the vertex and fragment shaders of the mesh.
 *
 * `sim-shaders.ts` is held to a reference model. these are not: they are a picture, and a picture has nothing
 * to be compared against. what `scripts/verify-watershed.mjs` does for them is compile them, which nothing else
 * would before a visitor's browser, and hold the two claims about them that a number can carry: ground facing
 * away from the sun is in shadow, and a flat land is neither shadowed nor occluded.
 *
 * ## the light is worked out on the land, not on the screen
 *
 * `LIGHT_FRAGMENT` runs once for every cell and writes how much of the sun reaches it and how much of the sky it
 * can see. the mesh's fragment shader then reads one filtered texel. marching to the sun from every pixel of the
 * screen instead costs about six times as many fetches at 1080p, all of them every frame, where this runs only in
 * a frame in which the land or the sun moved.
 *
 * - **the march snaps to the grid.** a ray toward the sun is walked one whole cell at a time along whichever axis
 *   it mostly travels, so each look falls between exactly two cells and is their mix: four fetches a look where
 *   a free position needs eight, and exact where the nearest cell alone is not. the nearest cell alone was the
 *   obvious cheaper thing, and on a smooth slope it shades the ground in stripes, because the height it reads is
 *   off by the slope times however far the cell's centre is from the ray.
 * - **the looks spread out.** the first are a cell apart, where a slope shades itself; the last are many apart,
 *   where only a mountain matters. a ridge one cell wide and far away can be stepped over. it would throw a
 *   shadow one cell wide.
 * - **the light is eight bits.** both terms lie in [0, 1], so the target is an ordinary RGBA8 texture: every
 *   device can render to it and filter it, including the ones that cannot render to float and will be shown a
 *   stored land.
 * - **beyond the block there is nothing**, so a ray that leaves it is in the clear and a horizon stops at the edge.
 *
 * ## the mesh fetches in the vertex shader and nowhere else
 *
 * `land-geometry.ts` puts one vertex on every cell, so the vertex shader reads its own cell with `texelFetch` and
 * hands the fragment shader the height, the normal and the layers already interpolated. the fragment shader reads
 * two textures: the beds, and the light.
 *
 * - **"darker and bluer in shade" is not a term.** shade is where the sun's warm light is gone and the sky's blue
 *   light is what is left, so the colour of shade is the sum on the last line and nothing has to tint it.
 * - **the walls are a section.** a fragment of a wall takes its bed from its own height, so the beds run straight
 *   through the block's cut sides, and anything above the column's bedrock is drawn as the loose ground it is.
 *   a wall's normal comes from the screen-space derivatives of its position, which are exact on a flat triangle.
 * - **nothing is green yet.** the plants are written, and multiplied by `greening`, which is 0 until the phase
 *   that directs the storm brings them in after the light.
 * - **the fine relief fades before it can shimmer.** it is noise a few metres across, there for a camera near the
 *   ground; from the high vantage a pixel covers more than a lump of it, and it is faded out by the pixel's own
 *   footprint so it never aliases.
 *
 * colour leaves here linear and unbounded. the composer's output pass does the tone mapping and the encoding.
 *
 * every number is a uniform named for its key in a calibration object, and the lists below say which shader
 * reads which. the loop counts are uniforms too; GLSL ES 3.00 allows that, where 1.00 did not.
 *
 * this lives inside template literals, so a backtick in a comment ends the string, and GLSL ES 3.00 reserves a
 * long list of ordinary words: the obvious name for the horizontal part of a vector is one of them.
 *
 * a leaf module: see `model/fields.ts`.
 */
import type { IErosionConstants } from '../model/erosion-calibration';
import type { Colour, ILandLook } from './land-calibration';

type LookKeys<T> = { [K in keyof ILandLook]: ILandLook[K] extends T ? K : never }[keyof ILandLook];

/** the unit vector toward the sun, in both the light pass and the mesh */
export const SUN_DIRECTION = 'sunDirection';

/** how far the plants have come in, in [0, 1]; the mesh's one uniform that is neither a constant nor a texture */
export const GREENING = 'greening';

/** what the light pass reads: floats, whole numbers, and the model's constants */
export const LIGHT_FLOATS: ReadonlyArray<LookKeys<number>> = [
  'shadowReach',
  'shadowSoftness',
  'shadowBias',
  'occlusionRadius',
  'occlusionStrength',
];
export const LIGHT_COUNTS: ReadonlyArray<LookKeys<number>> = ['shadowSteps', 'occlusionSteps'];
export const LIGHT_EROSION: ReadonlyArray<keyof IErosionConstants> = ['extent'];

/** what the mesh reads: floats, colours, and the model's constants */
export const LAND_FLOATS: ReadonlyArray<LookKeys<number>> = [
  'skirtFloor',
  'regolithFull',
  'screeFrom',
  'screeTo',
  'snowLine',
  'snowBand',
  'snowSlopeFrom',
  'snowSlopeTo',
  'greenLine',
  'greenBand',
  'greenSlopeFrom',
  'greenSlopeTo',
  'greenSoil',
  'greenWater',
  'greenDry',
  'rockGrain',
  'looseGrain',
  'rockRough',
  'screeRough',
  'siltRough',
];
export const LAND_COLOURS: ReadonlyArray<LookKeys<Colour>> = [
  'sunColour',
  'skyColour',
  'groundColour',
  'screeColour',
  'siltColour',
  'snowColour',
  'greenColour',
];
export const LAND_EROSION: ReadonlyArray<keyof IErosionConstants> = [
  'extent',
  'strataFloor',
  'strataSpan',
];

const declare = (kind: string, names: readonly string[]): string =>
  names.map((name) => `uniform ${kind} ${name};`).join('\n');

/** drawn with the simulation's one triangle; writes sun shadow in red and sky occlusion in green */
export const LIGHT_FRAGMENT = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2D;

// land: cut, regolith, water depth, suspended sediment
uniform sampler2D land;
// terrain: uplift, strata warp
uniform sampler2D terrain;
uniform vec3 ${SUN_DIRECTION};
${declare('float', [...LIGHT_EROSION, ...LIGHT_FLOATS])}
${declare('int', LIGHT_COUNTS)}

out vec4 result;

bool onBlock(ivec2 p) {
  int n = textureSize(land, 0).x;
  return p.x >= 0 && p.y >= 0 && p.x < n && p.y < n;
}

float surfaceOf(ivec2 p) {
  vec4 state = texelFetch(land, p, 0);
  return texelFetch(terrain, p, 0).r - state.r + state.g;
}

// 1 where the sun reaches p, 0 where the land stands in the way, and between the two where it only just clears
float sunAt(ivec2 p, float here, float cell) {
  vec2 toward = ${SUN_DIRECTION}.xz;
  float level = length(toward);
  // a sun straight overhead is hidden by nothing
  if (level < 1e-4) {
    return 1.0;
  }
  vec2 heading = toward / level;
  float climb = ${SUN_DIRECTION}.y / level;
  bool alongX = abs(heading.x) >= abs(heading.y);
  float major = alongX ? heading.x : heading.y;
  float minor = alongX ? heading.y : heading.x;
  int sense = major > 0.0 ? 1 : -1;
  // cells sideways for each cell forward, and metres along the ray for each cell forward
  float lean = minor / abs(major);
  float stretch = cell / abs(major);
  float cells = shadowReach / stretch;

  float clear = 1.0;
  for (int k = 1; k <= shadowSteps; k++) {
    float share = float(k) / float(shadowSteps);
    int forward = max(k, int(round(cells * share * sqrt(share))));
    float across = float(forward) * lean;
    float low = floor(across);
    ivec2 a = alongX ? p + ivec2(sense * forward, int(low)) : p + ivec2(int(low), sense * forward);
    ivec2 b = a + (alongX ? ivec2(0, 1) : ivec2(1, 0));
    if (!onBlock(a) || !onBlock(b)) {
      break;
    }
    float ground = mix(surfaceOf(a), surfaceOf(b), across - low);
    float along = float(forward) * stretch;
    clear = min(clear, (shadowSoftness * (here + shadowBias + along * climb - ground)) / along);
    // nothing further off can put a cell deeper into shadow than wholly in it
    if (clear <= 0.0) {
      break;
    }
  }
  return clamp(clear, 0.0, 1.0);
}

// the share of the sky p can see: 1 less the mean, over eight directions, of the sine of the horizon's height
float skyAt(ivec2 p, float here, float cell) {
  float hidden = 0.0;
  for (int d = 0; d < 8; d++) {
    float angle = float(d) * 0.7853982;
    vec2 heading = vec2(cos(angle), sin(angle));
    float steepest = 0.0;
    for (int k = 1; k <= occlusionSteps; k++) {
      float reach = (occlusionRadius * float(k)) / float(occlusionSteps);
      ivec2 offset = ivec2(round((heading * reach) / cell));
      if (offset == ivec2(0)) {
        continue;
      }
      if (!onBlock(p + offset)) {
        break;
      }
      steepest = max(steepest, (surfaceOf(p + offset) - here) / (length(vec2(offset)) * cell));
    }
    hidden += steepest / sqrt(1.0 + steepest * steepest);
  }
  return 1.0 - (occlusionStrength * hidden) / 8.0;
}

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  float cell = extent / float(textureSize(land, 0).x);
  float here = surfaceOf(p);
  // blue is kept for the air: humidity, which the mist will read
  result = vec4(sunAt(p, here, cell), skyAt(p, here, cell), 0.0, 1.0);
}`;

/** the names the two halves of the mesh's shader share */
const VARYINGS = (direction: 'in' | 'out'): string => /* glsl */ `
// where the fragment is, in metres; y is up
${direction} vec3 vWorld;
// the ground's normal, from the heights of the four cells round the vertex
${direction} vec3 vNormal;
// the column under the vertex: the top of its bedrock, the beds' warp, its regolith, its water
${direction} vec4 vLayers;
${direction} vec2 vUv;
// 0 on the ground, 1 to 2 down a wall
${direction} float vSkirt;
`;

export const LAND_VERTEX = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2D;

// x and z in metres; y is the kind of vertex. see land-geometry.ts
in vec3 position;

uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform sampler2D land;
uniform sampler2D terrain;
uniform float extent;
uniform float skirtFloor;
${VARYINGS('out')}

float surfaceOf(ivec2 p) {
  vec4 state = texelFetch(land, p, 0);
  return texelFetch(terrain, p, 0).r - state.r + state.g;
}

void main() {
  int n = textureSize(land, 0).x;
  int last = n - 1;
  float cell = extent / float(n);
  vec2 across = position.xz / extent + 0.5;
  ivec2 p = clamp(ivec2(floor(across * float(n))), ivec2(0), ivec2(last));
  vec4 state = texelFetch(land, p, 0);
  vec4 raised = texelFetch(terrain, p, 0);
  float bedrock = raised.r - state.r;
  float surface = bedrock + state.g;

  // at the rim the difference is taken over the one cell there is
  ivec2 left = ivec2(max(p.x - 1, 0), p.y);
  ivec2 right = ivec2(min(p.x + 1, last), p.y);
  ivec2 up = ivec2(p.x, max(p.y - 1, 0));
  ivec2 down = ivec2(p.x, min(p.y + 1, last));
  float slopeX = (surfaceOf(right) - surfaceOf(left)) / (cell * float(right.x - left.x));
  float slopeY = (surfaceOf(down) - surfaceOf(up)) / (cell * float(down.y - up.y));

  vWorld = vec3(position.x, position.y > 1.5 ? skirtFloor : surface, position.z);
  vNormal = normalize(vec3(-slopeX, 1.0, -slopeY));
  vLayers = vec4(bedrock, raised.g, state.g, state.b);
  vUv = across;
  vSkirt = position.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}`;

export const LAND_FRAGMENT = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2D;

// strata: red, green, blue, erodibility; one row, lowest bed first
uniform sampler2D strata;
// light: sun shadow, sky occlusion
uniform sampler2D light;
uniform vec3 ${SUN_DIRECTION};
uniform float ${GREENING};
${declare('float', [...LAND_EROSION.filter((key) => key !== 'extent'), ...LAND_FLOATS.filter((key) => key !== 'skirtFloor')])}
${declare('vec3', LAND_COLOURS)}
${VARYINGS('in')}

out vec4 result;

// the colour of the bed at this height. beds are runs of equal entries, so only their edges are mixed
vec3 bedAt(float height) {
  int beds = textureSize(strata, 0).x;
  float entry = ((height - strataFloor) / strataSpan) * float(beds) - 0.5;
  int lower = clamp(int(floor(entry)), 0, beds - 1);
  int upper = min(lower + 1, beds - 1);
  return mix(
    texelFetch(strata, ivec2(lower, 0), 0).rgb,
    texelFetch(strata, ivec2(upper, 0), 0).rgb,
    clamp(entry - float(lower), 0.0, 1.0)
  );
}

float chance(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

// the slope, in x and z, of smooth noise one lump to the unit
vec2 lumps(vec2 at) {
  vec2 corner = floor(at);
  vec2 f = fract(at);
  vec2 ease = f * f * (3.0 - 2.0 * f);
  vec2 easeSlope = 6.0 * f * (1.0 - f);
  float a = chance(corner);
  float b = chance(corner + vec2(1.0, 0.0));
  float c = chance(corner + vec2(0.0, 1.0));
  float d = chance(corner + vec2(1.0, 1.0));
  float twist = a - b - c + d;
  return easeSlope * vec2(b - a + twist * ease.y, c - a + twist * ease.x);
}

// 1 while a lump of this size covers several pixels, 0 by the time a pixel covers a lump
float seen(float grain, float footprint) {
  return clamp((0.5 * grain) / footprint - 0.5, 0.0, 1.0);
}

void main() {
  bool wall = vSkirt > 0.5;
  vec3 normal = normalize(vNormal);
  float steep = 1.0 - normal.y;
  float cover = clamp(vLayers.z / regolithFull, 0.0, 1.0);
  float scree = smoothstep(screeFrom, screeTo, steep);
  vec3 loose = mix(siltColour, screeColour, scree);
  vec3 albedo;
  vec2 lit;

  if (wall) {
    // a section through the block: the beds straight through, and the loose ground as a cap on them
    normal = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    albedo = vWorld.y > vLayers.x ? loose : bedAt(vWorld.y + vLayers.y);
    lit = vec2(1.0);
  } else {
    albedo = mix(bedAt(vLayers.x + vLayers.y), loose, cover);

    float banks = clamp(vLayers.a / greenWater, 0.0, 1.0);
    float green =
      ${GREENING} *
      (1.0 - smoothstep(greenSlopeFrom, greenSlopeTo, steep)) *
      (1.0 - smoothstep(greenLine - greenBand, greenLine, vWorld.y)) *
      clamp(vLayers.z / greenSoil, 0.0, 1.0) *
      mix(greenDry, 1.0, banks);
    albedo = mix(albedo, greenColour, green);

    float snow =
      smoothstep(snowLine, snowLine + snowBand, vWorld.y) *
      (1.0 - smoothstep(snowSlopeFrom, snowSlopeTo, steep));
    albedo = mix(albedo, snowColour, snow);

    float footprint = max(length(fwidth(vWorld.xz)), 1e-3);
    vec2 fine = mix(
      lumps(vWorld.xz / rockGrain) * rockRough * seen(rockGrain, footprint),
      lumps(vWorld.xz / looseGrain) * mix(siltRough, screeRough, scree) * seen(looseGrain, footprint),
      cover
    );
    normal = normalize(normal - (1.0 - snow) * vec3(fine.x, 0.0, fine.y));
    lit = texture(light, vUv).rg;
  }

  vec3 sun = sunColour * max(dot(normal, ${SUN_DIRECTION}), 0.0) * lit.x;
  vec3 sky = mix(groundColour, skyColour, normal.y * 0.5 + 0.5) * lit.y;
  result = vec4(albedo * (sun + sky), 1.0);
}`;
