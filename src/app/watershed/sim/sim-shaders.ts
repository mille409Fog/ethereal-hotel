/**
 * the model as fragment shaders: `model/step.ts`, function for function, for a GPU to run on every cell at once.
 *
 * `step.ts` is the specification and this is the copy. the two are the same arithmetic in the same order, and
 * `scripts/verify-watershed.mjs` runs both from one land and fails when they part. so a change here is a change
 * there, in the same commit, and the script is how to find out whether it was.
 *
 * ## the pass list is data
 *
 * `SIM_PASSES` says, for each pass, which textures it reads and which one it writes. the three.js driver in the
 * route and the raw-WebGL harness in the verifying script both walk that one table, so the thing verified and
 * the thing shipped cannot be two different simulations. a pass writes exactly one texture and never reads the one
 * it writes; the drivers keep two copies of each and swap.
 *
 * there are nine passes where `step.ts` has eight functions, because `flow` changes two things, the water's depth
 * and its velocity, and a pass has one output. `velocity` and `depth` each work the new depth out for themselves
 * from the same fluxes; `velocity` goes first, while the texture still holds the depth the water flowed from.
 * several passes could be merged, and none has been: the verifying script makes that safe to do later, on a
 * measurement, and until then one function is one shader and a difference has one place to be.
 *
 * ## conventions
 *
 * - a cell is a texel, row `y` of the arrays is row `y` of the texture, and "up" is `y - 1`, as in `fields.ts`.
 * - every fetch is `texelFetch`. the state is never filtered, so a phone without float filtering runs the same
 *   shaders, and a neighbour off the block is never fetched: `onBlock` is asked first and the boundary's stand-in
 *   is written at the call, as `across` does in `step.ts`.
 * - the three height sums are added in `step.ts`'s order, `(uplift - cut) + regolith`, then `+ water`, and the
 *   four-way sums in its pairs, `left + right + (up + down)`. both are there so two machines round alike.
 * - constants are uniforms named for their key in the calibration object; `SIM_CONSTANTS` is the list.
 * - the source has no `#version` line. three.js adds it for a raw material; the harness adds it by hand.
 *
 * this lives inside template literals, so a backtick in a comment ends the string. GLSL ES 3.00 also reserves
 * a long list of ordinary words, among them the obvious names for a sediment sample and for a pass's input and
 * output; none is used below, and a new name is worth checking against that list before the compiler does it.
 *
 * a leaf module: see `model/fields.ts`.
 */
import type { IErosionConstants } from '../model/erosion-calibration';

/** the textures a pass may write: the model's changing state */
export type SimState = 'land' | 'flux' | 'flow' | 'slump';

/** everything a pass may read: the state, and the two textures that never change */
export type SimSource = SimState | 'terrain' | 'strata';

export interface ISimPass {
  /** the function of `step.ts` this is, or the half of `flow` */
  readonly name: string;
  readonly fragment: string;
  readonly reads: readonly SimSource[];
  readonly writes: SimState;
}

/** the state textures, in the order a driver allocates them */
export const SIM_STATES: readonly SimState[] = ['land', 'flux', 'flow', 'slump'];

/** the calibration keys the shaders read; each is a float uniform of the same name */
export const SIM_CONSTANTS: ReadonlyArray<keyof IErosionConstants> = [
  'extent',
  'baseLevel',
  'gravity',
  'timestep',
  'pipeDepth',
  'rainRate',
  'evaporationRate',
  'depthFloor',
  'maxSpeed',
  'capacity',
  'dissolveRate',
  'depositRate',
  'regolithFactor',
  'minTilt',
  'rampDepth',
  'dryDepth',
  'talusRegolith',
  'talusRockSoft',
  'talusRockHard',
  'slumpShare',
  'strataFloor',
  'strataSpan',
];

/** the uniform that is not a constant: the rain's strength this step, in [0, 1] */
export const SIM_STRENGTH = 'strength';

/** one triangle that covers the target; `position` is the only attribute */
export const SIM_VERTEX = /* glsl */ `
in vec3 position;
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

/** the corners of that triangle, three numbers a vertex */
export const SIM_TRIANGLE: readonly number[] = [-1, -1, 0, 3, -1, 0, -1, 3, 0];

/** what every pass shares: the samplers, the constants, and the model's small helpers */
const SHARED = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2D;

// land: cut, regolith, water depth, suspended sediment
uniform sampler2D land;
// terrain: uplift, strata warp
uniform sampler2D terrain;
// strata: red, green, blue, erodibility; one row
uniform sampler2D strata;
// flux and slump: toward left, right, up, down
uniform sampler2D flux;
uniform sampler2D slump;
// flow: velocity x, velocity y
uniform sampler2D flow;

${SIM_CONSTANTS.map((key) => `uniform float ${key};`).join('\n')}
uniform float ${SIM_STRENGTH};

out vec4 result;

const ivec2 LEFT = ivec2(-1, 0);
const ivec2 RIGHT = ivec2(1, 0);
const ivec2 UP = ivec2(0, -1);
const ivec2 DOWN = ivec2(0, 1);

int side() {
  return textureSize(land, 0).x;
}

bool onBlock(ivec2 p) {
  int n = side();
  return p.x >= 0 && p.y >= 0 && p.x < n && p.y < n;
}

float cellSide() {
  return extent / float(side());
}

float bedrockOf(ivec2 p) {
  return texelFetch(terrain, p, 0).r - texelFetch(land, p, 0).r;
}

float surfaceOf(ivec2 p) {
  return bedrockOf(p) + texelFetch(land, p, 0).g;
}

float levelOf(ivec2 p) {
  return surfaceOf(p) + texelFetch(land, p, 0).b;
}

// how readily the bedrock now exposed at p erodes: the bed its height falls in
float erodibilityOf(ivec2 p) {
  int beds = textureSize(strata, 0).x;
  float share = (bedrockOf(p) + texelFetch(terrain, p, 0).g - strataFloor) / strataSpan;
  int bed = clamp(int(floor(share * float(beds))), 0, beds - 1);
  return texelFetch(strata, ivec2(bed, 0), 0).a;
}

float fourWay(vec4 toward) {
  return toward.x + toward.y + (toward.z + toward.w);
}

// the share of a cell's water that leaves through a pipe carrying pipeFlux this step
float shareLeaving(float water, float pipeFlux, float outflow, float area) {
  if (water <= 0.0 || outflow <= 0.0) {
    return 0.0;
  }
  return (pipeFlux * timestep) / max(water * area, outflow * timestep);
}

// what the four neighbours send this cell: from left, right, up, down. nothing comes from beyond the edge
vec4 inflowsAt(ivec2 p) {
  return vec4(
    onBlock(p + LEFT) ? texelFetch(flux, p + LEFT, 0).y : 0.0,
    onBlock(p + RIGHT) ? texelFetch(flux, p + RIGHT, 0).x : 0.0,
    onBlock(p + UP) ? texelFetch(flux, p + UP, 0).w : 0.0,
    onBlock(p + DOWN) ? texelFetch(flux, p + DOWN, 0).z : 0.0
  );
}

// the depth a cell has once this step's fluxes have moved the water
float depthAfter(ivec2 p, vec4 arriving) {
  float cell = cellSide();
  float before = texelFetch(land, p, 0).b;
  float outflow = fourWay(texelFetch(flux, p, 0));
  return max(0.0, before + (timestep * (fourWay(arriving) - outflow)) / (cell * cell));
}

// how much of a drop to a neighbour is more than a slope of rest allows
float excess(float drop, float rest) {
  return max(0.0, drop - rest);
}
`;

const RAIN = /* glsl */ `
void main() {
  vec4 here = texelFetch(land, ivec2(gl_FragCoord.xy), 0);
  here.b += timestep * rainRate * strength;
  result = here;
}`;

const PIPE_FLUX = /* glsl */ `
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  float cell = cellSide();
  float area = cell * cell;
  // gravity times the pipe's area over its length; the pipe is one cell wide and one cell long
  float pull = timestep * gravity * pipeDepth;
  float level = levelOf(p);
  // ground beyond the edge is at base level and dry
  float levelLeft = onBlock(p + LEFT) ? levelOf(p + LEFT) : baseLevel;
  float levelRight = onBlock(p + RIGHT) ? levelOf(p + RIGHT) : baseLevel;
  float levelUp = onBlock(p + UP) ? levelOf(p + UP) : baseLevel;
  float levelDown = onBlock(p + DOWN) ? levelOf(p + DOWN) : baseLevel;
  vec4 was = texelFetch(flux, p, 0);
  vec4 toward = max(
    vec4(0.0),
    was + pull * (vec4(level) - vec4(levelLeft, levelRight, levelUp, levelDown))
  );
  float outflow = fourWay(toward);
  if (outflow > 0.0) {
    toward *= min(1.0, (texelFetch(land, p, 0).b * area) / (outflow * timestep));
  }
  result = toward;
}`;

const CARRY = /* glsl */ `
// what a neighbour at q sends along with the water in its pipe toward this cell
float arrivingFrom(ivec2 q, int pipe, float area) {
  if (!onBlock(q)) {
    return 0.0;
  }
  vec4 there = texelFetch(land, q, 0);
  vec4 toward = texelFetch(flux, q, 0);
  return there.a * shareLeaving(there.b, toward[pipe], fourWay(toward), area);
}

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  float cell = cellSide();
  float area = cell * cell;
  vec4 here = texelFetch(land, p, 0);
  float outflow = fourWay(texelFetch(flux, p, 0));
  float leaving = shareLeaving(here.b, outflow, outflow, area);
  // each neighbour's pipe toward this cell: the left one's right, the upper one's down, and so on
  float arriving =
    arrivingFrom(p + LEFT, 1, area) +
    arrivingFrom(p + RIGHT, 0, area) +
    arrivingFrom(p + UP, 3, area) +
    arrivingFrom(p + DOWN, 2, area);
  here.a = here.a * (1.0 - leaving) + arriving;
  result = here;
}`;

const VELOCITY = /* glsl */ `
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 arriving = inflowsAt(p);
  vec4 toward = texelFetch(flux, p, 0);
  float before = texelFetch(land, p, 0).b;
  // the mean of the flow through the cell's two faces, over the face the water crossed; a film has none
  float depth = (before + depthAfter(p, arriving)) / 2.0;
  float perFlow = depth > depthFloor ? 1.0 / (2.0 * cellSide() * depth) : 0.0;
  vec2 velocity = vec2(
    (arriving.x - toward.x + (toward.y - arriving.y)) * perFlow,
    (arriving.z - toward.z + (toward.w - arriving.w)) * perFlow
  );
  float speed = length(velocity);
  float rein = speed > maxSpeed ? maxSpeed / speed : 1.0;
  result = vec4(velocity * rein, 0.0, 0.0);
}`;

const DEPTH = /* glsl */ `
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 here = texelFetch(land, p, 0);
  here.b = depthAfter(p, inflowsAt(p));
  result = here;
}`;

const ERODE = /* glsl */ `
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  int last = side() - 1;
  float cell = cellSide();
  vec4 here = texelFetch(land, p, 0);
  // off the edge the ground is taken to be level with the edge cell, so the rim adds no tilt
  float slopeX =
    (surfaceOf(ivec2(min(p.x + 1, last), p.y)) - surfaceOf(ivec2(max(p.x - 1, 0), p.y))) /
    (2.0 * cell);
  float slopeY =
    (surfaceOf(ivec2(p.x, min(p.y + 1, last))) - surfaceOf(ivec2(p.x, max(p.y - 1, 0)))) /
    (2.0 * cell);
  float steepness = slopeX * slopeX + slopeY * slopeY;
  float tilt = max(minTilt, sqrt(steepness / (1.0 + steepness)));
  float speed = length(texelFetch(flow, p, 0).xy);
  float shallows = min(1.0, here.b / rampDepth);
  float room = capacity * tilt * speed * shallows - here.a;

  if (room > 0.0) {
    float wanted = timestep * dissolveRate * room;
    float loose = min(here.g, wanted * regolithFactor);
    float rock = (wanted - loose / regolithFactor) * erodibilityOf(p);
    here.g -= loose;
    here.r += rock;
    here.a += loose + rock;
  } else {
    float settling = timestep * depositRate * -room;
    here.a -= settling;
    here.g += settling;
  }
  result = here;
}`;

const EVAPORATE = /* glsl */ `
void main() {
  vec4 here = texelFetch(land, ivec2(gl_FragCoord.xy), 0);
  here.b = max(0.0, here.b - timestep * evaporationRate);
  // a cell left dry lays down whatever its water still held
  if (here.b < dryDepth) {
    here.g += here.a;
    here.a = 0.0;
  }
  result = here;
}`;

const SLUMP_SHED = /* glsl */ `
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  float cell = cellSide();
  float height = surfaceOf(p);
  // ground beyond the edge is taken to be level with the cell, so there is no drop to slide down
  vec4 drop = vec4(
    height - (onBlock(p + LEFT) ? surfaceOf(p + LEFT) : height),
    height - (onBlock(p + RIGHT) ? surfaceOf(p + RIGHT) : height),
    height - (onBlock(p + UP) ? surfaceOf(p + UP) : height),
    height - (onBlock(p + DOWN) ? surfaceOf(p + DOWN) : height)
  );
  float restLoose = talusRegolith * cell;
  vec4 loose = vec4(
    excess(drop.x, restLoose),
    excess(drop.y, restLoose),
    excess(drop.z, restLoose),
    excess(drop.w, restLoose)
  );
  float sliding = slumpShare * fourWay(loose);

  float scale = 0.0;
  if (sliding > 0.0) {
    float soft = erodibilityOf(p);
    float restRock = (talusRockHard + (talusRockSoft - talusRockHard) * soft) * cell;
    float breaking =
      slumpShare *
      fourWay(vec4(
        excess(drop.x, restRock),
        excess(drop.y, restRock),
        excess(drop.z, restRock),
        excess(drop.w, restRock)
      ));
    // loose material slides as far as there is any; rock past its own limit goes regardless
    scale = max(min(sliding, texelFetch(land, p, 0).g), breaking) / sliding;
  }
  result = scale * slumpShare * loose;
}`;

const SLUMP_SETTLE = /* glsl */ `
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 here = texelFetch(land, p, 0);
  float shed = fourWay(texelFetch(slump, p, 0));
  float loose = min(here.g, shed);
  float received = fourWay(vec4(
    onBlock(p + LEFT) ? texelFetch(slump, p + LEFT, 0).y : 0.0,
    onBlock(p + RIGHT) ? texelFetch(slump, p + RIGHT, 0).x : 0.0,
    onBlock(p + UP) ? texelFetch(slump, p + UP, 0).w : 0.0,
    onBlock(p + DOWN) ? texelFetch(slump, p + DOWN, 0).z : 0.0
  ));
  here.r += shed - loose;
  here.g = here.g - loose + received;
  result = here;
}`;

/** one step of the model, in the order `step()` runs it */
export const SIM_PASSES: readonly ISimPass[] = [
  { name: 'rainFall', fragment: SHARED + RAIN, reads: ['land'], writes: 'land' },
  {
    name: 'pipeFlux',
    fragment: SHARED + PIPE_FLUX,
    reads: ['land', 'terrain', 'flux'],
    writes: 'flux',
  },
  { name: 'carry', fragment: SHARED + CARRY, reads: ['land', 'flux'], writes: 'land' },
  { name: 'flow: velocity', fragment: SHARED + VELOCITY, reads: ['land', 'flux'], writes: 'flow' },
  { name: 'flow: depth', fragment: SHARED + DEPTH, reads: ['land', 'flux'], writes: 'land' },
  {
    name: 'erode',
    fragment: SHARED + ERODE,
    reads: ['land', 'terrain', 'strata', 'flow'],
    writes: 'land',
  },
  { name: 'evaporate', fragment: SHARED + EVAPORATE, reads: ['land'], writes: 'land' },
  {
    name: 'slumpShed',
    fragment: SHARED + SLUMP_SHED,
    reads: ['land', 'terrain', 'strata'],
    writes: 'slump',
  },
  {
    name: 'slumpSettle',
    fragment: SHARED + SLUMP_SETTLE,
    reads: ['land', 'slump'],
    writes: 'land',
  },
];
