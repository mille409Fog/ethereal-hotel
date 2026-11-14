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
 * - **blue is humidity**: the mean, over a disc `humidityRadius` across, of how near each cell's water comes to
 *   `humidityDepth`. it is what the mist lies by and what the plants grow by. it is the simulation's water and
 *   nothing else, blurred, and it changes when the land does, which is when this pass runs. a film counts for
 *   almost nothing, so a drained hillside is dry; one stream through the disc is only a little damp, and how
 *   much mist that makes is `mistDensity`, which is the look phase's.
 *
 * ## the mesh fetches in the vertex shader and nowhere else
 *
 * `land-geometry.ts` puts one vertex on every cell, so the vertex shader reads its own cell with `texelFetch` and
 * hands the fragment shader the height, the normal and the layers already interpolated. the fragment shader reads
 * two textures: the beds, and the light.
 *
 * - **"darker and bluer in shade" is not a term.** shade is where the sun's warm light is gone and the sky's blue
 *   light is what is left, so the colour of shade is the sum on the last line and nothing has to tint it. both
 *   lights are the air's (`air/air-shaders.ts`): the sun through the air it crosses, and the sky function. so a
 *   storm's ground is lit by a grey sky alone, and a low sun's by gold, and neither is a colour chosen here.
 * - **the walls are a section.** a fragment of a wall takes its bed from its own height, so the beds run straight
 *   through the block's cut sides, and anything above the column's bedrock is drawn as the loose ground it is.
 *   a wall's normal comes from the screen-space derivatives of its position, which are exact on a flat triangle.
 * - **nothing is green yet.** the plants are written, and multiplied by `greening`, which is 0 until the phase
 *   that directs the storm brings them in after the light. they grow thickest where the light pass finds the
 *   ground humid, which is near water and not only on it.
 * - **the air is applied once, last.** `ground()` is the light the ground sends; what reaches the eye is that
 *   through the haze, the mist and the deck, which the main does with `fogged`. the water does the same to its
 *   own colour, so the bed under water is not fogged twice.
 * - **the fine relief fades before it can shimmer.** it is noise a few metres across, there for a camera near the
 *   ground; from the high vantage a pixel covers more than a lump of it, and it is faded out by the pixel's own
 *   footprint so it never aliases.
 *
 * ## the ground is two chunks, because the water draws it too
 *
 * `GROUND_VERTEX` reads the column under a vertex and `groundFragment` turns it into the light the ground sends
 * to the eye, as the function `ground()`. the fragment's chunk is built round the air's (`AIR_FRAGMENT`, handed
 * in, since a leaf cannot import it), so whatever is built on the ground has the one sky in it, once. the land's
 * two shaders are those chunks and a `main` each. the water's
 * are the same chunks and a `main` of its own (`water/water-shaders.ts`, which is handed them as arguments): the
 * bed seen through water is `ground()` called again on the same vertices, so it is the land's colour to the bit
 * and a shoreline has no seam to hide. a change to how the ground looks is made here once and both follow.
 *
 * - **wet ground has no memory of its own.** it is wet where a film of water lies on it, or while rain falls.
 *   the film is the memory: a cell the water has left keeps a little until evaporation takes it, and that is
 *   the simulation's account of where water lately was. a wetness channel that decayed by a rate chosen here
 *   would be a second, invented one. wet ground is darker, and the sun glints on it; snow and the walls are not
 *   wetted.
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

/** the rain's strength this frame, in [0, 1]: all the ground is wet while it falls */
export const RAIN = 'rain';

/** three.js supplies these three to a raw material that declares them; a harness supplies them by hand */
export const CAMERA_UNIFORMS: readonly string[] = [
  'viewMatrix',
  'projectionMatrix',
  'cameraPosition',
];

/** what the light pass reads: floats, whole numbers, and the model's constants */
export const LIGHT_FLOATS: ReadonlyArray<LookKeys<number>> = [
  'shadowReach',
  'shadowSoftness',
  'shadowBias',
  'occlusionRadius',
  'occlusionStrength',
  'humidityRadius',
  'humidityDepth',
];
export const LIGHT_COUNTS: ReadonlyArray<LookKeys<number>> = [
  'shadowSteps',
  'occlusionSteps',
  'humiditySteps',
];
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
  'greenDry',
  'rockGrain',
  'looseGrain',
  'rockRough',
  'screeRough',
  'siltRough',
  'wetDepth',
  'wetDarken',
  'wetGloss',
  'wetShine',
];
export const LAND_COLOURS: ReadonlyArray<LookKeys<Colour>> = [
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

/** drawn with the simulation's one triangle; writes sun shadow in red, sky occlusion in green, humidity in blue */
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

// how near a cell's water comes to humidityDepth, in [0, 1]. eased, not straight: it starts flat, so the film a
// drained hillside keeps counts for almost nothing and a channel for nearly all it holds
float wetnessOf(ivec2 p) {
  return smoothstep(0.0, humidityDepth, texelFetch(land, p, 0).b);
}

// how humid the ground round p is: the wetness of the cells over a disc, averaged. each ring of looks is turned
// half a step from the last, so the looks do not line up into spokes. it is the plain mean: its square root was
// tried, to make one stream a damp valley, and it turned the first look to land on water from nothing into a
// fifth, so the mist lay in patches with hard edges wherever a look crossed a pool
float humidityAt(ivec2 p, float cell) {
  float wet = wetnessOf(p);
  float looks = 1.0;
  for (int ring = 1; ring <= humiditySteps; ring++) {
    float reach = (humidityRadius * float(ring)) / float(humiditySteps);
    for (int d = 0; d < 8; d++) {
      float angle = (float(d) + 0.5 * float(ring)) * 0.7853982;
      ivec2 q = p + ivec2(round((vec2(cos(angle), sin(angle)) * reach) / cell));
      if (onBlock(q)) {
        wet += wetnessOf(q);
        looks += 1.0;
      }
    }
  }
  return wet / looks;
}

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  float cell = extent / float(textureSize(land, 0).x);
  float here = surfaceOf(p);
  result = vec4(sunAt(p, here, cell), skyAt(p, here, cell), humidityAt(p, cell), 1.0);
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

/**
 * the head of any vertex shader that stands on the land's grid: it reads the column under the vertex and the
 * four round it, once, hands the fragment shader everything about the ground but where the vertex is, and
 * leaves what it read in the globals below for the main that follows. the main sets vWorld, vSkirt and
 * gl_Position
 */
export const GROUND_VERTEX = /* glsl */ `
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
${VARYINGS('out')}

// the cell under the vertex, and its state: cut, regolith, water depth, suspended sediment
ivec2 cellHere;
vec4 stateHere;
// the height of its ground
float surfaceHere;
// toward left, right, up and down: the ground's height there, and the depth of water standing on it
vec4 surfaceRound;
vec4 waterRound;
// metres between the two cells each slope is taken over, in x and in z
vec2 spanRound;

vec2 columnOf(ivec2 p) {
  vec4 state = texelFetch(land, p, 0);
  return vec2(texelFetch(terrain, p, 0).r - state.r + state.g, state.b);
}

void column() {
  int n = textureSize(land, 0).x;
  int last = n - 1;
  float cell = extent / float(n);
  vec2 across = position.xz / extent + 0.5;
  cellHere = clamp(ivec2(floor(across * float(n))), ivec2(0), ivec2(last));
  stateHere = texelFetch(land, cellHere, 0);
  vec4 raised = texelFetch(terrain, cellHere, 0);
  float bedrock = raised.r - stateHere.r;
  surfaceHere = bedrock + stateHere.g;

  // at the rim the difference is taken over the one cell there is
  ivec2 left = ivec2(max(cellHere.x - 1, 0), cellHere.y);
  ivec2 right = ivec2(min(cellHere.x + 1, last), cellHere.y);
  ivec2 up = ivec2(cellHere.x, max(cellHere.y - 1, 0));
  ivec2 down = ivec2(cellHere.x, min(cellHere.y + 1, last));
  vec2 atLeft = columnOf(left);
  vec2 atRight = columnOf(right);
  vec2 atUp = columnOf(up);
  vec2 atDown = columnOf(down);
  surfaceRound = vec4(atLeft.x, atRight.x, atUp.x, atDown.x);
  waterRound = vec4(atLeft.y, atRight.y, atUp.y, atDown.y);
  spanRound = cell * vec2(float(right.x - left.x), float(down.y - up.y));

  vNormal = normalize(vec3(
    -(surfaceRound.y - surfaceRound.x) / spanRound.x,
    1.0,
    -(surfaceRound.w - surfaceRound.z) / spanRound.y
  ));
  vLayers = vec4(bedrock, raised.g, stateHere.g, stateHere.b);
  vUv = across;
}
`;

export const LAND_VERTEX = /* glsl */ `${GROUND_VERTEX}
uniform float skirtFloor;

void main() {
  column();
  vWorld = vec3(position.x, position.y > 1.5 ? skirtFloor : surfaceHere, position.z);
  vSkirt = position.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}`;

/** everything `ground()` reads, and `ground()`: the ground's chunk without the air it is built round */
const GROUND = /* glsl */ `
// strata: red, green, blue, erodibility; one row, lowest bed first
uniform sampler2D strata;
// light: sun shadow, sky occlusion, humidity
uniform sampler2D light;
uniform vec3 cameraPosition;
uniform vec3 ${SUN_DIRECTION};
uniform float ${GREENING};
uniform float ${RAIN};
${declare('float', [...LAND_EROSION.filter((key) => key !== 'extent'), ...LAND_FLOATS.filter((key) => key !== 'skirtFloor')])}
${declare('vec3', LAND_COLOURS)}
${VARYINGS('in')}

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

// the sun's glint off a surface this tight, for a sun that would light a white one to 1. it is normalised,
// so a tighter glint is a brighter one and the light sent back is the same
float glintOf(vec3 normal, vec3 toEye, float gloss) {
  vec3 between = normalize(toEye + ${SUN_DIRECTION});
  return ((gloss + 8.0) / 8.0) * pow(max(dot(normal, between), 0.0), gloss);
}

// how humid the ground under this fragment is, from the light pass; a wall is a section, and dry
float humidity() {
  return vSkirt > 0.5 ? 0.0 : texture(light, vUv).b;
}

// the light the ground under this fragment sends toward the eye, before the air between them
vec3 ground() {
  bool wall = vSkirt > 0.5;
  vec3 normal = normalize(vNormal);
  float steep = 1.0 - normal.y;
  float cover = clamp(vLayers.z / regolithFull, 0.0, 1.0);
  float scree = smoothstep(screeFrom, screeTo, steep);
  vec3 loose = mix(siltColour, screeColour, scree);
  vec3 albedo;
  vec2 lit;
  float wet = 0.0;

  if (wall) {
    // a section through the block: the beds straight through, and the loose ground as a cap on them
    normal = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    albedo = vWorld.y > vLayers.x ? loose : bedAt(vWorld.y + vLayers.y);
    lit = vec2(1.0);
  } else {
    albedo = mix(bedAt(vLayers.x + vLayers.y), loose, cover);

    // plants grow thickest by water, which is where the light pass finds the ground humid
    float banks = humidity();
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

    // wet under a film of water, and everywhere while it rains; snow stays as it is
    wet = max(${RAIN}, clamp(vLayers.a / wetDepth, 0.0, 1.0)) * (1.0 - snow);
    albedo *= mix(1.0, wetDarken, wet);
  }

  // the sun through the air and past the clouds overhead, and the sky; both are the air's
  float facing = max(dot(normal, ${SUN_DIRECTION}), 0.0);
  float shade = cloudShade(vWorld, ${SUN_DIRECTION}, weather);
  vec3 sun = sunLight(${SUN_DIRECTION}, weather) * facing * lit.x * shade;
  vec3 sky = skyLight(normal, ${SUN_DIRECTION}, weather) * lit.y;
  vec3 toEye = normalize(cameraPosition - vWorld);
  vec3 shine = sun * glintOf(normal, toEye, wetGloss) * wetShine * wet;
  return albedo * (sun + sky) + shine;
}
`;

/**
 * the head of any fragment shader that draws the ground or looks through something at it: the air, everything
 * `ground()` reads, and `ground()`. it declares no output; the main that follows does. `air` is
 * `AIR_FRAGMENT` from `air/air-shaders.ts`
 */
export const groundFragment = (air: string): string => /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2D;
${air}${GROUND}`;

/** `air` is `AIR_FRAGMENT` from `air/air-shaders.ts` */
export const landFragment = (air: string): string => /* glsl */ `${groundFragment(air)}
out vec4 result;

void main() {
  result = vec4(fogged(ground(), cameraPosition, vWorld, ${SUN_DIRECTION}, weather, humidity()), 1.0);
}`;
