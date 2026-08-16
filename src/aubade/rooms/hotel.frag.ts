/**
 * The hotel: three floors, one program, and the lift between them.
 *
 * The whole program: shared primitives, every floor's geometry, the shading, and
 * the scene that mixes them. Six source strings, concatenated at the bottom in
 * declaration order, because GLSL has no forward declarations and the compiler
 * reports the omission as an undeclared identifier a long way from anything a
 * person would think to look at.
 *
 * ## Why this is one file and not five
 *
 * It was five, briefly, and the toolchain would not have it. The five strings are
 * imported by `scripts/verify-shader.mjs`, which Node runs directly against the
 * TypeScript source — and Node's ESM resolver has no extensionless resolution, so
 * a relative import between them has to name `./common.glsl.ts` outright.
 * TypeScript allows that only under `allowImportingTsExtensions`, which requires
 * `noEmit`, which an Angular build is not. Neither does Node map a `.js`
 * specifier back onto a `.ts` file. There is no spelling of that import which
 * satisfies both, so the parts that were four modules are four constants, each
 * keeping the comment it had when it was a file.
 *
 * The one thing to hold onto from the arrangement it replaced is the reason the
 * shading is split from the primitives and sits *below* every floor: the floors'
 * geometry needs the primitives and the material identifiers, and `surfaceAlbedo`
 * needs the corridor's dimensions and the library's shelving, so the order is
 *
 *   header · PRIMITIVES · lobby · corridor · library · SHADING · scene
 *
 * and it is not negotiable in either direction.
 *
 * ## The elevator is a mix, and that is why there is only one program
 *
 * AUBADE describes the lift as "a timed morph between two distance fields, visible
 * and unhurried", and as a room rather than a transition. Taken literally — which
 * is the correct way to take it — that settles the architecture on its own. Two
 * distance fields cannot be mixed across two compiled programs, so every floor is
 * in this one, and `uDepth` chooses between them. It counts floors below the
 * lobby, so it names a position in the building rather than progress through one
 * ride:
 *
 *   uDepth = 0            the lobby's field, exactly
 *   0 < uDepth < 1        lobby and corridor evaluated and mixed — a ride
 *   uDepth = 1            the corridor's field, exactly
 *   1 < uDepth < 2        corridor and library evaluated and mixed — a ride
 *   uDepth = 2            the library's field, exactly
 *
 * AUBADE's phase note says a third room does not extend a two-room design for
 * free, and names the fork: either `mapScene` starts branching on which pair is
 * being mixed, or the lift stops being a mix and becomes a fade. The branch is
 * what was taken. The fade was rejected because a cross-fade between two rendered
 * images is a dissolve, and the whole claim being made about this elevator is that
 * it is not one — and because it would have doubled the cost of the frame rather
 * than of the map.
 *
 * That the mix is a legitimate distance field is not luck and is worth writing
 * down, because the alternative fails in a way that looks like a driver bug. A
 * march is only safe if the function it steps along never over-estimates the
 * distance to a surface — formally, if it is 1-Lipschitz. A convex combination of
 * two 1-Lipschitz functions is 1-Lipschitz. So `mix(a, b, t)` of two valid fields
 * is a valid field at every t, and the ride cannot tunnel through a wall no matter
 * where it is paused.
 *
 * The material is *chosen* rather than blended, because material identifiers are
 * labels and not a linear space: mixing MAT_TIMBER with MAT_MIRROR gives 7, which
 * is enamel, and a corridor that turns briefly green halfway down is not the
 * effect anybody wanted.
 *
 * Which one is chosen took a rendered frame to get right. The obvious rule is to
 * snap at the halfway point, and it is wrong in a way that is invisible in the
 * arithmetic and obvious in the picture: every bright thing in this building is an
 * emitter with its own material — the transom pane, the filament, the sconces, the
 * shaft — so a hard swap at t = 0.5 takes away all of Floor 0's highlights before
 * any of Floor −1's have arrived, and the ride sags through the middle into a
 * grey mush with no light in it anywhere. The shader gate caught it as a frame
 * with 55 distinct brightness levels in it.
 *
 * So the material follows whichever room's surface is actually nearer, biased by
 * the lift so that each endpoint is exact. Halfway down, a ray that lands where
 * the transom still is gets the transom; one that lands where a sconce has arrived
 * gets the sconce; and the descent keeps a highlight in frame the whole way.
 *
 * ## What the endpoints buy
 *
 * The two branches at the top of `mapScene` are the reason the descent costs
 * nothing once it has finished. A settled floor evaluates one room, exactly as it
 * did when there was only one room to evaluate; only the ride pays for both, for
 * seven and a half seconds, and the governor in `gl/quality.ts` will drop a rung
 * underneath it if a machine cannot hold the budget through that.
 *
 * The same threshold gates the mirror, and there the reason is as much dramatic as
 * it is arithmetic. The mirror is a second march — the most expensive thing in the
 * piece — and running it through the morph would put the frame's peak cost exactly
 * where its peak spectacle already is. It also would not read: a reflection forming
 * inside a room that is itself still forming is noise. So the corridor arrives
 * first, and the mirror wakes when it has. What a visitor sees is a room resolving,
 * and then, a moment later, the wall on their left turning out to be something.
 *
 * ## Uniform contract — `renderer.ts` is the only caller
 *
 *   uResolution         drawing-buffer size in pixels
 *   uTime               the room's clock in seconds (simulated, not wall clock)
 *   uEye, uTarget       camera pose from `camera/drift.ts`
 *   uRoll               camera roll in radians
 *   uDepth              the lift: 0 Floor 0, 1 Floor −1, 2 Floor −2
 *   uMarchSteps         primary march iteration cap    ┐ the quality ladder,
 *   uShadowSteps        soft-shadow iteration cap      │ from `gl/quality.ts`
 *   uVolumetricSamples  samples along the view ray     ┘
 *   uKeyDirection       unit vector the moonlight travels along   ┐
 *   uKeyColour          moonlight, pre-dawn sky, sunrise, or day  │
 *   uKeyStrength        pre-tonemap drive on the key              │
 *   uPaneColour         what the transom itself reads as          │ Floor 0's rig,
 *   uPaneStrength       the pane's emitted strength               │ from
 *   uLampStrength       the desk lamp; 0 in daylight              │ `rooms/
 *   uAmbientFloor       warm half of the ambient hemisphere       │ light-rig.ts`
 *   uAmbientSky         cool half, driven by the sky              │
 *   uDust               scattering in the air, night = 1          │
 *   uShutter            louvres over the transom, 0 or 1          │
 *   uBleach             how sun-faded the palette is              │
 *   uExposure           stop into the tonemap                     ┘
 *   uThreshold          daylight under the door — the invitation's mark
 *   uSconceColour       the corridor's own light                  ┐
 *   uSconceStrength     how much of it is left at this hour       │ Floor −1's rig,
 *   uShaftDirection     unit vector the daylight travels along    │ from
 *   uShaftColour        what comes down the lift shaft            │ `rooms/
 *   uShaftStrength      0 at every hour but the shuttered one     │ corridor-rig.ts`
 *   uCorridorFloor      warm half of the corridor's ambient       │
 *   uCorridorSky        cool half                                 │
 *   uCorridorDust       scattering in the corridor's air          ┘
 *   uReadingColour      the library's lamps                       ┐
 *   uReadingStrength    how hard they are driven — every hour     │ Floor −2's rig,
 *   uInk                how much writing is left; 0 at noon       │ from
 *   uLibraryExposure    this floor's stop, which no hour moves    │
 *   uLibraryFloor       warm half of the library's ambient        │ `rooms/
 *   uLibrarySky         cool half                                 │ library-rig.ts`
 *   uLibraryDust        scattering in the library's air           ┘
 *
 * Five of Floor −2's six never vary with the hour, and that is the floor's whole
 * idea rather than an omission — see `rooms/library-rig.ts`.
 */
/**
 * What both floors are made of: distance primitives, the material table, and the
 * handful of functions that turn a surface into a colour.
 *
 * This exists because the hotel is one program. `light-rig.ts` explains why the
 * five hours are uniforms rather than five shaders — recompiling a raymarcher is
 * a black frame and a stalled driver — and the descent makes that argument twice
 * over: the elevator is a mix between two distance fields, so both fields have to
 * be in the same program by construction. There is no arrangement in which the
 * lobby and the corridor are separately compiled and can still melt into one
 * another.
 *
 * ## Why this is two constants and not one
 *
 * The split is not cosmetic; it is declaration order, and it took a compile error
 * to find. The floors' geometry needs the primitives and the material identifiers,
 * so those have to be declared *above* the floors. But `surfaceAlbedo` needs the
 * corridor's dimensions — the runner is worn paler along the line people walk, and
 * where that line is, is the corridor's business — so the shading has to be
 * declared *below* them.
 *
 * ## The material table is shared, and that is load-bearing
 *
 * Both rooms draw from one set of identifiers. That is not tidiness. `mapScene`
 * mixes two distance fields and has to return one material for the point it
 * mixed; if the floors numbered their materials independently, the same float
 * would mean marble on one floor and carpet on the other, and the morph would
 * shade half its frames with whatever the other room happened to have put at that
 * index. Shared identifiers make the mid-morph material an arbitrary but
 * *correct* choice between two real materials.
 *
 * Identifiers here avoid `half`, `sample`, `input`, `output`, `filter`, `common`
 * and the rest of GLSL ES 3.00's reserved list, and avoid shadowing built-ins
 * (`step`, `distance`, `length`, `reflect`, `mix`) — both are rejected with a line
 * number and no reason. There are no backticks anywhere in the source strings:
 * this is a template literal, and one backtick in a shader comment ends it
 * thirty lines from where the error is reported.
 */

/**
 * Everything the two floors' geometry needs. Declared above them.
 */
const COMMON_PRIMITIVES_GLSL = `
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

/** Cut hole out of solid. Under-estimates distance, which is the safe direction. */
float carve(float solid, float hole) {
  return max(solid, -hole);
}

/** One hash, used for the dust glints and, at the very end, for the grain. */
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

// ---------------------------------------------------------------------------
// Material identifiers
// ---------------------------------------------------------------------------

// Floats because the map returns a vec2, and carrying a parallel integer would
// cost more than the comparisons it saves. Shared across both floors — see the
// file comment for why that is not merely convenient.
const float MAT_FLOOR    = 1.0;
const float MAT_PLASTER  = 2.0;
const float MAT_TIMBER   = 3.0;
const float MAT_BRASS    = 4.0;
const float MAT_MARBLE   = 5.0;
const float MAT_GLASS    = 6.0;
const float MAT_ENAMEL   = 7.0;
const float MAT_PAPER    = 8.0;
const float MAT_FILAMENT = 9.0;
const float MAT_RUNNER   = 10.0;
const float MAT_MIRROR   = 11.0;
const float MAT_SCONCE   = 12.0;
const float MAT_SHAFT    = 13.0;
const float MAT_SPINE    = 14.0;
const float MAT_READING  = 15.0;
const float MAT_BOARDS   = 16.0;

// How far outside a bounding box a ray may be before the box stands in for its
// contents. Comfortably above SURFACE_EPSILON, so a ray can never terminate on a
// bound and be shaded as whatever material the bound happened to claim.
const float BOUND_SLACK = 0.22;
`;

/**
 * Everything that turns a surface into a colour. Declared below the floors,
 * because it reads their dimensions.
 */
const COMMON_SHADING_GLSL = `
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
    // stretched sine, running vertically — which is how a door is hung and a
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
  if (id == MAT_RUNNER) {
    // The runner down the middle of the corridor: a deep red wool, worn paler
    // along the line people walk. The pile is two crossed sines an order of
    // magnitude finer than the floor tiles, which at this distance reads as nap
    // rather than as pattern — and it is what makes the reflection in the mirror
    // legible as carpet rather than as a red stripe.
    //
    // The wear matters more than it looks. It is the only thing in the corridor
    // that says people have walked here, in a hotel whose entire subject is a
    // guest who leaves no trace.
    float pile = sin(p.x * 210.0) * sin(p.z * 178.0) * 0.006;
    float worn = 1.0 - 0.30 * (1.0 - smoothstep(0.0, 0.42, abs(p.x - RUNNER_CENTRE_X)));
    roughness = 0.96;
    return vec3(0.129, 0.026, 0.030) * worn + pile;
  }
  if (id == MAT_BOARDS) {
    // Oak boards running the length of the room, 180mm wide, with a dark line
    // where each one meets the next. Two sines and a step: the grain is one
    // stretched sine along the board, exactly the trick the mahogany uses, and it
    // runs in z because that is the way a floor is laid in a room this shape.
    float across = p.x / 0.18;
    float board = floor(across);
    float seam = smoothstep(0.46, 0.5, abs(fract(across) - 0.5));
    float grain = sin(p.z * 6.3 + board * 2.7) * 0.004;
    // Each board took the stain slightly differently, which is what stops a floor
    // of identical planks reading as a texture.
    float cut = 0.86 + 0.28 * hash13(vec3(board, 0.0, 0.0));

    roughness = 0.58;
    return vec3(0.052, 0.030, 0.019) * cut * (1.0 - seam * 0.45) + grain;
  }

  if (id == MAT_SPINE) {
    // A book, and the writing on it.
    //
    // The cloth first. Three binder's colours, picked per book and then darkened
    // or lifted a little, because a shelf of one colour is a prop and a shelf of
    // many is a pattern — real shelving is two or three cloths and a lot of
    // variation in how faded each copy is. All of them are dark: the brightest
    // thing on this floor has to be the gilt, or the writing stops being what the
    // eye goes to and the room loses its subject.
    vec3 book = bookIndex(p);
    float pick = hash13(book + 3.7);
    vec3 cloth = pick < 0.34
      ? vec3(0.112, 0.042, 0.038)
      : (pick < 0.67 ? vec3(0.042, 0.074, 0.054) : vec3(0.058, 0.053, 0.090));
    cloth *= 0.72 + 0.56 * hash13(book + 11.3);

    // And the writing, which is the floor's one answer to the sun. Two blind
    // bands and a block of lettering between them, which is how a spine is
    // actually tooled — and the lettering runs *up* the spine, in y, because that
    // is the axis a book has room in.
    //
    // Everything here is multiplied by uInk, and at the shuttered hour uInk is
    // exactly zero: not dim gilt, no gilt. See rooms/library-rig.ts, where that
    // is the only field in the table the hour moves.
    // Two blind bands, the title between them, and a shelfmark down near the tail
    // — which is the standard tooling on a library binding and, more to the point
    // here, spreads the gilt over enough of the spine's height to be the thing that
    // changes when it goes. An earlier version put all of it in a 40mm strip near
    // the head, and although it read correctly at a metre it moved the frame's
    // contrast by too little to be sure the uniform was even connected.
    //
    // Every book's tooling is jogged up or down by its own hash, and that one line
    // is the difference between a library and a nightclub. Without it every book on
    // a shelf carries its bands at exactly the same height, eighteen of them in a
    // row, and they fuse into a continuous horizontal stripe running the length of
    // the bay — which does not read as lettering at any distance. It reads as LED
    // strip lighting under a shelf, which is a thing this building has never heard
    // of. Real books are not the same height and their bands do not line up.
    float up = withinShelf(p) - (hash13(book + 5.1) - 0.5) * 0.052;
    float bandHigh = 1.0 - smoothstep(0.0045, 0.0075, abs(up - 0.058));
    float bandLow  = 1.0 - smoothstep(0.0045, 0.0075, abs(up + 0.004));
    float shelfmark = 1.0 - smoothstep(0.0060, 0.0100, abs(up + 0.116));
    float ticks = step(0.42, hash13(vec3(book.z, floor(up * 265.0), book.x)));
    float title = ticks * (1.0 - smoothstep(0.0, 0.030, abs(up - 0.028)));
    float gilt = clamp(bandHigh + bandLow + shelfmark + title, 0.0, 1.0) * uInk;

    // Gold against cloth at about five to one, which is roughly what leaf on
    // buckram actually measures. It was twenty to one, and at that ratio the gilt
    // stopped reading as a surface catching the light and started reading as
    // self-luminous — yellow confetti glowing in a dark room, brighter than the
    // lamps that were supposed to be lighting it. Gilt is reflective, not bright.
    roughness = mix(0.86, 0.30, gilt);
    return mix(cloth, vec3(0.40, 0.30, 0.13), gilt);
  }

  if (id == MAT_MIRROR) {
    // The albedo under the reflection. Mercury glass a century old is not a
    // clean surface: it is backed silver that has begun to go, and what it goes
    // to is a warm grey. This is what shows through where the silvering has
    // failed, and it is the difference between a mirror and a hole.
    roughness = 0.04;
    return vec3(0.055, 0.052, 0.048);
  }

  roughness = 0.5;
  return vec3(0.1);
}

/**
 * Pull a colour towards a warm, faded pale, by uBleach.
 *
 * The daytime piece's palette, and non-zero at no other hour. It is a choice
 * rather than a simulation — a genuinely sun-faded surface would be just as faded
 * at midnight — so what has to be defended is where it is applied, not whether it
 * is true.
 *
 * It is applied to albedo, before any light. Fading the material leaves the
 * shadows exactly where they are and takes the colour only out of what the light
 * actually lands on. Fading the frame lifts the shadows with everything else,
 * which is how the first version of the daytime state came out as a uniformly
 * white room with no light in it: a rendering of the word "bright" rather than a
 * picture of an afternoon.
 *
 * And it stops at the top of the stairs. The bleach is weighted out by the lift,
 * because whatever else is arguable about fading a material that would be just as
 * faded at midnight, a corridor five floors underground has demonstrably never had
 * an afternoon. Applied down there it did exactly what it says on the tin — took
 * the colour out of the runner and the mahogany at noon — and turned the one room
 * in the building the sun has never reached into the palest thing in the piece.
 */
vec3 faded(vec3 albedo) {
  float grey = dot(albedo, vec3(0.299, 0.587, 0.114));
  vec3 pale = mix(vec3(grey), vec3(0.74, 0.70, 0.63), 0.72);
  return mix(albedo, pale, uBleach * floorWeight(0.0));
}

/** Blinn-Phong specular. Cheap, and the right shape for a room lit by soft sources. */
float specularLobe(vec3 n, vec3 viewDirection, vec3 lightDirection, float roughness) {
  vec3 halfway = normalize(lightDirection - viewDirection);
  float power = 2.0 / max(roughness * roughness * roughness, 0.0008);
  return pow(max(dot(n, halfway), 0.0), power) * (power + 8.0) / 64.0;
}

/**
 * Dust density at a point.
 *
 * Three sines rather than value noise, which would be eight hashes per sample and
 * twenty samples per pixel. Dust inside a beam has no structure worth resolving —
 * what sells it is that it moves slowly and unevenly, which three incommensurable
 * sines do for a twentieth of the cost.
 */
float dustDensity(vec3 p) {
  vec3 q = p * vec3(1.9, 2.6, 2.1) + vec3(0.0, -uTime * 0.055, uTime * 0.021);
  float body = sin(q.x) * sin(q.y * 1.27 + 1.7) * sin(q.z * 0.83 + 3.1);
  return 0.55 + 0.45 * body;
}

/** Narkowicz's ACES fit. One polynomial, and it keeps the moon from going cyan. */
vec3 tonemap(vec3 colour) {
  // Exposure, from the rig. It was a constant set by eye against a 3am interior,
  // and all five night-side rigs still use that number: this is the knob that is
  // tempting to reach for whenever anything looks wrong, and almost never the one
  // that is actually wrong.
  //
  // Blended towards the library's own stop by the lift, because this is applied to
  // the whole frame whatever floor is in it — so the lobby's daytime stop, which
  // opens up for a room full of sunlight, was reaching two floors underground and
  // lifting the library at noon by about eight per cent. Eight per cent is nothing
  // to look at and it was fatal: Floor −2's entire claim is that its light does not
  // answer the sun, and it was measurably answering. Floor −1 still rides the
  // lobby's stop, which is harmless because the sun genuinely does reach it.
  colour *= mix(uExposure, uLibraryExposure, floorWeight(2.0));
  return clamp((colour * (2.51 * colour + 0.03)) / (colour * (2.43 * colour + 0.59) + 0.14), 0.0, 1.0);
}

/** Interleaved gradient noise — the standard cheap per-pixel dither. */
float interleavedGradient(vec2 pixel) {
  return fract(52.9829189 * fract(dot(pixel, vec2(0.06711056, 0.00583715))));
}
`;

/**
 * Floor 0 — The Desk. The room, as a distance field.
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
 * **Bounding volumes around every fitting.** A naïve map evaluates thirty
 * primitives to answer a question that, for most rays over most of their length,
 * is "the nearest thing is a wall, four metres away". Each cluster — the doorway
 * assembly, the desk, the key rack — is wrapped in a box that is tested first;
 * only when the ray is close enough for the detail to matter is the detail
 * evaluated. It costs one comparison and buys most of the frame rate.
 *
 * **The shaft has no shadow ray.** Volumetric light is normally the expensive
 * part: a shadow march per sample per pixel. Here the only opening is a rectangle
 * on a known plane, so asking whether a point in the air is lit is a divide and a
 * rectangle test — walk backwards along the moonlight to the plane of the transom
 * and see whether you land inside the glass. Twenty samples of that cost less than
 * one shadow march.
 *
 * **The desk's shadow in the air is a slab test.** The one occluder broad enough
 * for its absence to be noticeable gets an analytic ray-box intersection instead
 * of a march. Everything smaller is below the noise floor of the dust.
 *
 * ## One shader, five hours, and now two floors
 *
 * The room is lit by the sun's real position at the visitor's real longitude, so
 * it has to be five lighting states without being five shaders — every part of the
 * rig that differs between night and noon is a uniform, and the five sets of values
 * live in `rooms/light-rig.ts`. Since the lift started running there is a second
 * reason the count of programs is one: `hotel.frag.ts` mixes this distance field
 * with the corridor's, and two fields cannot be mixed across two programs.
 *
 * Two of those uniforms buy the daytime picture on their own. `uShutter` puts
 * louvres in front of the transom — real geometry, seen from inside, and the same
 * pitch cuts the beam into bars — and `uBleach` pulls the albedo towards sun-faded
 * before any light touches it, which is what a century of afternoons does to
 * mahogany and what no amount of exposure can imitate. `uThreshold` is the third
 * and is not an hour at all: it is the hairline of daylight under the door left by
 * a visitor who let themselves in.
 *
 * ## Conventions worth knowing before editing
 *
 * Room space is metres, +y up, +z towards the back wall, the camera looking
 * roughly +z from around (-0.7, 1.6, -3.6). A person is 1.7 units tall and every
 * dimension here was chosen against that rather than against what looked right in
 * clip space — which is why the door is 2.32m and not 2.
 *
 * The floor plane at y = 0 is shared with the corridor, deliberately. During the
 * descent the ceiling comes down, the side walls close in and the back wall opens
 * into a corridor, but the ground the visitor is standing on never moves. A morph
 * that took the floor away as well reads as falling rather than as descending, and
 * they are not the same thing to look at.
 */
const LOBBY_GLSL = `
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

// The lamp is one of two fixed things about the lobby's rig: a tungsten bulb
// under a green shade is the same colour at every hour it is switched on, so only
// its strength varies — to zero, in daylight.
const vec3 LAMP_POSITION = vec3(2.45, 1.442, -0.35);
const vec3 LAMP_COLOUR   = vec3(1.00, 0.55, 0.20);

// The other is the aim, and it is worth recording because the mistake is not
// obvious from the numbers. The light travels towards −z, which means it lights
// the faces pointing away from the camera — so a beam aimed at the desk lands
// entirely on surfaces nobody can see, and the room reads as though the window is
// not doing anything. What has to be in shot is where the beam stops, so every
// direction in light-rig.ts is derived from the point it lands on and that point
// is what is written down there.

// The shutter. Louvres at 34° across a 680mm pane: pitch 115mm gives six blades,
// and the gap left between them is what cuts the beam into bars. SLAT_BLOCK is
// the half-width the bars are missing from — not derived from the geometry,
// because the projection of a tilted blade onto the floor depends on the light's
// angle and the picture wanted four clean bars rather than an honest penumbra
// study.
const float SLAT_TILT  = 0.593;
const float SLAT_PITCH = 0.115;
const float SLAT_HALF  = 0.044;
const float SLAT_BLOCK = 0.039;

// How far the edge of a bar of light is smeared, for the two things that ask. See
// the note in transomBeam: these are not two settings of one taste, they are a
// hard-edged shadow and an anti-aliasing filter.
const float SLAT_EDGE_SURFACE = 0.014;
const float SLAT_EDGE_AIR     = 0.045;

// ---------------------------------------------------------------------------
// The fittings. Each is bounded by the caller and assumes the ray is close.
// ---------------------------------------------------------------------------

/**
 * The doorway: architrave, a closed door with two recessed panels and a lever,
 * the mullion, and the glazed transom above it.
 *
 * The door stays shut. It is why the transom is the only aperture, and a single
 * aperture is why the shaft has edges — a room with two windows has ambient light
 * and no drama.
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

  // The shutter, on the hours that have it down. Seven blades in front of the
  // glass, on the room side, where a shutter on a street door actually is.
  //
  // Repeat first, tilt second. The other order is the obvious one to write and it
  // is wrong in a way that renders as a single blade: rotating before the
  // repetition tilts the stacking axis too, so each successive blade steps 66mm
  // further out of the pane's plane and the third one is 190mm clear of a slab
  // 55mm deep, where the intersection below trims it out of existence. Repeating
  // in the plane and tilting each blade about its own centre is what a shutter
  // actually is.
  //
  // The intersection is not optional either: without it the outermost blades
  // overhang the mullion and the architrave, which reads instantly as a shutter
  // that does not fit its window. The clamp is the same precaution the key rack
  // takes — repeating without one tiles the room and breaks the bound the march
  // depends on.
  //
  // A branch on a uniform, so every pixel in the frame takes the same side of it
  // and it costs nothing but the compare.
  if (uShutter > 0.5) {
    vec3 blade = q - vec3(0.0, TRANSOM_CENTRE.y, 2.120);
    float within = sdBox(blade, vec3(0.550, 0.345, 0.048));

    blade.y -= clamp(floor(blade.y / SLAT_PITCH + 0.5), -3.0, 3.0) * SLAT_PITCH;
    float tiltCos = cos(SLAT_TILT);
    float tiltSin = sin(SLAT_TILT);
    blade.yz = mat2(tiltCos, -tiltSin, tiltSin, tiltCos) * blade.yz;

    float louvres = sdBox(blade, vec3(0.545, SLAT_HALF, 0.009));
    res = nearer(res, vec2(max(louvres, within), MAT_TIMBER));
  }

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

  // Brass nosing along the counter's front edge: the only hard specular highlight
  // in the lower half of the frame, and the thing the moon catches.
  res = nearer(res, vec2(sdBox(p - vec3(1.60, 1.098, -0.686), vec3(1.230, 0.012, 0.012)), MAT_BRASS));

  // The bell. Nobody rings it.
  vec3 bell   = p - vec3(0.92, 1.212, -0.30);
  float dome  = max(length(bell) - 0.068, -bell.y);
  float plate = sdCylinderY(bell - vec3(0.0, 0.005, 0.0), 0.007, 0.090);
  float knob  = length(bell - vec3(0.0, 0.078, 0.0)) - 0.015;
  res = nearer(res, vec2(min(min(dome, plate), knob), MAT_BRASS));

  // The register, open. The phase that lists prior guests fills it in; for now it
  // is a prop, and the brightest thing the lamp touches.
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
 * tiles the entire room with key slots and, worse, breaks the Lipschitz bound the
 * march depends on, so rays tunnel through walls in a way that looks like a driver
 * bug and is not.
 */
vec2 mapKeyRack(vec3 p) {
  vec3 q = p - vec3(2.15, 2.20, 2.06);
  float carcass = sdBox(q, vec3(1.05, 0.62, 0.14));

  // Spacing and cell size are set so the outermost row and column still leave a
  // solid margin inside the carcass: 0.84 + 0.105 < 1.05 across, 0.50 + 0.085 <
  // 0.62 up. Overshoot that and the top edge of the rack comes out notched like a
  // battlement, which is unmistakable and took a rendered frame to spot.
  vec3 cell = q;
  cell.x -= clamp(floor(q.x / 0.28 + 0.5), -3.0, 3.0) * 0.28;
  cell.y -= clamp(floor(q.y / 0.25 + 0.5), -2.0, 2.0) * 0.25;
  float holes = sdBox(cell - vec3(0.0, 0.0, -0.10), vec3(0.105, 0.085, 0.26));

  return vec2(carve(carcass, holes), MAT_TIMBER);
}

/**
 * Distance to the nearest surface of Floor 0, and what that surface is made of.
 *
 * The shell is exact rather than a box: the interior of a convex room is the
 * minimum of its walls' perpendicular distances, so it is five planes and no
 * primitive at all. Everything else sits behind a bounding test.
 */
vec2 mapLobby(vec3 p) {
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
  // distance, and its material is never shaded because a ray cannot terminate that
  // far from a surface.
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

// ---------------------------------------------------------------------------
// The moonlight, analytically
// ---------------------------------------------------------------------------

/**
 * The moonlight reaching a point: how much of the transom it can see, and how far
 * away that transom is along the light.
 *
 * Walk backwards along the moonlight to the plane of the back wall and ask
 * whether the point you land on is inside the glass. That is the entire aperture
 * model, and it is why the shaft costs nothing: no shadow ray leaves here.
 *
 * The distance comes back as well because the shadow march needs it, and needs it
 * badly. The transom is real geometry — the pane is in the map so that it can be
 * seen — which means a shadow ray fired at the moon hits the window and reports
 * the window as an occluder. The light source shadows itself, the pool on the
 * floor never appears, and the room stays dark for a reason no amount of turning
 * the brightness up will fix. Capping the march just short of the pane is the fix,
 * and this is the number to cap it with.
 *
 * The aperture edge is softened over a few centimetres. A mathematically hard
 * boundary on a beam of light is the single most reliable way to make an image
 * read as computer graphics rather than as a photograph of a room.
 *
 * @param slatSoftness How far the louvre edges are smeared, metres. Two callers,
 *   two very different answers — see the note on the mask below.
 * @return x: admittance in [0, 1]. y: metres back to the pane, or 0 behind it.
 */
vec2 transomBeam(vec3 p, float slatSoftness) {
  float travel = (p.z - BACK_WALL_Z) / uKeyDirection.z;
  if (travel <= 0.0) {
    return vec2(0.0);
  }
  vec2 onPane  = p.xy - uKeyDirection.xy * travel;
  vec2 outside = abs(onPane - TRANSOM_CENTRE) - TRANSOM_HALF;
  float admitted = 1.0 - smoothstep(-0.055, 0.015, max(outside.x, outside.y));

  // The louvres, in light rather than in geometry. The blades are cut by the same
  // pitch the shutter is built from, so the bars on the floor line up with the
  // shutter a viewer can see above them — which is the whole difference between a
  // shuttered room and a striped one.
  //
  // How soft that edge is depends entirely on who is asking, which is why it is a
  // parameter and not a constant.
  //
  // A surface wants it hard: a bar of sunlight on marble has an edge you could
  // measure, and softening it is what turns a shuttered room into a room with a
  // gradient in it.
  //
  // The air wants it soft, and not for atmosphere. The volumetric integral
  // evaluates this twenty times along a view ray spanning thirteen metres, so a
  // structure repeating every 115mm is sampled two orders of magnitude below its
  // own frequency — and the start offset is dithered per pixel, so neighbouring
  // pixels land on different phases of it. A hard edge there does not alias into a
  // stair, it aliases into a fine diagonal moiré across every wall the shaft
  // passes in front of: the most obviously computer-generated thing this shader is
  // capable of producing, and it took a rendered frame to recognise as aliasing
  // rather than as a shadow.
  if (uShutter > 0.5) {
    float acrossPane = (onPane.y - TRANSOM_CENTRE.y) / SLAT_PITCH;
    float fromBlade  = abs(fract(acrossPane + 0.5) - 0.5) * SLAT_PITCH;
    admitted *= smoothstep(SLAT_BLOCK - slatSoftness, SLAT_BLOCK + slatSoftness, fromBlade);
  }

  return vec2(admitted, travel);
}

/**
 * Whether the desk stands between a point and the transom, as a ray-box slab test
 * rather than a march.
 *
 * The desk is the only occluder broad enough that its shadow in the air is
 * noticeable. Without this, dust glows inside the wedge the desk should be keeping
 * dark, and the shaft stops looking like it is made of light.
 */
float deskShadow(vec3 p) {
  vec3 inverseDirection = 1.0 / (-uKeyDirection);
  vec3 a = (DESK_MIN - p) * inverseDirection;
  vec3 b = (DESK_MAX - p) * inverseDirection;
  vec3 low  = min(a, b);
  vec3 high = max(a, b);
  float enter = max(max(low.x, low.y), low.z);
  float leave = min(min(high.x, high.y), high.z);
  return (leave > max(enter, 0.0)) ? 0.0 : 1.0;
}
`;

/**
 * Floor −1 — The Mirror Corridor. The room whose subject is what is not in it.
 *
 * AUBADE's floor table gives this room three sentences: "A mirrored wall,
 * rendered by a second march. Everything in the corridor reflects. Your light
 * does not. You will notice this about four seconds later than you think you
 * will." The Definition of Done attached to the phase is that the reflection
 * reads as intentional within ten seconds, unprompted, to someone who was not
 * told the theme. Every decision in this file is downstream of that one sentence,
 * so it is worth being explicit about the failure it is avoiding.
 *
 * ## The mirror has to obviously work, or the absence is just a bug
 *
 * A mirror that shows a dark wall is not a supernatural event. It is an
 * unfinished mirror, and a stranger will read it that way every single time. The
 * absence only becomes legible as *an absence* if the surface is first
 * unmistakably established as a working mirror — so the composition is arranged
 * to spend its first few seconds proving that, and only then take something away.
 *
 * Hence the asymmetry of the corridor. Every fitting is on one side: the doors,
 * their architraves, their brass numbers, and the sconces between them all live on
 * the right-hand wall, and the entire left-hand wall above the dado is mirror.
 * There is therefore a great deal for the mirror to reflect, all of it structured,
 * receding, and instantly recognisable as a corridor — a reflected line of lit
 * sconces marching away is about as unambiguous as a reflection gets. Against that
 * the missing pool of light is a hole in something that is plainly working.
 *
 * ## The light that does not reflect
 *
 * The visitor carries a lamp. It is the brightest thing on this floor by a wide
 * margin, it is close to the camera, it throws a warm pool on the runner and the
 * near doors, and it flickers — see `uCarriedFlicker` in `hotel.frag.ts`. In the
 * mirror, none of it exists.
 *
 * That is not a physical model and it is important to say so plainly: a correct
 * mirror *would* show the lit floor, because the floor is lit and the mirror
 * reflects the floor. Reflecting the room but not the light that fell on it is
 * arithmetic nothing in optics permits. It is precisely the departure from physics
 * that is the phenomenon, and it is implemented as one multiplier — `shadeSurface`
 * takes a `carried` weight, which is 1 in the world and 0 inside the reflection.
 * The whole of Floor −1's idea is that one argument.
 *
 * The flicker is what buys the ten seconds. A still absence has to be noticed by
 * comparing two parts of a frame, which people do slowly; a *moving* absence is
 * noticed by peripheral vision, which is fast. The real corridor breathes with the
 * lamp. The reflection is perfectly still. Nobody has to be told to compare them.
 *
 * ## How the sun gets five floors underground
 *
 * There is no window. AUBADE's first failure mode is a room that stops answering
 * to the solar state — six rooms of unrelated effects with a hotel painted on —
 * so the corridor answers twice.
 *
 * The sconces carry the hour in their strength and colour: full and warm at
 * astronomical night, guttering through `late`, which is the state whose whole
 * description is "lights go out in the order you are not looking", and nearly gone
 * by `aubade`. And at `shuttered` they are out altogether, because the one light
 * left is the wrong one: a hard blade of daylight coming down the lift shaft at the
 * far end and lying across the runner. It arrives through the very thing the
 * visitor came down in. A building that goes six floors underground to get away
 * from the sun, and the sun finds the corridor anyway through the lift, is the
 * entire tragedy of the piece stated as a lighting rig.
 *
 * ## Conventions
 *
 * Metres, +y up, +z away from the camera down the corridor's length. The floor
 * plane at y = 0 is shared with the lobby on purpose — see the note at the foot of
 * the lobby section above. The ceiling is 2.70 against the lobby's 4.00 and the walls are
 * 2.90 apart against the lobby's 9.20, which is what makes the descent read as
 * going somewhere smaller rather than as a cross-fade.
 */
const CORRIDOR_GLSL = `
// ---------------------------------------------------------------------------
// The corridor, in metres
// ---------------------------------------------------------------------------
const float CORRIDOR_HALF_WIDTH = 1.45;
const float CORRIDOR_HEIGHT     = 2.70;
const float CORRIDOR_NEAR_Z     = -8.60;
const float CORRIDOR_FAR_Z      = 15.00;

// The dado runs the length of both walls: panelling below it, plaster or mirror
// above. It is the single cheapest thing that makes a corridor read as a hotel
// corridor rather than as a box with doors in it.
const float DADO_Y = 0.95;

// The mirror. Flush with the left-hand wall rather than proud of it, because a
// wall of mirror in a building of this period is the wall, not a thing hung on
// it. MIRROR_X is also the plane the second march reflects about.
const float MIRROR_X      = -1.45;
const float MIRROR_TOP_Y  = 2.34;
const float MIRROR_NEAR_Z = -6.20;
const float MIRROR_FAR_Z  = 13.10;

// The mirror starts just above the skirting, not at the dado, and this is the
// single most load-bearing number on the floor. A mirror that begins at waist
// height cannot show the floor at any angle a standing camera can reach — and the
// floor is the only surface the visitor's lamp lights, so it is the only surface
// where the missing pool can be seen to be missing. With the glass stopping at the
// dado the room contained a perfectly good mirror, a perfectly good lamp, and no
// way whatever to notice that one was not in the other.
//
// It also happens to be what AUBADE's floor table describes: a mirrored wall, not
// a mirror on a wall.
const float MIRROR_BOTTOM_Y = 0.18;

// How wide one sheet of plate is before the next brass bead. A wall of mirror this
// long was never one piece of glass, and saying so is not period detail — it is the
// single thing that stops the reflection reading as a second corridor. Without the
// beading a viewer has no evidence there is a surface there at all, and a
// reflection nobody knows is a reflection cannot be missing anything.
const float MIRROR_PANEL = 2.40;

// The runner. Centred a little off the corridor's axis, towards the mirror, so
// that its reflection is a full band rather than a sliver — the reflected carpet
// is doing as much work as the reflected sconces in establishing that the mirror
// is a mirror.
const float RUNNER_CENTRE_X   = -0.12;
const float RUNNER_HALF_WIDTH = 0.62;

// The doors, and the sconces between them. One pitch, offset by half of it, which
// is how a corridor is actually lit: a light between each pair of rooms.
const float DOOR_WALL_X   = 1.45;
const float DOOR_CENTRE_Y = 1.06;
const float DOOR_PITCH    = 3.20;
const float DOOR_FIRST    = -2.0;
const float DOOR_LAST     = 4.0;

const float SCONCE_X        = 1.30;
const float SCONCE_Y        = 1.95;
const float SCONCE_PITCH    = 3.20;
const float SCONCE_OFFSET_Z = 1.60;
const float SCONCE_FIRST    = -2.0;
const float SCONCE_LAST     = 4.0;

// The opening at the top of the lift doors at the far end. The aperture the day
// gets in through, and the exact analogue of the lobby's transom — same trick,
// same reason it costs nothing: one rectangle on one known plane.
const vec2 SHAFT_CENTRE = vec2(0.00, 2.12);
const vec2 SHAFT_HALF   = vec2(0.62, 0.19);

// ---------------------------------------------------------------------------
// The fittings
// ---------------------------------------------------------------------------

/**
 * The line of doors down the right-hand wall.
 *
 * Clamped domain repetition, and the clamp is the same precaution the lobby's key
 * rack takes for the same reason: repeating without one tiles the corridor to
 * infinity and, worse, breaks the Lipschitz bound the march depends on, so rays
 * tunnel through walls in a way that looks like a driver bug and is not.
 *
 * The fold happens before the bound, so the bound is tested in the nearest door's
 * local space and one comparison skips seven doors' worth of joinery.
 */
vec2 mapDoorLine(vec3 p) {
  vec3 q = p;
  q.z -= clamp(floor(p.z / DOOR_PITCH + 0.5), DOOR_FIRST, DOOR_LAST) * DOOR_PITCH;

  vec3 d = q - vec3(DOOR_WALL_X, DOOR_CENTRE_Y, 0.0);

  float bound = sdBox(d - vec3(0.045, 0.0, 0.0), vec3(0.24, 1.24, 0.62));
  if (bound > BOUND_SLACK) {
    return vec2(bound, MAT_TIMBER);
  }

  // Architrave, standing proud of the wall towards the corridor. Lower x is
  // towards the camera side of this wall; the door is recessed behind it.
  float outer = sdBox(d - vec3(0.010, 0.010, 0.0), vec3(0.030, 1.155, 0.565));
  float inner = sdBox(d - vec3(0.010, 0.000, 0.0), vec3(0.070, 1.060, 0.470));
  vec2 res = vec2(carve(outer, inner), MAT_TIMBER);

  // The leaf, with two recessed panels cut from its face.
  float leaf      = sdBox(d - vec3(0.058, 0.0, 0.0), vec3(0.038, 1.058, 0.462));
  float panelHigh = sdBox(d - vec3(0.022, 0.440, 0.0), vec3(0.050, 0.400, 0.300));
  float panelLow  = sdBox(d - vec3(0.022, -0.480, 0.0), vec3(0.050, 0.340, 0.300));
  res = nearer(res, vec2(carve(leaf, min(panelHigh, panelLow)), MAT_TIMBER));

  // The number plate and the lever. Small brass, and between them they are what
  // tell a viewer the scale of the corridor — the same job the lobby's door
  // handle does, and the reason both are worth their primitives.
  float plate  = sdBox(d - vec3(0.016, 0.640, 0.0), vec3(0.005, 0.052, 0.036));
  float lever  = sdBox(d - vec3(0.008, -0.055, 0.355), vec3(0.026, 0.013, 0.050)) - 0.007;
  res = nearer(res, vec2(min(plate, lever), MAT_BRASS));

  return res;
}

/** Where the sconce with this index hangs. Read by the geometry and the light. */
vec3 sconcePosition(float index) {
  return vec3(SCONCE_X - 0.030, SCONCE_Y - 0.060, SCONCE_OFFSET_Z + index * SCONCE_PITCH);
}

/**
 * The sconces: a brass backplate, an arm, and a glass bowl open at the top.
 *
 * The bowl is a sphere scaled on y, which is not a true distance field — a scaled
 * sphere over-estimates by the largest scale factor, and an over-estimate is the
 * one direction a march cannot survive, because it steps past the surface and the
 * fitting develops holes. Dividing the result by that factor makes it conservative
 * again. It is two characters and it is the difference between a lamp and an
 * intermittent one.
 */
vec2 mapSconces(vec3 p) {
  float index = clamp(
    floor((p.z - SCONCE_OFFSET_Z) / SCONCE_PITCH + 0.5),
    SCONCE_FIRST,
    SCONCE_LAST
  );

  vec3 s = p - vec3(SCONCE_X, SCONCE_Y, SCONCE_OFFSET_Z + index * SCONCE_PITCH);

  float bound = sdBox(s, vec3(0.26, 0.32, 0.24));
  if (bound > BOUND_SLACK) {
    return vec2(bound, MAT_BRASS);
  }

  float backplate = sdBox(s - vec3(0.135, 0.0, 0.0), vec3(0.012, 0.150, 0.055)) - 0.010;
  float arm       = sdBox(s - vec3(0.075, -0.020, 0.0), vec3(0.068, 0.014, 0.014)) - 0.006;
  vec2 res = vec2(min(backplate, arm), MAT_BRASS);

  vec3 bowl = s - vec3(0.020, -0.060, 0.0);
  float stretched = (length(bowl * vec3(1.0, 1.35, 1.0)) - 0.086) / 1.35;
  res = nearer(res, vec2(max(stretched, bowl.y - 0.012), MAT_SCONCE));

  return res;
}

/**
 * Distance to the nearest surface of Floor −1, and what that surface is made of.
 *
 * Same construction as the lobby: the shell is exact planes rather than a box,
 * and everything with detail in it sits behind a bounding test.
 */
vec2 mapCorridor(vec3 p) {
  vec2 res = vec2(p.y, MAT_FLOOR);
  res = nearer(res, vec2(CORRIDOR_HEIGHT - p.y, MAT_PLASTER));
  res = nearer(res, vec2(p.z - CORRIDOR_NEAR_Z, MAT_PLASTER));

  // The right-hand wall: panelled to the dado, plastered above, doors in it.
  res = nearer(res, vec2(
    CORRIDOR_HALF_WIDTH - p.x,
    p.y < DADO_Y ? MAT_TIMBER : MAT_PLASTER
  ));

  // The left-hand wall, which is glass from the skirting to the picture rail. The
  // distance is the same plane either way — a wall of mirror is flush — so this is
  // a material decision, not a geometric one, and the second march keys off
  // exactly this test.
  bool silvered =
    p.y > MIRROR_BOTTOM_Y && p.y < MIRROR_TOP_Y &&
    p.z > MIRROR_NEAR_Z && p.z < MIRROR_FAR_Z;
  res = nearer(res, vec2(
    p.x - MIRROR_X,
    silvered ? MAT_MIRROR : MAT_PLASTER
  ));

  // The far wall is the lift the visitor came down in, seen from the other side,
  // with the opening above its doors cut out and filled by the shaft.
  float farWall = CORRIDOR_FAR_Z - p.z;
  float opening = sdBox(p - vec3(SHAFT_CENTRE, CORRIDOR_FAR_Z), vec3(SHAFT_HALF, 0.5));
  res = nearer(res, vec2(carve(farWall, opening), MAT_PLASTER));
  res = nearer(res, vec2(
    sdBox(p - vec3(SHAFT_CENTRE, CORRIDOR_FAR_Z + 0.02), vec3(SHAFT_HALF, 0.008)),
    MAT_SHAFT
  ));

  // The lift doors themselves: two brass leaves with a seam between them. The
  // seam is a carve rather than two boxes, which keeps it exactly centred on the
  // shaft above it however either number is later nudged.
  float leaves = sdBox(p - vec3(0.0, 1.05, CORRIDOR_FAR_Z - 0.055), vec3(0.62, 1.05, 0.045));
  float seam   = sdBox(p - vec3(0.0, 1.05, CORRIDOR_FAR_Z - 0.055), vec3(0.006, 1.02, 0.090));
  res = nearer(res, vec2(carve(leaves, seam), MAT_BRASS));

  // Skirting on both walls; the dado only on the right, because the left one is
  // glass from the skirting up and a dado rail across a mirror is a rail across a
  // mirror. Same trick as the lobby's skirting: intersect "close to a wall" with
  // "at this height".
  float toSide   = min(CORRIDOR_HALF_WIDTH - p.x, p.x - MIRROR_X);
  float skirting = max(toSide - 0.045, p.y - 0.130);
  float dado     = max(CORRIDOR_HALF_WIDTH - p.x - 0.032, abs(p.y - DADO_Y) - 0.042);
  res = nearer(res, vec2(min(skirting, dado), MAT_TIMBER));

  // The brass beading between the sheets of plate, and the capping beads along the
  // top and bottom of the run. All are intersections of slabs — near the mirror
  // wall, at this height, within the mirror's length — which is the same
  // construction the skirting above uses and costs three comparisons.
  //
  // The vertical beads repeat, so they fold first and are clamped for the usual
  // reason: an unclamped repetition tiles the corridor and breaks the bound the
  // march depends on.
  float alongMirror = max(MIRROR_NEAR_Z - p.z, p.z - MIRROR_FAR_Z);
  float ofMirror    = p.x - MIRROR_X - 0.026;
  float midHeight   = (MIRROR_BOTTOM_Y + MIRROR_TOP_Y) * 0.5;
  float halfHeight  = (MIRROR_TOP_Y - MIRROR_BOTTOM_Y) * 0.5;

  vec3 bead = p;
  bead.z -= clamp(floor(p.z / MIRROR_PANEL + 0.5), -2.0, 5.0) * MIRROR_PANEL;
  float mullion = max(
    max(ofMirror, abs(bead.z) - 0.018),
    max(alongMirror, abs(p.y - midHeight) - halfHeight)
  );

  // abs() folds one bead into two: the capping along the top and the plinth bead
  // along the bottom are the same section at the same offset from the middle.
  float capping = max(
    max(ofMirror, abs(abs(p.y - midHeight) - halfHeight) - 0.026),
    alongMirror
  );

  res = nearer(res, vec2(min(mullion, capping), MAT_BRASS));

  // The runner, laid on the marble down the length of the corridor.
  float runner = sdBox(
    p - vec3(RUNNER_CENTRE_X, 0.007, (CORRIDOR_NEAR_Z + CORRIDOR_FAR_Z) * 0.5),
    vec3(RUNNER_HALF_WIDTH, 0.007, (CORRIDOR_FAR_Z - CORRIDOR_NEAR_Z) * 0.5)
  );
  res = nearer(res, vec2(runner, MAT_RUNNER));

  // The two repeated assemblies. Both bound themselves internally, after folding.
  res = nearer(res, mapDoorLine(p));
  res = nearer(res, mapSconces(p));

  return res;
}

/**
 * The daylight coming down the lift shaft, at the hours that have any.
 *
 * Exactly the lobby's transom trick, and worth stating in the same terms: walk
 * backwards along the light to the plane of the far wall and ask whether the point
 * you land on is inside the opening. One divide and one rectangle test, no shadow
 * ray, and the whole aperture is modelled.
 *
 * @return x: admittance in [0, 1]. y: metres back to the opening, or 0 behind it.
 */
vec2 shaftBlade(vec3 p) {
  float travel = (p.z - CORRIDOR_FAR_Z) / uShaftDirection.z;
  if (travel <= 0.0) {
    return vec2(0.0);
  }
  vec2 onPlane = p.xy - uShaftDirection.xy * travel;
  vec2 outside = abs(onPlane - SHAFT_CENTRE) - SHAFT_HALF;
  return vec2(1.0 - smoothstep(-0.050, 0.020, max(outside.x, outside.y)), travel);
}
`;

/**
 * Floor −2 — The Library. The room whose subject is writing, and which loses it.
 *
 * AUBADE's floor table gives this room one sentence: "One sentence, migrating
 * across eight writing systems — Latin, Greek, Cyrillic, Arabic, Devanagari,
 * Hebrew, Han, Hangul — glyphs dissolving into one another rather than cutting."
 * That sentence is a glyph atlas and a phase of its own. This file is the room it
 * will be read in, and the room is not a waiting area for it.
 *
 * ## What the room says before the sentence arrives
 *
 * A library is already made of writing. Every spine on both walls is lettered,
 * and `uInk` — the one uniform on this floor the sun moves — takes that lettering
 * away as dawn comes. At astronomical night the gilt runs the length of both
 * walls in two receding lines. At noon there is not a legible mark in the room,
 * under lamps burning at exactly the strength they burned at midnight.
 *
 * That is this floor's answer to the clock, and it is deliberately a third
 * different answer rather than a third dimmer switch. Floor 0 gets brighter as the
 * night ends. Floor −1 goes dark. Floor −2 does neither: it keeps every lumen it
 * had and stops meaning anything. `rooms/library-rig.ts` is where that is written
 * as numbers, and it is worth reading before touching the lighting here, because
 * five of its six fields being identical across all five hours is the claim rather
 * than an oversight.
 *
 * When the sentence lands it reads the same uniform, so it will fade at dawn by
 * the rule the spines already follow — which is the point of putting the rule in
 * before the sentence.
 *
 * ## The grooves are carved, and that is not a detail
 *
 * A run of book spines is the one thing in this building that wants
 * high-frequency, irregular, per-instance geometry, and it is the one thing a
 * raymarcher cannot have cheaply. Domain repetition with per-cell variation
 * over-estimates the distance — a taller or a prouder neighbour in the next cell
 * is nearer than the cell being evaluated says it is — and an over-estimate is the
 * one direction a march cannot survive: it steps past the surface and the shelf
 * develops holes. The usual fix is to evaluate three cells and take the minimum,
 * which triples the cost of the most-evaluated geometry on the floor.
 *
 * So the books are one box per shelf, and the spines are *carved* out of it. Carve
 * under-estimates — it is `max(solid, -hole)` and the file's own primitive says so
 * — and an under-estimate is always safe. Which means the groove between two books
 * can be as irregular as a hash likes, per book, at no risk whatever: the width
 * varies, the phase varies, and the march simply takes shorter steps near them.
 *
 * The repetition that generates the grooves is deliberately **not** clamped, which
 * is the opposite of the rule the key rack and the door line follow. It can afford
 * not to be: an unclamped carve tiles a hole through all of space, and everywhere
 * outside the books box the box's own distance dominates the max. Clamping it
 * would cost a comparison and buy nothing. This is the only unclamped repetition
 * in the piece and it is the only one that is safe.
 *
 * ## Conventions
 *
 * Metres, +y up, +z away from the camera down the room's length. The floor plane
 * at y = 0 is shared with both floors above on purpose — see the note at the foot
 * of the lobby section. The room is the widest in the building at 6.20 across
 * against the corridor's 2.90, and the ceiling comes back up to 3.30 from the
 * corridor's 2.70, so the second leg of the descent opens out where the first one
 * closed in. A visitor who has just come down a corridor should feel the room
 * arrive.
 */
const LIBRARY_GLSL = `
// ---------------------------------------------------------------------------
// The library, in metres
// ---------------------------------------------------------------------------
const float LIBRARY_HALF_WIDTH = 3.10;
const float LIBRARY_HEIGHT     = 3.30;
const float LIBRARY_NEAR_Z     = -6.40;
const float LIBRARY_FAR_Z      = 11.00;

// The shelving. One run down each wall, identical, which is why the map folds on
// abs(x) and builds one of them — a library is the one room in this building that
// is genuinely symmetric, and the fold is exact rather than an approximation.
const float CASE_DEPTH  = 0.34;
const float CASE_BOTTOM = 0.16;
const float CASE_TOP    = 2.55;
const float CASE_NEAR_Z = -6.20;
const float CASE_FAR_Z  = 9.40;

const float CASE_MID_Y   = (CASE_BOTTOM + CASE_TOP) * 0.5;
const float CASE_HALF_Y  = (CASE_TOP - CASE_BOTTOM) * 0.5;
const float CASE_MID_Z   = (CASE_NEAR_Z + CASE_FAR_Z) * 0.5;
const float CASE_HALF_Z  = (CASE_FAR_Z - CASE_NEAR_Z) * 0.5;
const float CASE_CENTRE_X = LIBRARY_HALF_WIDTH - CASE_DEPTH * 0.5;

// Bays along the run, pilasters between them, shelves within them. The openings
// are smaller than their pitch in both axes, which is what leaves the joinery
// between them solid: 0.78 < 1.90/2 across, 0.155 < 0.36/2 up. Overshoot either
// and the case comes out as a grid of floating rectangles.
const float BAY_PITCH   = 1.90;
const float BAY_FIRST   = -3.0;
const float BAY_LAST    = 5.0;
const float BAY_HALF_Z  = 0.78;
const float SHELF_PITCH = 0.36;
const float SHELF_HALF_Y = 0.155;
const float SHELF_FIRST = -3.0;
const float SHELF_LAST  = 3.0;

// One book. Narrow enough that a shelf holds about eighteen of them, which is
// what a shelf holds.
const float SPINE_PITCH = 0.043;

// The reading tables down the middle, and the lamp on each. The pitch is wide
// because a reading room is mostly floor — tables too close together read as a
// refectory, and this room is meant to be quiet rather than busy.
const float TABLE_PITCH  = 3.60;
const float TABLE_FIRST  = -1.0;
const float TABLE_LAST   = 2.0;
const float TABLE_TOP_Y  = 0.76;
const float TABLE_HALF_X = 0.62;
const float TABLE_HALF_Z = 1.30;

// Where the lamp's glass sits above the table top. Read by the geometry and by
// the light, which is the same arrangement the sconces use and for the same
// reason: two declarations of one position is a light that drifts out of its own
// fitting the first time either is nudged.
const float LAMP_RISE = 0.242;

// ---------------------------------------------------------------------------
// The fittings
// ---------------------------------------------------------------------------

/**
 * Which book a point is on: bay index, shelf index, spine index.
 *
 * Shared by the geometry and by surfaceAlbedo, which needs the same three numbers
 * to give the same book the same cloth. Two copies of this arithmetic would be a
 * shelf whose books changed colour when the camera moved.
 */
vec3 bookIndex(vec3 p) {
  float bay   = clamp(floor(p.z / BAY_PITCH + 0.5), BAY_FIRST, BAY_LAST);
  float up    = p.y - CASE_MID_Y;
  float shelf = clamp(floor(up / SHELF_PITCH + 0.5), SHELF_FIRST, SHELF_LAST);
  float spine = floor((p.z - bay * BAY_PITCH) / SPINE_PITCH + 0.5);

  // The two walls are folded onto one another by the map, so without an offset on
  // one of them both sides of the room would hold the same books in the same
  // order — which reads, unmistakably, as a mirror rather than as a library. 41 is
  // coprime with nothing in particular and simply has to not be zero.
  return vec3(bay + (p.x < 0.0 ? 41.0 : 0.0), shelf, spine);
}

/** How far up its own shelf a point is, folded the way the geometry folds it. */
float withinShelf(vec3 p) {
  float up = p.y - CASE_MID_Y;
  return up - clamp(floor(up / SHELF_PITCH + 0.5), SHELF_FIRST, SHELF_LAST) * SHELF_PITCH;
}

/**
 * The shelving down both walls: carcass, openings, and the books in them.
 *
 * Folded on abs(x) so that one run of arithmetic builds two runs of shelving. The
 * fold is a union of a shape and its mirror image and is exact — see the file
 * comment for why the books inside it are carved rather than repeated.
 */
vec2 mapShelving(vec3 p) {
  vec3 q = p;
  q.x = abs(q.x);

  // The whole run as one box, tested first. Most rays in this room are looking
  // down the middle of it and are nowhere near either wall.
  float run = sdBox(
    q - vec3(CASE_CENTRE_X, CASE_MID_Y, CASE_MID_Z),
    vec3(CASE_DEPTH * 0.5, CASE_HALF_Y, CASE_HALF_Z)
  );
  if (run > BOUND_SLACK) {
    return vec2(run, MAT_TIMBER);
  }

  // Fold into one bay, then into one shelf within it. Both clamped, for the usual
  // reason: an unclamped repetition tiles the room and breaks the Lipschitz bound
  // the march depends on.
  vec3 cell = q;
  float bay = clamp(floor(q.z / BAY_PITCH + 0.5), BAY_FIRST, BAY_LAST);
  cell.z -= bay * BAY_PITCH;
  cell.y -= CASE_MID_Y;
  float shelf = clamp(floor(cell.y / SHELF_PITCH + 0.5), SHELF_FIRST, SHELF_LAST);
  cell.y -= shelf * SHELF_PITCH;

  // The opening is deeper than the carcass in x, so it punches through both faces.
  // The back one is against the wall and is never seen.
  float opening = sdBox(
    cell - vec3(CASE_CENTRE_X, 0.0, 0.0),
    vec3(CASE_DEPTH, SHELF_HALF_Y, BAY_HALF_Z)
  );
  vec2 res = vec2(carve(run, opening), MAT_TIMBER);

  // The books: one box standing on the shelf, short of the front of the case.
  float booksHalfX = CASE_DEPTH * 0.5 - 0.055;
  float booksMidX  = LIBRARY_HALF_WIDTH - CASE_DEPTH + booksHalfX + 0.030;
  float booksFront = booksMidX - booksHalfX;
  float books = sdBox(
    cell - vec3(booksMidX, -0.032, 0.0),
    vec3(booksHalfX, SHELF_HALF_Y - 0.032, BAY_HALF_Z - 0.045)
  );

  // And the spines, carved. Unclamped on purpose — see the file comment. The
  // width varies per book, which is what stops eighteen identical grooves reading
  // as corduroy, the way the mahogany grain did before it was given a wobble.
  float spine  = floor(cell.z / SPINE_PITCH + 0.5);
  float offset = cell.z - spine * SPINE_PITCH;
  // Indexed on the shelf rather than on cell.y, which is continuous: a width that
  // varied up the height of a book would make the groove a curved surface and the
  // spine a wedge.
  float width  = 0.0032 + 0.0034 * hash13(vec3(spine, shelf, bay));
  float groove = max(abs(offset) - width, abs(cell.x - booksFront) - 0.016);
  res = nearer(res, vec2(carve(books, groove), MAT_SPINE));

  return res;
}

/** Where the reading lamp on a given table hangs. Read by the geometry and the light. */
vec3 readingLampPosition(float index) {
  return vec3(0.0, TABLE_TOP_Y + LAMP_RISE, index * TABLE_PITCH);
}

/**
 * The reading tables: a top, an apron, four legs, and a lamp.
 *
 * The lamp is the lobby's desk lamp again — brass base, brass stem, green enamel
 * shade, a glow under it. Deliberately the same fitting two floors down, because
 * it is the same hotel and somebody bought them at the same time, and because a
 * visitor who has seen one on the desk recognises the room as furnished rather
 * than decorated.
 */
vec2 mapReadingTables(vec3 p) {
  float index = clamp(floor(p.z / TABLE_PITCH + 0.5), TABLE_FIRST, TABLE_LAST);
  vec3 t = p - vec3(0.0, 0.0, index * TABLE_PITCH);

  float bound = sdBox(t - vec3(0.0, 0.62, 0.0), vec3(0.74, 0.68, TABLE_HALF_Z + 0.08));
  if (bound > BOUND_SLACK) {
    return vec2(bound, MAT_TIMBER);
  }

  float top = sdBox(t - vec3(0.0, TABLE_TOP_Y - 0.024, 0.0),
                    vec3(TABLE_HALF_X, 0.024, TABLE_HALF_Z)) - 0.008;
  vec2 res = vec2(top, MAT_TIMBER);

  res = nearer(res, vec2(
    sdBox(t - vec3(0.0, TABLE_TOP_Y - 0.105, 0.0),
          vec3(TABLE_HALF_X - 0.055, 0.052, TABLE_HALF_Z - 0.055)),
    MAT_TIMBER
  ));

  // Four legs from one box: abs() folds the domain in both horizontal axes.
  vec3 leg = t;
  leg.x = abs(leg.x) - (TABLE_HALF_X - 0.095);
  leg.z = abs(leg.z) - (TABLE_HALF_Z - 0.115);
  res = nearer(res, vec2(
    sdBox(leg - vec3(0.0, 0.355, 0.0), vec3(0.032, 0.355, 0.032)) - 0.006,
    MAT_TIMBER
  ));

  vec3 lamp = t - vec3(0.0, TABLE_TOP_Y, 0.0);
  float base = sdCylinderY(lamp - vec3(0.0, 0.014, 0.0), 0.014, 0.075);
  float stem = sdCylinderY(lamp - vec3(0.0, 0.160, 0.0), 0.160, 0.011);
  res = nearer(res, vec2(min(base, stem), MAT_BRASS));
  res = nearer(res, vec2(
    sdCappedCone(lamp - vec3(0.0, 0.316, 0.0), 0.072, 0.118, 0.048),
    MAT_ENAMEL
  ));
  res = nearer(res, vec2(length(lamp - vec3(0.0, LAMP_RISE, 0.0)) - 0.030, MAT_READING));

  return res;
}

/**
 * Distance to the nearest surface of Floor −2, and what that surface is made of.
 *
 * Same construction as the two floors above: the shell is exact planes rather
 * than a box, and everything with detail in it sits behind a bounding test.
 */
vec2 mapLibrary(vec3 p) {
  // Boards, not the chequered marble the two floors above are laid with. The
  // marble is a public floor — a lobby people walk across in outdoor shoes and a
  // corridor with a runner down it — and under the lamps down here it read as a
  // kitchen. Oak boards are what a reading room has, and they are darker, which is
  // most of what this room needed.
  vec2 res = vec2(p.y, MAT_BOARDS);
  res = nearer(res, vec2(LIBRARY_HEIGHT - p.y, MAT_PLASTER));
  res = nearer(res, vec2(p.z - LIBRARY_NEAR_Z, MAT_PLASTER));
  res = nearer(res, vec2(LIBRARY_HALF_WIDTH - abs(p.x), MAT_PLASTER));
  res = nearer(res, vec2(LIBRARY_FAR_Z - p.z, MAT_PLASTER));

  // The lift the visitor came down in, seen from the other side. Same two leaves
  // and the same carved seam as the corridor's, at the same height, because it is
  // the same lift — and there is no opening above it here. No daylight reaches
  // this floor at any hour, which is the whole reason its lighting does not move.
  float leaves = sdBox(p - vec3(0.0, 1.05, LIBRARY_FAR_Z - 0.055), vec3(0.62, 1.05, 0.045));
  float seam   = sdBox(p - vec3(0.0, 1.05, LIBRARY_FAR_Z - 0.055), vec3(0.006, 1.02, 0.090));
  res = nearer(res, vec2(carve(leaves, seam), MAT_BRASS));

  // Skirting along the foot of every wall. Same trick as the two floors above:
  // intersect close-to-a-wall with at-this-height.
  float toWall = min(
    LIBRARY_HALF_WIDTH - abs(p.x),
    min(LIBRARY_FAR_Z - p.z, p.z - LIBRARY_NEAR_Z)
  );
  res = nearer(res, vec2(max(toWall - 0.045, p.y - 0.145), MAT_TIMBER));

  res = nearer(res, mapShelving(p));
  res = nearer(res, mapReadingTables(p));

  return res;
}
`;

/**
 * The uniforms, and the precision the whole program is compiled at.
 *
 * `#version 300 es` has to be the very first characters of the source — not the
 * first non-blank line, the first characters — which is why this string starts
 * flush and why the assembly below joins rather than indents.
 */
const HEADER_GLSL = `#version 300 es
precision highp float;
precision highp int;

uniform vec2  uResolution;
uniform float uTime;
uniform vec3  uEye;
uniform vec3  uTarget;
uniform float uRoll;
uniform float uDepth;
uniform int   uMarchSteps;
uniform int   uShadowSteps;
uniform int   uVolumetricSamples;

// Floor 0's light rig. One set of values per solar state; see rooms/light-rig.ts.
uniform vec3  uKeyDirection;
uniform vec3  uKeyColour;
uniform float uKeyStrength;
uniform vec3  uPaneColour;
uniform float uPaneStrength;
uniform float uLampStrength;
uniform vec3  uAmbientFloor;
uniform vec3  uAmbientSky;
uniform float uDust;
uniform float uShutter;
uniform float uBleach;
uniform float uExposure;
uniform float uThreshold;

// Floor −1's light rig; see rooms/corridor-rig.ts.
uniform vec3  uSconceColour;
uniform float uSconceStrength;
uniform vec3  uShaftDirection;
uniform vec3  uShaftColour;
uniform float uShaftStrength;
uniform vec3  uCorridorFloor;
uniform vec3  uCorridorSky;
uniform float uCorridorDust;

// Floor −2's light rig; see rooms/library-rig.ts. Five of these six are the same
// at all five hours on purpose — that floor answers the sun with uInk and with
// nothing else.
uniform vec3  uReadingColour;
uniform float uReadingStrength;
uniform float uInk;
uniform float uLibraryExposure;
uniform vec3  uLibraryFloor;
uniform vec3  uLibrarySky;
uniform float uLibraryDust;

out vec4 fragColour;

// How close to an endpoint counts as arrived. Declared again in descent.ts as
// MORPH_EPSILON, because a shader cannot import; descent.spec.ts asserts the
// progress curve reaches every endpoint exactly, which is what keeps the two
// declarations from ever needing to agree on anything finer than this.
const float MORPH_EPSILON = 0.001;

/**
 * How much of a floor is in the frame, given where the lift is.
 *
 * The whole of the three-floor arrangement, in one line. uDepth counts floors
 * below the lobby, so a floor's weight is one minus how far the lift is from it,
 * clamped — which is 1 when the car is parked there, 0 whenever the car is a
 * whole floor or more away, and a fraction only for the two floors a ride is
 * between.
 *
 * Two properties are load-bearing and both are worth stating, because the
 * alternatives look identical and are not. The weights **sum to exactly 1** at
 * every depth, so every use below is a convex combination and nothing has to be
 * renormalised. And at every integer depth exactly one of them is exactly 1 and
 * the rest are exactly 0, so a settled floor is lit by its own rig alone rather
 * than by its own rig plus a rounding error of the floor above.
 *
 * This replaced a pair of complementary weights called above and below, which was
 * the same idea with the third floor's seat taken.
 *
 * The parameter is not named for what it is, because what it is, is a floor —
 * and floor is a GLSL built-in, which the compiler refuses to let anything shadow
 * and refuses with a line number and no reason.
 */
float floorWeight(float atDepth) {
  return clamp(1.0 - abs(uDepth - atDepth), 0.0, 1.0);
}

const float SURFACE_EPSILON = 0.0013;
const float MAX_DISTANCE    = 40.0;

// 46 degrees of vertical field of view: wide enough to hold a room, narrow enough
// that the near corner of the desk is not distorted into a wedge.
const float FOCAL_LENGTH = 2.35;
`;

/** The scene: the morph, the marches, the lights, and the frame. */
const SCENE_GLSL = `
// ---------------------------------------------------------------------------
// The scene, and the lift between its two floors
// ---------------------------------------------------------------------------

/**
 * Distance to the nearest surface of whichever room the lift is in or between,
 * and what that surface is made of.
 *
 * See the file comment for why the mix is a valid distance field and why the
 * material snaps rather than blends. Every branch here is on a uniform, so every
 * pixel in the draw takes the same side of all of them.
 *
 * **A ride evaluates two fields and a settled floor one — and each room is named
 * once.** The second half is the load-bearing half, and it is about the compiler
 * rather than the frame: this function is inlined at seven sites (the march, four
 * normal samples, the shadow, the occlusion, the volumetric), so a room written
 * twice is a second copy of its field in all seven. Written as three early returns
 * over a two-armed mix it named seven rooms rather than three, and SwiftShader
 * charged ten times the frame for a lobby whose geometry had not changed. Floors
 * −3 and −4 add an arm each and never a third field, because a lift is only ever
 * between two floors.
 */
vec2 mapScene(vec3 p) {
  // The leg the car is on, how far along it, and the rooms that leg needs. Only a
  // ride asks for two of them; a settled floor asks for one and skips the rest.
  float leg = uDepth < 1.0 ? 0.0 : 1.0;
  float t = uDepth - leg;
  bool lower = leg > 0.5;

  bool needLobby = !lower && t < 1.0;
  bool needCorridor = lower ? t < 1.0 : t > 0.0;
  bool needLibrary = lower && t > 0.0;

  // Nothing, arbitrarily far off: it loses every mix and every compare it meets.
  const vec2 NOWHERE = vec2(MAX_DISTANCE * 2.0, -1.0);

  vec2 corridor = needCorridor ? mapCorridor(p) : NOWHERE;
  vec2 above = lower ? corridor : (needLobby ? mapLobby(p) : NOWHERE);
  vec2 below = lower ? (needLibrary ? mapLibrary(p) : NOWHERE) : corridor;

  // Whichever surface is nearer, biased by the lift, which is what keeps an
  // emitter in frame the whole way down. mix() is exact at both ends but the bias
  // is not — a point on the lobby's ceiling is inside the corridor's, so at t = 0
  // it reads below.x < 0 and hands a settled Floor 0 plaster from a floor nobody
  // is standing on. So the endpoints name their own material.
  float pick = above.x * t - below.x * (1.0 - t);
  float material = t <= 0.0 ? above.y : t >= 1.0 ? below.y : pick < 0.0 ? above.y : below.y;

  return vec2(mix(above.x, below.x, t), material);
}

/**
 * Surface normal by the tetrahedron trick: four samples from the corners of a
 * regular tetrahedron rather than six for central differences. A third cheaper,
 * and indistinguishable on anything that is not a mirror — which the one mirror in
 * the building is, so the epsilon below is deliberately tight.
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

/**
 * March until something is hit. Returns (distance travelled, material or -1).
 *
 * The step cap is a parameter rather than the uniform, because the reflection
 * march wants fewer than the primary one and the difference is invisible: a
 * reflected image is already dimmer, tinted and half a room further away, so the
 * detail the last quarter of the steps would resolve is detail nobody can see.
 */
vec2 march(vec3 origin, vec3 rayDirection, int steps) {
  float travelled = 0.02;
  float material  = -1.0;

  for (int i = 0; i < steps; i++) {
    vec2 hit = mapScene(origin + rayDirection * travelled);

    // The epsilon widens with distance: a surface a metre away deserves a tighter
    // one than the far wall, and using the tight one everywhere spends steps
    // resolving detail finer than a pixel.
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
 * how close the shadow ray passed to an occluder, over how far it had come when it
 * did. No sampling, no jitter, no noise.
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
// The light the visitor brought
// ---------------------------------------------------------------------------

// Not a uniform, and that is the point. Every other light in this building
// answers to the sun — the moon through the transom, the desk lamp that goes out
// at noon, the sconces guttering towards dawn, the blade down the lift shaft. This
// one is yours. It is the same colour and the same strength at every hour, in a
// piece whose entire subject is that the hour decides everything, and it is the
// only thing here the sun has no opinion about.
const vec3  CARRIED_COLOUR   = vec3(1.00, 0.62, 0.28);
const float CARRIED_STRENGTH = 6.5;

/**
 * Where the lamp is: held low and out to the left, not at the eye.
 *
 * A light at the camera is a head torch. It lands on every surface the viewer can
 * see at full strength, casts no shadow they can observe, and flattens a corridor
 * into a photograph taken with a flash. Held down and to one side it throws a pool
 * with an edge, the doors on the right pick up a rim, and the geometry gets its
 * shape back.
 *
 * To the left specifically, which is the mirror's side. The pool falls on the
 * runner directly beneath the reflection of that same stretch of runner, so the
 * comparison the whole floor is built around is between two adjacent parts of one
 * frame rather than between opposite corners of it.
 *
 * And well out in front, which is the part that had to be measured rather than
 * chosen. At a 46° field of view from eye height, the nearest floor a standing
 * camera can see at all is about two and a half metres ahead of it. A lamp held at
 * the hip throws its pool a metre *behind* that — so the pool is below the bottom
 * edge of the frame while its absence from the mirror is right in the middle of
 * it, which is the worst of every possible arrangement: the evidence is off screen
 * and only the conclusion is visible. Held forward, both the pool and the place
 * where the pool is not land in the same picture, a hand's breadth apart.
 */
vec3 carriedPosition() {
  vec3 forward = normalize(uTarget - uEye);
  vec3 sideways = normalize(cross(vec3(0.0, 1.0, 0.0), forward));
  return uEye - sideways * 0.34 - vec3(0.0, 0.20, 0.0) + forward * 2.0;
}

/**
 * The flame, as a multiplier around 0.86 ± 0.14.
 *
 * Three incommensurable sines, for the same reason the camera uses four: a single
 * period reads as a pulse, and a pulse reads as a shader. What this is actually
 * for is the Definition of Done. A still absence has to be found by comparing two
 * regions of a static frame, which people do slowly and often not at all; a moving
 * absence is caught by peripheral vision, which is fast and involuntary. The lit
 * corridor breathes. The reflection does not move at all. Nobody needs to be told
 * to look.
 */
float carriedFlicker() {
  return 0.86 + 0.14 * (
    sin(uTime * 11.3) * 0.40 +
    sin(uTime * 17.9 + 1.7) * 0.28 +
    sin(uTime * 4.1 + 3.3) * 0.32
  );
}

// ---------------------------------------------------------------------------
// Shading
// ---------------------------------------------------------------------------

// What the silvering does to what it gives back. A hundred-year-old mirror is not
// a clean return path: it loses a little of everything and rather more of the blue
// end, which is why an old mirror reads warm even when what it is reflecting is
// not.
const vec3 MIRROR_TINT = vec3(0.86, 0.82, 0.75);

/**
 * How much of the silvering is left at a point on the glass.
 *
 * Slow blotches rather than fine speckle. The failure of a mercury backing spreads
 * from the edges in patches the size of a hand, and the version of this with
 * high-frequency noise in it read immediately as dirt on a lens rather than as
 * damage to a surface — which matters, because a viewer who thinks they are
 * looking through something dirty will attribute the missing light to the dirt and
 * the whole floor loses its point.
 */
float silvering(vec3 p) {
  float blotch = sin(p.z * 0.71 + sin(p.y * 1.93) * 1.31) * 0.5 + 0.5;
  float edge = smoothstep(0.0, 0.55, min(p.z - MIRROR_NEAR_Z, MIRROR_FAR_Z - p.z));
  return mix(0.58, 1.0, smoothstep(0.12, 0.86, blotch)) * mix(0.55, 1.0, edge);
}

/**
 * The ambient hemisphere at a normal, mixed between the two floors by the lift.
 *
 * Two colours standing in for a bounce solution, which at night is all anyone can
 * tell apart. Kept very low on purpose — ambient is the enemy of a single-source
 * room: raise it until everything is legible and the shaft stops being the
 * brightest thing in the frame, at which point the picture is a lit room with a
 * window in it rather than a dark room the moon has got into.
 */
vec3 roomAmbient(vec3 n) {
  // A weighted sum rather than nested mixes, now that there are three of them.
  // It is still a convex combination: floorWeight's three values sum to exactly 1
  // at every depth, which is the property the function comment calls load-bearing
  // and this is the place it is load-bearing for. If they did not, the ambient
  // would dim in the middle of every ride for no reason anybody could name.
  float w0 = floorWeight(0.0);
  float w1 = floorWeight(1.0);
  float w2 = floorWeight(2.0);

  return mix(
    uAmbientFloor * w0 + uCorridorFloor * w1 + uLibraryFloor * w2,
    uAmbientSky * w0 + uCorridorSky * w1 + uLibrarySky * w2,
    n.y * 0.5 + 0.5
  );
}

/**
 * Everything that lands on one surface point.
 *
 * @param carried Whether the visitor's own lamp reaches this point: 1 in the
 *   world, 0 inside the mirror. This one argument is the whole of Floor −1's
 *   idea, and it is deliberately not physical. A correct mirror would show the lit
 *   floor, because the floor is lit and the mirror reflects the floor; reflecting a
 *   room but not the light that fell on it is arithmetic optics does not permit.
 *   The departure is the phenomenon. Everything else in this file is ordinary
 *   rendering, and this is the line the room is named for.
 */
vec3 shadeSurface(vec3 p, vec3 n, vec3 viewDirection, float id, float carried) {
  // The emitters are their own picture. Lighting them would only make them grey.
  if (id == MAT_GLASS) {
    float up = clamp((p.y - TRANSOM_CENTRE.y + TRANSOM_HALF.y) / (TRANSOM_HALF.y * 2.0), 0.0, 1.0);
    return uPaneColour * uPaneStrength * (1.0 + up * 0.9);
  }
  if (id == MAT_FILAMENT) {
    // Out with the lamp. A filament still glowing under an unlit shade is the kind
    // of detail nobody names and everybody sees.
    return LAMP_COLOUR * 5.0 * step(0.01, uLampStrength);
  }
  if (id == MAT_SCONCE) {
    // The glass of a sconce is lit from inside, so it is brightest where the bowl
    // is deepest — which is the bottom, not the middle.
    float depth = clamp((SCONCE_Y - p.y) / 0.14, 0.0, 1.0);
    return uSconceColour * uSconceStrength * (1.6 + depth * 2.4);
  }
  if (id == MAT_SHAFT) {
    return uShaftColour * uShaftStrength * 1.4;
  }
  if (id == MAT_READING) {
    // Under a banker's shade, so it is only ever seen from below and from the two
    // open ends. No hour term at all: this is the floor whose light does not
    // answer the sun.
    return uReadingColour * uReadingStrength * 2.6;
  }

  float roughness;
  float metallic;
  vec3 albedo = faded(surfaceAlbedo(id, p, roughness, metallic));

  // A mirror is not a diffuse surface, and shading it as one is the mistake that
  // cost this floor its whole subject for an afternoon. Lit like plaster, the
  // glass came out several times brighter than the reflection being added on top
  // of it — so the mirror washed out its own image, the dark patch where the
  // visitor's lamp should have been was buried under the wall's own glow, and the
  // room read as a corridor with a pale wall down one side.
  //
  // What is not reflection here is the silvering that has failed, and failed
  // silvering scatters. So the diffuse term is scaled by how much of the backing
  // has gone rather than by how much light is falling on it, which is both nearer
  // the physics and, far more importantly, dark.
  if (id == MAT_MIRROR) {
    return albedo * roomAmbient(n) * 3.0 * (1.0 - silvering(p));
  }

  float above = floorWeight(0.0);
  float below = floorWeight(1.0);
  float deeper = floorWeight(2.0);

  vec3 diffuse = vec3(0.0);
  vec3 gloss   = vec3(0.0);

  // --- Floor 0: the moon through the transom, and the desk lamp ----------------
  if (above > MORPH_EPSILON) {
    vec3 toKey = -uKeyDirection;
    float keyFacing = max(dot(n, toKey), 0.0);
    vec2 beam = transomBeam(p, SLAT_EDGE_SURFACE);

    // Both gates are needed and they do different jobs: admittance decides whether
    // the point is inside the beam at all, the march decides whether something in
    // the room is standing in the way. Skipping the march when the point is
    // outside the beam is the largest single saving in this shader.
    //
    // The march stops short of the pane, for the reason in transomBeam: the window
    // is geometry, and a shadow ray allowed to reach it finds the light source and
    // calls it an occluder. The cap is a fraction of the distance rather than a
    // fixed margin, because this is a penumbra estimate and how close a ray may
    // pass to something before it counts as shade grows with how far it has come.
    float keyShadow = (beam.x > 0.001 && keyFacing > 0.0)
      ? softShadow(p, toKey, beam.y * 0.85)
      : 0.0;
    float keyLight = keyFacing * beam.x * keyShadow;

    vec3 toLamp = LAMP_POSITION - p;
    float lampRange = length(toLamp);
    toLamp /= max(lampRange, 0.0001);
    // The shade is opaque and open at the bottom, so the lamp throws down and
    // sideways but not up. A mask on the light's vertical component is the whole
    // model, and it costs one smoothstep instead of a shadow march.
    float shadeMask = smoothstep(0.35, -0.30, toLamp.y);
    float lamp = max(dot(n, toLamp), 0.0) * shadeMask / (1.0 + lampRange * lampRange * 1.35);

    diffuse += above * (uKeyColour * uKeyStrength * keyLight + LAMP_COLOUR * uLampStrength * lamp);
    gloss += above * (
      uKeyColour * uKeyStrength * keyLight * specularLobe(n, viewDirection, toKey, roughness) +
      LAMP_COLOUR * uLampStrength * lamp * specularLobe(n, viewDirection, toLamp, roughness)
    );
  }

  // --- Floor −1: the sconces, the shaft, and the lamp you brought --------------
  if (below > MORPH_EPSILON) {
    // The sconces repeat along the corridor, so the nearest one is arithmetic
    // rather than a search. Three of them are summed — the nearest and its two
    // neighbours — because beyond that the inverse square has taken the
    // contribution below the dither floor, and seven lights per pixel to render
    // three visible ones is six wasted.
    float nearest = floor((p.z - SCONCE_OFFSET_Z) / SCONCE_PITCH + 0.5);

    for (float k = -1.0; k <= 1.0; k += 1.0) {
      float index = nearest + k;
      if (index < SCONCE_FIRST || index > SCONCE_LAST) {
        continue;
      }

      vec3 toSconce = sconcePosition(index) - p;
      float range = length(toSconce);
      toSconce /= max(range, 0.0001);

      // The bowl is open at the top and solid underneath, which makes it an
      // uplighter: it throws up the wall and out across the corridor, and almost
      // nothing downwards. Same one-smoothstep model as the desk lamp's shade, and
      // the sign of it matters — the first version of this mask had the test the
      // other way round and lit only the wall the sconce was screwed to, which
      // renders as a perfectly plausible corridor and is why it survived until
      // somebody looked at the floor.
      //
      // The floor keeps a fifth of it rather than none, and that floor under the
      // mask is doing the most important job in the room. An uplighter that throws
      // strictly nothing downwards leaves the corridor's floor lit by the
      // visitor's lamp alone — so in the mirror, where the lamp does not exist, the
      // floor is simply black, and a black strip along the bottom of a mirror
      // reads as a dark mirror rather than as an unlit floor. The absence has to
      // land on something a viewer can see. With the spill, the reflection shows
      // the same chequer and the same runner as the real floor beside it, lit the
      // same way by the same sconces, and missing exactly one thing.
      float bowlMask = mix(0.20, 1.0, smoothstep(0.45, -0.20, toSconce.y));
      float lit = max(dot(n, toSconce), 0.0) * bowlMask / (1.0 + range * range * 0.85);

      diffuse += below * uSconceColour * uSconceStrength * lit;
      gloss += below * uSconceColour * uSconceStrength * lit *
        specularLobe(n, viewDirection, toSconce, roughness);
    }

    // The day, arriving through the lift. Shadowed by a real march because unlike
    // the transom there is furniture in the way — the doors stand proud of their
    // wall and the blade crosses every one of them.
    vec2 blade = shaftBlade(p);
    vec3 toShaft = -uShaftDirection;
    float shaftFacing = max(dot(n, toShaft), 0.0);
    float shaftShadow = (blade.x > 0.001 && shaftFacing > 0.0)
      ? softShadow(p, toShaft, blade.y * 0.85)
      : 0.0;
    float shaftLight = shaftFacing * blade.x * shaftShadow;
    diffuse += below * uShaftColour * uShaftStrength * shaftLight;
    gloss += below * uShaftColour * uShaftStrength * shaftLight *
      specularLobe(n, viewDirection, toShaft, roughness);

    // And the lamp in the visitor's hand — or, in the mirror, not.
    if (carried > 0.0) {
      vec3 toCarried = carriedPosition() - p;
      float range = length(toCarried);
      toCarried /= max(range, 0.0001);
      // A tight falloff, and tighter than a real flame's. The pool has to have an
      // edge a viewer can see, because a lamp whose light reaches the far end of
      // the corridor is a lamp whose absence from the mirror is a uniform dimming
      // rather than a hole in a particular place.
      float held = max(dot(n, toCarried), 0.0) / (1.0 + range * range * 0.55);
      float flame = carriedFlicker() * carried;

      diffuse += below * CARRIED_COLOUR * CARRIED_STRENGTH * held * flame;
      gloss += below * CARRIED_COLOUR * CARRIED_STRENGTH * held * flame *
        specularLobe(n, viewDirection, toCarried, roughness);
    }
  }

  // --- Floor −2: the reading lamps, and the light along the top of the cases ---
  //
  // The lamp the visitor carried down the corridor is weighted out by the ride,
  // which is the corridor taking it back: it was lent because that floor had none
  // to spare, and the library has light of its own. What crosses the second leg
  // of the descent is a hand going empty as a room comes up around it.
  if (deeper > MORPH_EPSILON) {
    // The tables repeat, so the nearest is arithmetic rather than a search — the
    // same construction the sconces use, and the same three of them summed for
    // the same reason.
    float nearest = floor(p.z / TABLE_PITCH + 0.5);

    for (float k = -1.0; k <= 1.0; k += 1.0) {
      float index = nearest + k;
      if (index < TABLE_FIRST || index > TABLE_LAST) {
        continue;
      }

      vec3 toLamp = readingLampPosition(index) - p;
      float range = length(toLamp);
      toLamp /= max(range, 0.0001);

      // A banker's shade is opaque over the top and open at both ends, so it
      // throws down onto the table and sideways down the room, and nothing at all
      // at the ceiling.
      //
      // Note which way round this runs. toLamp points *from the surface to the
      // lamp*, so a table top under the shade sees it pointing straight up — and
      // the mask therefore has to rise with toLamp.y, not fall with it. Written the
      // other way it lights only what is above the lamp, which is a room with four
      // lit ceilings and four dark tables, and it renders as a plausible dim
      // library rather than as anything obviously wrong.
      float shadeMask = smoothstep(-0.34, 0.24, toLamp.y);
      float lit = max(dot(n, toLamp), 0.0) * shadeMask / (1.0 + range * range * 0.42);

      diffuse += deeper * uReadingColour * uReadingStrength * lit;
      gloss += deeper * uReadingColour * uReadingStrength * lit *
        specularLobe(n, viewDirection, toLamp, roughness);
    }

    // The cornice: a continuous run of lamps along the top of each case, which is
    // what actually lights a library and is the only reason the top shelf is
    // legible. It is a *line* source rather than a point one, and that is worth
    // modelling honestly rather than approximating with more point lights.
    //
    // The nearest point on a line parallel to z is directly abeam, so the whole
    // thing is one subtraction per wall and no loop. And a line source falls off
    // with 1/r rather than 1/r², which is exactly why a real library has its
    // lighting arranged this way: it is what puts the bottom shelf and the top
    // shelf within a stop of one another, so a reader can read both.
    for (float side = -1.0; side <= 1.0; side += 2.0) {
      vec3 onCornice = vec3(side * (LIBRARY_HALF_WIDTH - CASE_DEPTH * 0.55), CASE_TOP + 0.12, p.z);
      vec3 toCornice = onCornice - p;
      float range = length(toCornice);
      toCornice /= max(range, 0.0001);

      // Weak, and weaker than it looks like it should be. A line source with 1/r
      // falloff reaches *everything*: the first version of this ran at a third of
      // the lamp strength and turned the room into an evenly lit beige box with no
      // light in it anywhere — the same failure the daytime lobby had before the
      // bleach was moved onto the albedo, and the one AUBADE's own note about the
      // morph being a beige mess is complaining about. Its job is to make the top
      // shelf readable, not to light the room; the lamps light the room.
      float lit = max(dot(n, toCornice), 0.0) / (1.0 + range * range * 0.55);
      diffuse += deeper * uReadingColour * uReadingStrength * lit * 0.16;
      gloss += deeper * uReadingColour * uReadingStrength * lit * 0.16 *
        specularLobe(n, viewDirection, toCornice, roughness);
    }
  }

  vec3 ambient = roomAmbient(n);
  float occlusion = ambientOcclusion(p, n);

  diffuse = albedo * (diffuse + ambient * occlusion * 3.0);

  // The invitation's mark: a hairline of the day under a shut door, in a room that
  // is otherwise three in the morning. Two smoothsteps on the floor and no light
  // source at all, because there is nothing in the room for it to light. A visitor
  // should find this rather than be shown it.
  //
  // Weighted by the lift, and not defensively: the corridor's floor passes within
  // 400mm of the lobby's doorway in x, so without this the mark reappears on Floor
  // −1 as an unexplained streak under a door that is one storey up.
  if (uThreshold > 0.0 && id == MAT_FLOOR && above > MORPH_EPSILON) {
    float acrossDoor = 1.0 - smoothstep(0.42, 0.58, abs(p.x - DOOR_X));
    float fromDoor   = 1.0 - smoothstep(0.015, 0.22, abs(p.z - 2.06));
    diffuse += vec3(1.00, 0.94, 0.82) * uThreshold * acrossDoor * fromDoor * 0.85 * above;
  }

  // Metals have no diffuse term at all; their colour lives in the specular. What
  // they do have is the room: a metal with no lobe pointed at it reflects whatever
  // is around it, which is the ambient, tinted by the metal. That term used to be a
  // flat zero, and under daylight it drew a hard black bar along the front of the
  // desk — the single most conspicuous thing in the frame and the one nobody would
  // read as brass.
  vec3 roomInMetal = albedo * ambient * occlusion * 3.0;

  vec3 specularTint = mix(vec3(1.0), albedo, metallic);
  float fresnel = pow(1.0 - max(dot(n, -viewDirection), 0.0), 5.0);
  float reflectivity = mix(0.04 + fresnel * 0.5, 1.0, metallic);

  return mix(diffuse, roomInMetal, metallic) + gloss * specularTint * reflectivity * occlusion;
}

// ---------------------------------------------------------------------------
// The mirror
// ---------------------------------------------------------------------------

/**
 * The second march: what the mirror has to say.
 *
 * Reflect the view ray about the wall's normal, march it back across the corridor,
 * and shade whatever it finds — with carried at zero, which is the entire idea of
 * this floor and is one argument wide.
 *
 * GLSL has no recursion, so this is declared below shadeSurface and never calls
 * itself. It does not need to: there is one mirror and it is a plane, so a ray
 * bounced off it travels away from it and cannot come back.
 *
 * There are no volumetrics in here either, and their absence is doing work rather
 * than saving it. The visitor's lamp has a halo in the air around it; in the
 * reflection there is no lamp, so there is nothing for a halo to be around.
 */
vec3 mirrorReflection(vec3 p, vec3 n, vec3 rayDirection) {
  vec3 bounced = reflect(rayDirection, n);

  // Off the surface far enough that the march does not immediately re-hit the wall
  // it started on, and no further, because the offset is a visible seam at the
  // foot of the mirror if it is generous.
  vec3 origin = p + n * 0.012;

  int steps = max((uMarchSteps * 3) / 4, 24);
  vec2 hit = march(origin, bounced, steps);
  if (hit.y < 0.0) {
    return vec3(0.0);
  }

  vec3 q = origin + bounced * hit.x;
  vec3 seen = shadeSurface(q, sceneNormal(q), bounced, hit.y, 0.0);

  return seen * MIRROR_TINT * silvering(p);
}

// ---------------------------------------------------------------------------
// The air
// ---------------------------------------------------------------------------

/**
 * Integrate light scattered towards the camera along the view ray.
 *
 * Both floors' contributions, weighted by the lift. On Floor 0 that is the moon's
 * beam, gated by the transom aperture and the desk's slab shadow, plus a soft halo
 * around the lamp. On Floor −1 it is the blade down the shaft and the halo around
 * the lamp in the visitor's hand. The halos are real scattering rather than a
 * screen-space blur — cheaper than a second pass, and correct when something
 * stands in front of the source.
 *
 * The start offset is dithered per pixel. Without it, twenty samples across four
 * metres band into twenty visible shells; with it the same twenty read as grain,
 * which the film grain at the end then absorbs.
 */
vec3 scatteredLight(vec3 origin, vec3 rayDirection, float depth, float dither) {
  int sampleCount = max(uVolumetricSamples, 1);
  float span = min(depth, 15.0);
  float stepLength = span / float(sampleCount);

  float above = floorWeight(0.0);
  float below = floorWeight(1.0);
  float deeper = floorWeight(2.0);
  vec3 lampAt = carriedPosition();
  float flame = carriedFlicker();

  vec3 accumulated = vec3(0.0);

  for (int i = 0; i < sampleCount; i++) {
    vec3 p = origin + rayDirection * ((float(i) + dither) * stepLength);
    float glint = 0.85 + 0.5 * hash13(floor(p * 26.0) + floor(uTime * 3.0));

    if (above > MORPH_EPSILON) {
      float beam = transomBeam(p, SLAT_EDGE_AIR).x;
      if (beam > 0.002) {
        accumulated +=
          above * uKeyColour * beam * deskShadow(p) * dustDensity(p) * glint * 0.055 * uDust;
      }

      float lampRange = length(LAMP_POSITION - p);
      accumulated += above * LAMP_COLOUR * 0.010 * min(uLampStrength, 1.0) /
        (1.0 + lampRange * lampRange * lampRange * 2.2);
    }

    if (below > MORPH_EPSILON) {
      float blade = shaftBlade(p).x;
      if (blade > 0.002) {
        accumulated +=
          below * uShaftColour * blade * dustDensity(p) * glint * 0.050 * uCorridorDust * uShaftStrength;
      }

      // The halo the visitor is standing inside. It is the one volumetric in the
      // piece with a light source that moves, so the dust in it turns over as the
      // camera breathes rather than hanging in a fixed cone.
      float carriedRange = length(lampAt - p);
      accumulated += below * CARRIED_COLOUR * 0.020 * flame * dustDensity(p) * uCorridorDust /
        (1.0 + carriedRange * carriedRange * carriedRange * 1.6);
    }

    if (deeper > MORPH_EPSILON) {
      // The cone under each reading shade, in the air. The dustiest room in the
      // building and the only one where the haze is the point rather than the
      // medium: a library's light is visible because a library is full of paper.
      // Much tighter than the arithmetic suggests it wants to be. Four lamps in a
      // room this size, each with a halo generous enough to look right on its own,
      // sum into a uniform warm veil over the whole frame — every surface lifted,
      // every shadow filled, and a picture with no depth in it. The haze has to
      // stop at the edge of each shade or it stops being four lamps in the dark and
      // becomes fog with furniture in it.
      float index = clamp(floor(p.z / TABLE_PITCH + 0.5), TABLE_FIRST, TABLE_LAST);
      float lampRange = length(readingLampPosition(index) - p);
      accumulated += deeper * uReadingColour * 0.0045 * uReadingStrength *
        dustDensity(p) * uLibraryDust /
        (1.0 + lampRange * lampRange * lampRange * 3.2);
    }
  }

  return accumulated * stepLength;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

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

  vec2 hit = march(uEye, rayDirection, uMarchSteps);

  vec3 colour = vec3(0.0);
  if (hit.y >= 0.0) {
    vec3 p = uEye + rayDirection * hit.x;
    vec3 n = sceneNormal(p);
    colour = shadeSurface(p, n, rayDirection, hit.y, 1.0);

    // The mirror, once the lift has finished and the room it reflects exists. See
    // the file comment for why this waits for the end of the ride rather than
    // fading up through it.
    if (hit.y == MAT_MIRROR && abs(uDepth - 1.0) < MORPH_EPSILON) {
      colour += mirrorReflection(p, n, rayDirection);
    }
  }

  colour += scatteredLight(uEye, rayDirection, hit.x, interleavedGradient(gl_FragCoord.xy));

  // A vignette, because this is looking into a room rather than at a scene. Gentle
  // enough to be felt rather than seen.
  colour *= 1.0 - 0.075 * dot(uv, uv);

  colour = tonemap(colour);
  colour = pow(colour, vec3(1.0 / 2.2));

  // Grain, below the quantisation step. This image lives in the bottom eighth of
  // an 8-bit range, where a gradient bands visibly; a dither below the
  // quantisation step is what makes the shadows read as continuous rather than
  // terraced.
  colour += (hash13(vec3(gl_FragCoord.xy, fract(uTime) * 601.0)) - 0.5) * 0.016;

  fragColour = vec4(colour, 1.0);
}
`;

/**
 * The whole program, assembled.
 *
 * Order is declaration order and is not negotiable — see the split note in
 * the file comment. `join` rather than a template literal with interpolations, so
 * that the line numbers a compiler reports index straight into this string and
 * `verify-shader.mjs` can print the offending line.
 */
export const HOTEL_FRAGMENT_SHADER = [
  HEADER_GLSL,
  COMMON_PRIMITIVES_GLSL,
  LOBBY_GLSL,
  CORRIDOR_GLSL,
  LIBRARY_GLSL,
  COMMON_SHADING_GLSL,
  SCENE_GLSL,
].join('\n');
