/**
 * Floor 0 — The Desk. The whole room, as one fragment shader.
 *
 * There is no geometry anywhere in this project. The lobby is a signed distance
 * function: a piece of arithmetic that, given a point in space, returns how far
 * that point is from the nearest surface. Rendering it means marching along each
 * pixel's ray in steps guaranteed not to overshoot, until the distance goes to
 * nothing. That is the technique, and per AUBADE's third argument it is also the
 * theme — a building made of distance functions is a building that is nowhere,
 * with no geometry, that resolves only when it is looked at directly.
 *
 * ## The three decisions that make this hold the frame budget
 *
 * **Bounding volumes around every fitting.** A naïve `mapScene` evaluates thirty
 * primitives to answer a question that, for most rays over most of their length,
 * is "the nearest thing is a wall, four metres away". Each cluster — the doorway
 * assembly, the desk, the key rack — is wrapped in a box that is tested first;
 * only when the ray is close enough for the detail to matter is the detail
 * evaluated. It costs one comparison and buys most of the frame rate.
 *
 * **The shaft has no shadow ray.** Volumetric light is normally the expensive
 * part: a shadow march per sample per pixel. Here the only opening is a
 * rectangle on a known plane, so asking whether a point in the air is lit is a
 * divide and a rectangle test — walk backwards along the moonlight to the plane
 * of the transom and see whether you land inside the glass. Twenty samples of
 * that cost less than one shadow march.
 *
 * **The desk's shadow in the air is a slab test.** The one occluder broad enough
 * for its absence to be noticeable gets an analytic ray-box intersection instead
 * of a march. Everything smaller is below the noise floor of the dust.
 *
 * ## What is deliberately absent
 *
 * No bloom, no depth of field, no temporal accumulation — no second pass at all.
 * Each of those wants a framebuffer, and a framebuffer at this resolution costs
 * more bandwidth than the whole march costs arithmetic. The lamp's halo is real
 * scattering inside the volumetric integral rather than a blur of bright pixels,
 * which is both cheaper and correct when something stands in front of it.
 *
 * The film grain at the end is not an affectation. This image lives in the
 * bottom eighth of an 8-bit range, where a gradient bands visibly; a dither
 * below the quantisation step is what makes the shadows read as continuous
 * rather than terraced.
 *
 * ## Conventions worth knowing before editing
 *
 * Room space is metres, +y up, +z towards the back wall, the camera looking
 * roughly +z from around (-0.7, 1.6, -3.6). A person is 1.7 units tall and every
 * dimension here was chosen against that rather than against what looked right
 * in clip space — which is why the door is 2.32m and not 2.
 *
 * Identifiers avoid `half`, `sample`, `input`, `output` and friends: all are
 * reserved in GLSL ES 3.00 and the resulting compile error names the line but
 * not the reason. Locals also avoid shadowing built-ins (`step`, `distance`,
 * `length`), which is legal and reads as a bug forever after.
 *
 * Uniform contract — `renderer.ts` is the only caller:
 *   uResolution         drawing-buffer size in pixels
 *   uTime               the room's clock in seconds (simulated, not wall clock)
 *   uEye, uTarget       camera pose from `camera/drift.ts`
 *   uRoll               camera roll in radians
 *   uMarchSteps         primary march iteration cap    ┐ the quality ladder,
 *   uShadowSteps        soft-shadow iteration cap      │ from `gl/quality.ts`
 *   uVolumetricSamples  samples along the view ray     ┘
 */
export const LOBBY_FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp int;

uniform vec2  uResolution;
uniform float uTime;
uniform vec3  uEye;
uniform vec3  uTarget;
uniform float uRoll;
uniform int   uMarchSteps;
uniform int   uShadowSteps;
uniform int   uVolumetricSamples;

out vec4 fragColour;

// ---------------------------------------------------------------------------
// The room, in metres
// ---------------------------------------------------------------------------
const float ROOM_HALF_WIDTH = 4.6;
const float ROOM_HEIGHT     = 4.0;
const float BACK_WALL_Z     = 2.2;
const float FRONT_WALL_Z    = -7.0;

const float DOOR_X         = -1.85;
const vec2  TRANSOM_CENTRE = vec2(-1.85, 2.72);
const vec2  TRANSOM_HALF   = vec2(0.55, 0.34);

// The desk as a bounding box, used twice: to skip its detail when a ray is
// nowhere near it, and to shadow the dust analytically.
const vec3 DESK_MIN = vec3(0.35, 0.00, -0.70);
const vec3 DESK_MAX = vec3(2.86, 1.22,  0.41);

// Material identifiers. Floats because the map returns a vec2, and carrying a
// parallel integer would cost more than the comparisons it saves.
const float MAT_FLOOR    = 1.0;
const float MAT_PLASTER  = 2.0;
const float MAT_TIMBER   = 3.0;
const float MAT_BRASS    = 4.0;
const float MAT_MARBLE   = 5.0;
const float MAT_GLASS    = 6.0;
const float MAT_ENAMEL   = 7.0;
const float MAT_PAPER    = 8.0;
const float MAT_FILAMENT = 9.0;

const float SURFACE_EPSILON = 0.0013;
const float MAX_DISTANCE    = 34.0;

// How far outside a bounding box a ray may be before the box stands in for its
// contents. Comfortably above SURFACE_EPSILON, so a ray can never terminate on
// a bound and be shaded as whatever material the bound happened to claim.
const float BOUND_SLACK = 0.22;

// ---------------------------------------------------------------------------
// The light rig: a moon and a lamp, which is what a closed room at night has
// ---------------------------------------------------------------------------

// Pre-normalised. A const initialiser calling normalize() is legal ES 3.00 but
// has tripped older mobile compilers, and this is not a thing to discover on
// someone else's phone.
//
// The aim took three attempts and is worth recording, because the mistake is
// not obvious from the numbers. The light travels towards −z, which means it
// lights the faces *pointing away* from the camera — so a beam aimed at the
// desk lands entirely on surfaces nobody can see, and the room reads as though
// the window is not doing anything. What has to be in shot is where the beam
// *stops*.
//
// So it is aimed at the floor at (−0.4, 0, 0.6): open marble, left of centre,
// clear of the desk. Steeper than it first was, because a shallow beam puts its
// pool almost under the camera where the frame crops it off — the flatter the
// angle, the further towards the viewer the light lands.
const vec3  MOON_DIRECTION = vec3(0.4175, -0.7833, -0.4607);
const vec3  MOON_COLOUR    = vec3(0.42, 0.58, 0.92);
const float MOON_STRENGTH  = 3.4;

const vec3  LAMP_POSITION = vec3(2.45, 1.442, -0.35);
const vec3  LAMP_COLOUR   = vec3(1.00, 0.55, 0.20);
const float LAMP_STRENGTH = 3.4;

// 46 degrees of vertical field of view: wide enough to hold a room, narrow
// enough that the near corner of the desk is not distorted into a wedge.
const float FOCAL_LENGTH = 2.35;

// ---------------------------------------------------------------------------
// Distance primitives — Inigo Quilez's canonical forms
// ---------------------------------------------------------------------------

float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float sdCylinderY(vec3 p, float halfHeight, float radius) {
  vec2 d = vec2(length(p.xz) - radius, abs(p.y) - halfHeight);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

float sdCappedCone(vec3 p, float h, float rLow, float rHigh) {
  vec2 q  = vec2(length(p.xz), p.y);
  vec2 k1 = vec2(rHigh, h);
  vec2 k2 = vec2(rHigh - rLow, 2.0 * h);
  vec2 ca = vec2(q.x - min(q.x, q.y < 0.0 ? rLow : rHigh), abs(q.y) - h);
  vec2 cb = q - k1 + k2 * clamp(dot(k1 - q, k2) / dot(k2, k2), 0.0, 1.0);
  float s = (cb.x < 0.0 && ca.y < 0.0) ? -1.0 : 1.0;
  return s * sqrt(min(dot(ca, ca), dot(cb, cb)));
}

/** Union of two (distance, material) pairs, keeping the nearer one's material. */
vec2 nearer(vec2 a, vec2 b) {
  return a.x < b.x ? a : b;
}

/** Cut \`hole\` out of \`solid\`. Under-estimates distance, which is the safe direction. */
float carve(float solid, float hole) {
  return max(solid, -hole);
}

// ---------------------------------------------------------------------------
// The fittings. Each is bounded by the caller and assumes the ray is close.
// ---------------------------------------------------------------------------

/**
 * The doorway: architrave, a closed door with two recessed panels and a lever,
 * the mullion, and the glazed transom above it.
 *
 * The door stays shut. It is why the transom is the only aperture, and a single
 * aperture is why the shaft has edges — a room with two windows has ambient
 * light and no drama.
 *
 * Depths, front (towards the camera, lower z) to back: lever 2.033, rose 2.063,
 * door face 2.110, architrave face 2.060, wall 2.200. The architrave is proud of
 * the door and the door is recessed into the opening, which is the way round
 * joinery actually goes and reads wrong immediately when it is not.
 */
vec2 mapDoorway(vec3 p) {
  vec3 q = p - vec3(DOOR_X, 0.0, 0.0);

  // Architrave: a flat band around the opening, standing 140mm proud of the wall.
  float outer = sdBox(q - vec3(0.0, 1.55, 2.130), vec3(0.700, 1.610, 0.070));
  float inner = sdBox(q - vec3(0.0, 1.53, 2.130), vec3(0.585, 1.530, 0.140));
  vec2 res = vec2(carve(outer, inner), MAT_TIMBER);

  // The door itself, with two recessed panels.
  float slab      = sdBox(q - vec3(0.0, 1.16, 2.152), vec3(0.565, 1.160, 0.042));
  float panelHigh = sdBox(q - vec3(0.0, 1.58, 2.090), vec3(0.385, 0.470, 0.050));
  float panelLow  = sdBox(q - vec3(0.0, 0.52, 2.090), vec3(0.385, 0.380, 0.050));
  res = nearer(res, vec2(carve(slab, min(panelHigh, panelLow)), MAT_TIMBER));

  // Lever handle. Small, and the first thing that tells a viewer the scale of
  // everything else in the frame.
  vec3 handle = q - vec3(0.42, 1.02, 2.085);
  float rose  = sdCylinderY(handle.xzy, 0.022, 0.036);
  float lever = sdBox(handle - vec3(-0.045, 0.0, -0.027), vec3(0.070, 0.013, 0.018)) - 0.007;
  res = nearer(res, vec2(min(rose, lever), MAT_BRASS));

  // Mullion between the door head and the transom.
  res = nearer(res, vec2(sdBox(q - vec3(0.0, 2.35, 2.160), vec3(0.585, 0.030, 0.050)), MAT_TIMBER));

  // The transom. In frame on purpose: a shaft whose origin you cannot see is an
  // effect, and a shaft you can trace back to a window is a room.
  res = nearer(res, vec2(sdBox(q - vec3(0.0, 2.72, 2.175), vec3(0.550, 0.340, 0.008)), MAT_GLASS));

  // Two glazing bars across the pane. abs() folds one box into two.
  vec3 bar = q - vec3(0.0, 2.72, 2.155);
  bar.x = abs(bar.x) - 0.183;
  res = nearer(res, vec2(sdBox(bar, vec3(0.012, 0.340, 0.016)), MAT_TIMBER));

  return res;
}

/** The desk, and the three things on it: a bell, the register, a lamp. */
vec2 mapDesk(vec3 p) {
  // Plinth, then a counter that overhangs towards the visitor — which is what
  // makes a desk a desk rather than a block.
  vec2 res = vec2(sdBox(p - vec3(1.60, 0.550, -0.10), vec3(1.150, 0.550, 0.450)), MAT_TIMBER);

  // A moulded band across the front, at the height a hand rests.
  res = nearer(res, vec2(sdBox(p - vec3(1.60, 0.880, -0.562), vec3(1.130, 0.045, 0.012)), MAT_TIMBER));

  float counter = sdBox(p - vec3(1.60, 1.150, -0.140), vec3(1.240, 0.048, 0.530)) - 0.014;
  res = nearer(res, vec2(counter, MAT_MARBLE));

  // Brass nosing along the counter's front edge: the only hard specular
  // highlight in the lower half of the frame, and the thing the moon catches.
  res = nearer(res, vec2(sdBox(p - vec3(1.60, 1.098, -0.686), vec3(1.230, 0.012, 0.012)), MAT_BRASS));

  // The bell. Nobody rings it.
  vec3 bell   = p - vec3(0.92, 1.212, -0.30);
  float dome  = max(length(bell) - 0.068, -bell.y);
  float plate = sdCylinderY(bell - vec3(0.0, 0.005, 0.0), 0.007, 0.090);
  float knob  = length(bell - vec3(0.0, 0.078, 0.0)) - 0.015;
  res = nearer(res, vec2(min(min(dome, plate), knob), MAT_BRASS));

  // The register, open. The phase that lists prior guests fills it in; for now
  // it is a prop, and the
  // brightest thing the lamp touches.
  float ledger = sdBox(p - vec3(1.72, 1.230, -0.22), vec3(0.260, 0.016, 0.185)) - 0.005;
  res = nearer(res, vec2(ledger, MAT_PAPER));

  // The lamp: brass base and stem, green enamel shade, a filament peeping below.
  vec3 lamp  = p - vec3(2.45, 1.212, -0.35);
  float base = sdCylinderY(lamp - vec3(0.0, 0.013, 0.0), 0.013, 0.070);
  float stem = sdCylinderY(lamp - vec3(0.0, 0.150, 0.0), 0.150, 0.010);
  res = nearer(res, vec2(min(base, stem), MAT_BRASS));
  res = nearer(res, vec2(sdCappedCone(lamp - vec3(0.0, 0.302, 0.0), 0.070, 0.112, 0.046), MAT_ENAMEL));
  res = nearer(res, vec2(length(lamp - vec3(0.0, 0.230, 0.0)) - 0.029, MAT_FILAMENT));

  return res;
}

/**
 * The key rack on the back wall: thirty-five pigeonholes, from two boxes.
 *
 * Clamped domain repetition. The clamp is not tidiness — repeating without one
 * tiles the entire room with key slots and, worse, breaks the Lipschitz bound
 * the march depends on, so rays tunnel through walls in a way that looks like a
 * driver bug and is not.
 */
vec2 mapKeyRack(vec3 p) {
  vec3 q = p - vec3(2.15, 2.20, 2.06);
  float carcass = sdBox(q, vec3(1.05, 0.62, 0.14));

  // Spacing and cell size are set so the outermost row and column still leave a
  // solid margin inside the carcass: 0.84 + 0.105 < 1.05 across, 0.50 + 0.085 <
  // 0.62 up. Overshoot that and the top edge of the rack comes out notched like
  // a battlement, which is unmistakable and took a rendered frame to spot.
  vec3 cell = q;
  cell.x -= clamp(floor(q.x / 0.28 + 0.5), -3.0, 3.0) * 0.28;
  cell.y -= clamp(floor(q.y / 0.25 + 0.5), -2.0, 2.0) * 0.25;
  float holes = sdBox(cell - vec3(0.0, 0.0, -0.10), vec3(0.105, 0.085, 0.26));

  return vec2(carve(carcass, holes), MAT_TIMBER);
}

// ---------------------------------------------------------------------------
// The scene
// ---------------------------------------------------------------------------

/**
 * Distance to the nearest surface, and what that surface is made of.
 *
 * The shell is exact rather than a box: the interior of a convex room is the
 * minimum of its walls' perpendicular distances, so it is five planes and no
 * primitive at all. Everything else sits behind a bounding test.
 */
vec2 mapScene(vec3 p) {
  vec2 res = vec2(p.y, MAT_FLOOR);
  res = nearer(res, vec2(ROOM_HEIGHT - p.y, MAT_PLASTER));
  res = nearer(res, vec2(ROOM_HALF_WIDTH - abs(p.x), MAT_PLASTER));
  res = nearer(res, vec2(p.z - FRONT_WALL_Z, MAT_PLASTER));

  // The back wall, with the door and transom openings cut from it. Both are
  // filled by the doorway assembly below, so no ray ever escapes the room.
  float back    = BACK_WALL_Z - p.z;
  float opening = sdBox(p - vec3(DOOR_X, 1.16, BACK_WALL_Z), vec3(0.585, 1.16, 0.5));
  float glazed  = sdBox(p - vec3(TRANSOM_CENTRE, BACK_WALL_Z), vec3(0.55, 0.34, 0.5));
  res = nearer(res, vec2(carve(back, min(opening, glazed)), MAT_PLASTER));

  // Skirting: a band along the foot of every wall, 55mm proud and 150mm tall,
  // carved back out at the doorway. Cheap, and one of the two or three details
  // that decide whether a raymarched interior reads as a room or as boxes.
  float toWall   = min(ROOM_HALF_WIDTH - abs(p.x), min(BACK_WALL_Z - p.z, p.z - FRONT_WALL_Z));
  float skirting = max(toWall - 0.055, p.y - 0.15);
  res = nearer(res, vec2(carve(skirting, opening), MAT_TIMBER));

  // The bounded fittings. Above the slack the bound itself is a perfectly good
  // distance, and its material is never shaded because a ray cannot terminate
  // that far from a surface.
  float doorBound = sdBox(p - vec3(DOOR_X, 1.62, 2.05), vec3(0.78, 1.62, 0.30));
  res = doorBound > BOUND_SLACK
    ? nearer(res, vec2(doorBound, MAT_TIMBER))
    : nearer(res, mapDoorway(p));

  float deskBound = sdBox(p - vec3(1.72, 0.80, -0.14), vec3(1.42, 0.82, 0.64));
  res = deskBound > BOUND_SLACK
    ? nearer(res, vec2(deskBound, MAT_TIMBER))
    : nearer(res, mapDesk(p));

  float rackBound = sdBox(p - vec3(2.15, 2.20, 2.06), vec3(1.08, 0.65, 0.17));
  res = rackBound > BOUND_SLACK
    ? nearer(res, vec2(rackBound, MAT_TIMBER))
    : nearer(res, mapKeyRack(p));

  return res;
}

/**
 * Surface normal by the tetrahedron trick: four samples from the corners of a
 * regular tetrahedron rather than six for central differences. A third cheaper,
 * and indistinguishable on anything that is not a mirror.
 */
vec3 sceneNormal(vec3 p) {
  const vec2 k = vec2(1.0, -1.0);
  const float h = 0.0018;
  return normalize(
    k.xyy * mapScene(p + k.xyy * h).x +
    k.yyx * mapScene(p + k.yyx * h).x +
    k.yxy * mapScene(p + k.yxy * h).x +
    k.xxx * mapScene(p + k.xxx * h).x
  );
}

/** March until something is hit. Returns (distance travelled, material or -1). */
vec2 march(vec3 origin, vec3 rayDirection) {
  float travelled = 0.02;
  float material  = -1.0;

  for (int i = 0; i < uMarchSteps; i++) {
    vec2 hit = mapScene(origin + rayDirection * travelled);

    // The epsilon widens with distance: a surface a metre away deserves a
    // tighter one than the far wall, and using the tight one everywhere spends
    // steps resolving detail finer than a pixel.
    if (hit.x < SURFACE_EPSILON * max(travelled, 1.0)) {
      material = hit.y;
      break;
    }

    travelled += hit.x;
    if (travelled > MAX_DISTANCE) {
      break;
    }
  }

  return vec2(travelled, material);
}

/**
 * Soft shadows, by the penumbra estimate a distance field gives away for free:
 * how close the shadow ray passed to an occluder, over how far it had come when
 * it did. No sampling, no jitter, no noise.
 */
float softShadow(vec3 origin, vec3 rayDirection, float maxDistance) {
  float shade = 1.0;
  float t = 0.03;

  for (int i = 0; i < uShadowSteps; i++) {
    float h = mapScene(origin + rayDirection * t).x;
    if (h < 0.0008) {
      return 0.0;
    }
    shade = min(shade, 12.0 * h / t);
    t += clamp(h, 0.02, 0.32);
    if (t > maxDistance) {
      break;
    }
  }

  return clamp(shade, 0.0, 1.0);
}

/** Four-tap ambient occlusion: enough to seat objects on the floor, and no more is visible. */
float ambientOcclusion(vec3 p, vec3 n) {
  float occlusion = 0.0;
  float weight = 1.0;

  for (int i = 1; i <= 4; i++) {
    float reach = 0.035 * float(i);
    occlusion += weight * (reach - mapScene(p + n * reach).x);
    weight *= 0.62;
  }

  return clamp(1.0 - 2.6 * occlusion, 0.0, 1.0);
}

// ---------------------------------------------------------------------------
// The moonlight, analytically
// ---------------------------------------------------------------------------

/**
 * The moonlight reaching a point: how much of the transom it can see, and how
 * far away that transom is along the light.
 *
 * Walk backwards along the moonlight to the plane of the back wall and ask
 * whether the point you land on is inside the glass. That is the entire aperture
 * model, and it is why the shaft costs nothing: no shadow ray leaves here.
 *
 * The distance comes back as well because the shadow march needs it, and needs
 * it badly. The transom is real geometry — the pane is in mapScene so that it
 * can be *seen* — which means a shadow ray fired at the moon hits the window and
 * reports the window as an occluder. The light source shadows itself, the pool
 * on the floor never appears, and the room stays dark for a reason no amount of
 * turning the brightness up will fix. Capping the march just short of the pane
 * is the fix, and this is the number to cap it with.
 *
 * The aperture edge is softened over a few centimetres. A mathematically hard
 * boundary on a beam of light is the single most reliable way to make an image
 * read as computer graphics rather than as a photograph of a room.
 *
 * @return x: admittance in [0, 1]. y: metres back to the pane, or 0 behind it.
 */
vec2 transomBeam(vec3 p) {
  float travel = (p.z - BACK_WALL_Z) / MOON_DIRECTION.z;
  if (travel <= 0.0) {
    return vec2(0.0);
  }
  vec2 onPane  = p.xy - MOON_DIRECTION.xy * travel;
  vec2 outside = abs(onPane - TRANSOM_CENTRE) - TRANSOM_HALF;
  return vec2(1.0 - smoothstep(-0.055, 0.015, max(outside.x, outside.y)), travel);
}

/**
 * Whether the desk stands between a point and the transom, as a ray-box slab
 * test rather than a march.
 *
 * The desk is the only occluder broad enough that its shadow *in the air* is
 * noticeable. Without this, dust glows inside the wedge the desk should be
 * keeping dark, and the shaft stops looking like it is made of light.
 */
float deskShadow(vec3 p) {
  vec3 inverseDirection = 1.0 / (-MOON_DIRECTION);
  vec3 a = (DESK_MIN - p) * inverseDirection;
  vec3 b = (DESK_MAX - p) * inverseDirection;
  vec3 low  = min(a, b);
  vec3 high = max(a, b);
  float enter = max(max(low.x, low.y), low.z);
  float leave = min(min(high.x, high.y), high.z);
  return (leave > max(enter, 0.0)) ? 0.0 : 1.0;
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

/** Albedo, plus how rough the surface is and whether it is a metal. */
vec3 surfaceAlbedo(float id, vec3 p, out float roughness, out float metallic) {
  roughness = 0.7;
  metallic  = 0.0;

  if (id == MAT_FLOOR) {
    // Chequered marble in 600mm tiles, with a grout line and some veining.
    // Sines rather than a noise function: the veining is seen at a glancing
    // angle through a metre of dust and nobody is going to audit its spectrum.
    vec2 tile = floor(p.xz / 0.6);
    float dark = mod(tile.x + tile.y, 2.0);
    vec2 within = abs(fract(p.xz / 0.6) - 0.5);
    float grout = smoothstep(0.47, 0.495, max(within.x, within.y));

    float vein = sin(p.x * 3.1 + sin(p.z * 1.7) * 2.2) * 0.5 + 0.5;
    vein = pow(vein, 8.0) * 0.09;

    vec3 pale = vec3(0.092, 0.101, 0.097) + vein;
    vec3 deep = vec3(0.021, 0.026, 0.025) + vein * 0.35;
    roughness = 0.16;
    return mix(pale, deep, dark) * (1.0 - grout * 0.55);
  }

  if (id == MAT_PLASTER) {
    roughness = 0.92;
    return vec3(0.088, 0.074, 0.079);
  }
  if (id == MAT_TIMBER) {
    // Mahogany, nearly black until something warm touches it. The grain is one
    // stretched sine, running *vertically* — which is how a door is hung and a
    // desk front is veneered, and the horizontal version of this read
    // immediately and unmistakably as corduroy.
    float grain = sin(p.x * 27.0 + sin(p.y * 2.2) * 1.4) * 0.0045;
    roughness = 0.42;
    return vec3(0.058, 0.029, 0.026) + grain;
  }
  if (id == MAT_BRASS) {
    roughness = 0.24;
    metallic  = 1.0;
    return vec3(0.72, 0.52, 0.24);
  }
  if (id == MAT_MARBLE) {
    roughness = 0.14;
    return vec3(0.040, 0.055, 0.048);
  }
  if (id == MAT_ENAMEL) {
    roughness = 0.20;
    return vec3(0.028, 0.052, 0.038);
  }
  if (id == MAT_PAPER) {
    // Old paper, not printer paper. At 0.46 it was the brightest thing in the
    // frame by some distance and pulled the eye off the window.
    roughness = 0.95;
    return vec3(0.33, 0.29, 0.24);
  }

  roughness = 0.5;
  return vec3(0.1);
}

/** Blinn-Phong specular. Cheap, and the right shape for a room lit by two soft sources. */
float specularLobe(vec3 n, vec3 viewDirection, vec3 lightDirection, float roughness) {
  vec3 halfway = normalize(lightDirection - viewDirection);
  float power = 2.0 / max(roughness * roughness * roughness, 0.0008);
  return pow(max(dot(n, halfway), 0.0), power) * (power + 8.0) / 64.0;
}

/** Everything that lands on one surface point. */
vec3 shadeSurface(vec3 p, vec3 n, vec3 viewDirection, float id) {
  // Two of the materials are their own picture. The pane and the filament are
  // emitters, not surfaces; lighting them would only make them grey.
  if (id == MAT_GLASS) {
    float up = clamp((p.y - TRANSOM_CENTRE.y + TRANSOM_HALF.y) / (TRANSOM_HALF.y * 2.0), 0.0, 1.0);
    return MOON_COLOUR * (1.5 + up * 1.4);
  }
  if (id == MAT_FILAMENT) {
    return LAMP_COLOUR * 5.0;
  }

  float roughness;
  float metallic;
  vec3 albedo = surfaceAlbedo(id, p, roughness, metallic);

  vec3 toMoon = -MOON_DIRECTION;
  float moonFacing = max(dot(n, toMoon), 0.0);
  vec2 beam = transomBeam(p);
  float admitted = beam.x;

  // Both gates are needed and they do different jobs: admittance decides whether
  // the point is inside the beam at all, the march decides whether something in
  // the room is standing in the way. Skipping the march when the point is
  // outside the beam is the largest single saving in this shader — most of the
  // floor is not lit by the moon and now pays nothing to establish that.
  //
  // The march stops short of the pane, for the reason in transomBeam: the
  // window is geometry, and a shadow ray allowed to reach it finds the light
  // source and calls it an occluder.
  //
  // The cap is a *fraction* of the distance rather than a fixed margin, and
  // that is the whole subtlety. This is a penumbra estimate: it darkens by
  // hardness × h / t, so how close the ray may pass to something before it
  // counts as shade grows with how far it has come. A fixed 100mm looked ample
  // and still dimmed the pool to a third of its value at four metres out —
  // visible only as "the moonlight does not seem to land anywhere", which is a
  // remarkably hard thing to trace back to a margin.
  //
  // Fifteen percent also, conveniently, blinds the march to the architrave's
  // reveal, whose shadow the softened aperture edge is already drawing.
  float moonShadow = (admitted > 0.001 && moonFacing > 0.0)
    ? softShadow(p, toMoon, beam.y * 0.85)
    : 0.0;
  float moon = moonFacing * admitted * moonShadow;

  vec3 toLamp = LAMP_POSITION - p;
  float lampRange = length(toLamp);
  toLamp /= max(lampRange, 0.0001);
  // The shade is opaque and open at the bottom, so the lamp throws down and
  // sideways but not up. A mask on the light's vertical component is the whole
  // model, and it costs one smoothstep instead of a shadow march.
  float shadeMask = smoothstep(0.35, -0.30, toLamp.y);
  float lamp = max(dot(n, toLamp), 0.0) * shadeMask / (1.0 + lampRange * lampRange * 1.35);

  // Ambient: a hemisphere, cool from the ceiling and faintly warm off the floor.
  // Two constants standing in for a bounce solution, which at these light levels
  // is all anyone can tell apart.
  float sky = n.y * 0.5 + 0.5;
  // Kept low on purpose. Ambient is the enemy of a single-source room: raise it
  // until everything is legible and the shaft stops being the brightest thing
  // in the frame, at which point the picture is a lit room with a window in it
  // rather than a dark room the moon has got into.
  vec3 ambient = mix(vec3(0.022, 0.019, 0.024), vec3(0.027, 0.033, 0.050), sky);

  float occlusion = ambientOcclusion(p, n);

  vec3 diffuse = albedo * (
    MOON_COLOUR * MOON_STRENGTH * moon +
    LAMP_COLOUR * LAMP_STRENGTH * lamp +
    ambient * occlusion * 3.0
  );

  vec3 gloss =
    MOON_COLOUR * MOON_STRENGTH * moon * specularLobe(n, viewDirection, toMoon, roughness) +
    LAMP_COLOUR * LAMP_STRENGTH * lamp * specularLobe(n, viewDirection, toLamp, roughness);

  // Metals have no diffuse term at all; their colour lives in the specular.
  vec3 specularTint = mix(vec3(1.0), albedo, metallic);
  float fresnel = pow(1.0 - max(dot(n, -viewDirection), 0.0), 5.0);
  float reflectivity = mix(0.04 + fresnel * 0.5, 1.0, metallic);

  return mix(diffuse, vec3(0.0), metallic) + gloss * specularTint * reflectivity * occlusion;
}

// ---------------------------------------------------------------------------
// The shaft
// ---------------------------------------------------------------------------

/** One hash, used for the dust glints and, at the very end, for the grain. */
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

/**
 * Dust density at a point.
 *
 * Three sines rather than value noise, which would be eight hashes per sample
 * and twenty samples per pixel. Dust inside a beam has no structure worth
 * resolving — what sells it is that it moves slowly and unevenly, which three
 * incommensurable sines do for a twentieth of the cost.
 */
float dustDensity(vec3 p) {
  vec3 q = p * vec3(1.9, 2.6, 2.1) + vec3(0.0, -uTime * 0.055, uTime * 0.021);
  float body = sin(q.x) * sin(q.y * 1.27 + 1.7) * sin(q.z * 0.83 + 3.1);
  return 0.55 + 0.45 * body;
}

/**
 * Integrate light scattered towards the camera along the view ray.
 *
 * Two contributions: the moon's beam, gated by the transom aperture and the
 * desk's slab shadow, and a soft halo around the lamp. The halo is real
 * scattering rather than a screen-space blur — cheaper than a second pass, and
 * correct when something stands in front of the lamp.
 *
 * The start offset is dithered per pixel. Without it, twenty samples across four
 * metres band into twenty visible shells; with it the same twenty read as grain,
 * which the film grain at the end then absorbs.
 */
vec3 scatteredLight(vec3 origin, vec3 rayDirection, float depth, float dither) {
  int sampleCount = max(uVolumetricSamples, 1);
  float span = min(depth, 13.0);
  float stepLength = span / float(sampleCount);

  vec3 accumulated = vec3(0.0);

  for (int i = 0; i < sampleCount; i++) {
    vec3 p = origin + rayDirection * ((float(i) + dither) * stepLength);

    float beam = transomBeam(p).x;
    if (beam > 0.002) {
      float glint = 0.85 + 0.5 * hash13(floor(p * 26.0) + floor(uTime * 3.0));
      accumulated += MOON_COLOUR * beam * deskShadow(p) * dustDensity(p) * glint * 0.055;
    }

    float lampRange = length(LAMP_POSITION - p);
    accumulated += LAMP_COLOUR * 0.010 / (1.0 + lampRange * lampRange * lampRange * 2.2);
  }

  return accumulated * stepLength;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/** Narkowicz's ACES fit. One polynomial, and it keeps the moon from going cyan. */
vec3 tonemap(vec3 colour) {
  // Exposure. Set by eye against a 3am interior and then left alone: this is the
  // knob that is tempting to reach for whenever anything looks wrong, and almost
  // never the one that is actually wrong.
  colour *= 1.15;
  return clamp((colour * (2.51 * colour + 0.03)) / (colour * (2.43 * colour + 0.59) + 0.14), 0.0, 1.0);
}

/** Interleaved gradient noise — the standard cheap per-pixel dither. */
float interleavedGradient(vec2 pixel) {
  return fract(52.9829189 * fract(dot(pixel, vec2(0.06711056, 0.00583715))));
}

void main() {
  // Screen coordinates: y up, x scaled by aspect so the room does not stretch.
  vec2 uv = (gl_FragCoord.xy * 2.0 - uResolution) / uResolution.y;

  vec3 forward = normalize(uTarget - uEye);
  vec3 right   = normalize(cross(vec3(0.0, 1.0, 0.0), forward));
  vec3 up      = cross(forward, right);

  // Roll is applied to the basis rather than to the ray: two sines per pixel
  // instead of a matrix multiply.
  float rollSin = sin(uRoll);
  float rollCos = cos(uRoll);
  vec3 rolledRight = right * rollCos + up * rollSin;
  vec3 rolledUp    = up * rollCos - right * rollSin;

  vec3 rayDirection = normalize(rolledRight * uv.x + rolledUp * uv.y + forward * FOCAL_LENGTH);

  vec2 hit = march(uEye, rayDirection);

  vec3 colour = vec3(0.0);
  if (hit.y >= 0.0) {
    vec3 p = uEye + rayDirection * hit.x;
    colour = shadeSurface(p, sceneNormal(p), rayDirection, hit.y);
  }

  colour += scatteredLight(uEye, rayDirection, hit.x, interleavedGradient(gl_FragCoord.xy));

  // A vignette, because this is looking into a room rather than at a scene.
  // Gentle enough to be felt rather than seen.
  colour *= 1.0 - 0.075 * dot(uv, uv);

  colour = tonemap(colour);
  colour = pow(colour, vec3(1.0 / 2.2));

  // Grain, below the quantisation step, for the reason in the file comment.
  colour += (hash13(vec3(gl_FragCoord.xy, fract(uTime) * 601.0)) - 0.5) * 0.016;

  fragColour = vec4(colour, 1.0);
}
`;
