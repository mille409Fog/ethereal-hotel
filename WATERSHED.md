# WATERSHED — a landscape that erodes while you watch

The second spectacle on this site, after `/murmuration`, and meant to be much larger. Nothing in
this file is built yet. It is the whole plan: what the piece is, the decisions already taken and
why, and ten phases with Definitions of Done so that one instance can build a phase and another
can verify it.

**Phases are deleted as they land and the rest renumbered from 0**, as `ROADMAP.md` does. The
reasoning that survives a finished phase moves into the header of the file it describes. So a
phase number is a position in a queue; never cite one from outside this file.

## The piece

A block of raw, uplifted land eight kilometres on a side stands in a sea of cloud under a storm.
It rains. Water finds itself: threads become streams, streams take each other's valleys, ridges
sharpen, the hard strata stand out as benches and the soft ones go, fans of sediment spread
where the slopes give out, and a lake fills behind whatever the land happened to leave standing.
The whole storm takes about ninety seconds. Then the weather breaks, and the camera comes down
off its high vantage and makes one slow pass at golden hour, low, through a country that did not
exist two minutes ago and that nobody drew.

Every seed is a different land. `?seed=` reproduces one.

### What is real, and the one thing that is not

The land is not noise. It is the output of a hydraulic erosion simulation running on the GPU
while you watch: the virtual-pipes shallow-water model of Mei, Decaudin and Hu (_Fast Hydraulic
Erosion Simulation and Visualization on GPU_, 2007), with a regolith layer and thermal slumping
added. Dendritic drainage is what makes real terrain look real and it is the one feature fractal
noise cannot fake. A TypeScript reference of the same step runs under Vitest, and a gate holds
the shaders to it.

Everything drawn reads the simulation's own textures. The rivers are where the water texture has
depth; the pale fans are where the regolith texture has thickness; the mist pools where the
water is. No painted map says where anything goes.

**The model has no calendar, and the piece must not invent one.** The erosion constants are
tuned so that a storm of twelve thousand steps carves a legible landscape; they are not
calibrated to a rock type or a climate, so "ten thousand years" would be the first made-up
number on a site whose bar is that there are none. The readout shows what the simulation
actually knows: steps taken, rain delivered as a depth, rock moved as a volume, rock carried off
the edge. If a sentence about deep time is wanted it goes in prose and says _like_.

### Three states, said on screen

The dashboard tells a visitor which transport their numbers came from. This route does the same
with its land, in one line of ordinary text under the readout:

| State        | When                                                      | What is drawn                                      |
| ------------ | --------------------------------------------------------- | -------------------------------------------------- |
| `simulating` | Float render targets exist and motion is allowed          | The storm, live, for the visitor's seed            |
| `still`      | `prefers-reduced-motion`                                  | The stored land for the hero seed, one frame       |
| `stored`     | The device cannot render to 32-bit float (see §Decisions) | The stored land, with the camera pass but no storm |

The line says which, and in the last two says that the land was computed earlier by the same
model and names its seed. It is the reason the fallback is honest rather than a fake.

## Decisions already taken

Each of these was a fork. They are recorded so the next instance does not reopen them without a
measurement.

- **32-bit float state, or no live simulation.** Heights run to about 2,400 m and erosion moves
  millimetres per step. Half-float has eleven bits of mantissa, which is a metre of resolution at
  that altitude; the simulation would be quantisation noise. So the simulation requires
  `EXT_color_buffer_float` with `RGBA32F` targets, and a device without it gets the `stored`
  state. Do not "support" half-float by rescaling heights; it was considered.
- **Nearest sampling in the simulation, bilinear by hand.** `OES_texture_float_linear` is absent
  on a real share of phones. The simulation uses `texelFetch` throughout and the one pass that
  needs interpolation (sediment transport) does it explicitly from four fetches. The drawing
  shaders do the same when they read state.
- **Edges drain.** A closed boundary turns the block into a bathtub. Cells outside the grid are
  treated as empty ground at base level: water and sediment that cross the edge are removed, and
  the sediment is tallied as exported. The uplift is shaped so the divide is inland.
- **Bedrock and regolith are separate layers.** State carries bedrock height `b` and loose
  material `r`; the surface is `b + r`. Deposition adds to `r`, erosion takes `r` first at a high
  rate and then bedrock at the rate its stratum allows, and rockfall turns bedrock into `r`. This
  is what lets the drawing show sediment where sediment actually is.
- **Strata are a lookup by absolute elevation.** A 256×1 table of hardness and colour, built from
  the seed on the CPU, read at `b + warp(x, z)` where `warp` is a small 2D texture that tilts and
  folds the beds. Erosion therefore cuts _through_ layers, and benches and cliffs appear without
  being placed.
- **The initial land is built once, on the CPU, in TypeScript.** `uplift.ts` fills a
  `Float32Array` and it is uploaded as a texture. There is no GLSL copy of the noise, so the
  reference model and the GPU model start from the same bytes by construction.
- **The pass list is data.** `sim-shaders.ts` exports `SIM_PASSES`: for each pass its fragment
  source, the textures it reads and the texture it writes. The three.js driver in the route and
  the raw-WebGL harness in the parity script both iterate that one table, so they cannot run
  different simulations.
- **Light is computed in texture space.** Sun shadow and ambient occlusion are marched through
  the height texture into a 512² light texture, once per frame while the land or sun is moving
  and never otherwise. Marching per screen pixel costs about six times as many texture reads at
  1080p and is what SwiftShader would choke on.
- **One sky function, used three times.** The dome, the water's reflection and the fog's
  inscatter all call the same GLSL function with the same `weather` and sun uniforms. Three
  separately tuned skies drift apart in a week.
- **The storm is counted in steps, not seconds.** Progress is `steps / STORM_STEPS`. A slow
  device takes longer to reach the end; it does not get a different land. The fixed-step
  accumulator is the idea `cauldron-clock.ts` already has.
- **The block stands in cloud.** An eight-kilometre tile has edges. They are shown, cut clean
  with the strata visible in section on the sides, and a fog deck below the rim replaces the
  horizon. No ring of unsimulated backdrop mountains: they would be the one thing in frame the
  model did not make.
- **No sound, no new dependency, no WebGPU.** As for every piece on this site.

## Traps specific to this piece

- **A module a script imports must be a leaf.** Node runs `scripts/*.mjs` against the TypeScript
  source directly and its resolver has no extensionless resolution, while the Angular build
  forbids `.ts` specifiers; `hotel.frag.ts` documents the collision. So everything under
  `model/`, and `sim-shaders.ts`, may use `import type` and nothing else, and takes its constants
  as arguments. Erasable syntax only: no `enum`, no parameter properties.
- **GLSL is in template literals.** No backtick in a shader comment. GLSL ES 3.00 reserves
  `sample`, `input`, `output`, `half` and more; a sediment variable called `sample` fails with a
  line number and no reason.
- **The pipe model explodes above its timestep limit**, and it does so beautifully enough to be
  mistaken for a feature for a few seconds. A spec asserts the limit from the calibrated
  constants, and the erode pass clamps velocity. If the land turns to spikes, lower the timestep
  before touching anything else.
- **Semi-Lagrangian transport does not conserve mass.** The erode and deposit exchange is exactly
  conservative and is tested as such; advection is not, and is tested as a bounded drift. Do not
  "fix" the exact test by loosening it when the bounded one is the one that moved.
- **A PNG with an alpha channel is premultiplied on decode** and the low byte of a height is
  destroyed. The stored land is RGB only, decoded with colour-space conversion off.
- **Two machines do not make the same land from one seed.** GPU float arithmetic differs in the
  last bit and erosion is chaotic. A seed reproduces a land exactly on one machine and in
  character everywhere else. Do not write an e2e test that compares a live land to stored bytes.
- **The three.js chunk is about 570 kB against a 620 kB warning.** This piece needs nothing from
  `three/examples/jsm` that murmuration does not already import. Keep it that way; no
  `GPUComputationRenderer`, the driver is forty lines over `WebGLRenderTarget`.

## Layout

```text
src/app/watershed/
  watershed.ts  .html  .css  .spec.ts     the component: assembles, owns nothing clever
  watershed.tokens.ts                     renderer, composer, random (as murmuration.tokens.ts)
  seed/            seed.ts                mulberry32, parseSeed, HERO_SEED
  model/           (leaf modules; the reference, importable by Node)
    erosion-calibration.ts                every simulation constant, with its unit
    fields.ts                             the state arrays and their layout
    uplift.ts      strata.ts              initial land; hardness and colour table, warp
    step.ts                               rain, flux, water, erode, transport, slump
    tally.ts                              totals: water, bedrock, regolith, suspended, exported
  sim/
    sim-shaders.ts                        the same step as GLSL, and SIM_PASSES (leaf)
    sim-driver.ts                         ping-pong targets over SIM_PASSES
    sim-clock.ts                          fixed-step accumulator, steps per frame by tier
    sim-support.ts                        the float-target probe; decides `stored`
  land/            mesh, light pass, material shader, calibration
  water/           surface mesh, flow-mapped normals, calibration
  air/             sky function, fog, cloud shadow, rain, calibration
  direction/       direction.ts (the curves), camera-path.ts, calibration
  stored/          stored-land.ts         decode the committed land into the same textures
scripts/
  watershed-land.mjs  (+ .test.mjs)       pack and unpack, pure
  build-watershed-land.mjs                run the reference for HERO_SEED, write the PNG
  verify-watershed.mjs                    GPU against reference, in Chromium
public/watershed-land.png
e2e/watershed.spec.ts
```

State textures, all `RGBA32F` at `GRID` × `GRID` (512; 1024 on the top tier):

| Texture | R            | G             | B                   | A             |
| ------- | ------------ | ------------- | ------------------- | ------------- |
| `land`  | bedrock `b`  | regolith `r`  | water depth `d`     | suspended `s` |
| `flux`  | out left     | out right     | out up              | out down      |
| `flow`  | velocity `u` | velocity `v`  | speed               | unused        |
| `slump` | out left     | out right     | out up              | out down      |
| `light` | sun shadow   | ambient occl. | humidity (for mist) | unused        |

## The phases

### Phase 0 — the stage

Build the route with nothing on it worth looking at, so every later phase is only about the
picture.

1. Create `src/app/watershed/` with a component shaped like `src/app/murmuration/murmuration.ts`:
   a `viewChild` canvas, renderer and composer behind injection tokens, a failure signal that
   swaps the canvas for a sentence, `HomeLink` floating over the corner, and an `ngOnDestroy`
   that disposes every target, geometry, material and pass it made.
2. `seed/seed.ts`: mulberry32, `parseSeed(search)` returning a 32-bit integer or null, and
   `HERO_SEED`. The route's seed is the URL's, else one drawn through the random token, whose
   default is `Math.random` because the frame spec pins chance by replacing it.
3. The HDR chain: a half-float colour target with a depth texture (as `MURMURATION_COMPOSER`
   builds it), `RenderPass`, `UnrealBloomPass`, `OutputPass`, then murmuration's `GradePass` and
   `GrainPass` imported, not copied. Add a dither of one least-significant bit before output;
   the fog and sky are smooth gradients and will band without it.
4. Reduced motion decided once at start: one `composer.render()` and no animation loop.
5. Quality tiers in a calibration file: internal resolution scale, grid size, simulation steps
   per frame. The tier is chosen from frame time measured over the first second, never from a
   user-agent string. Pixel ratio capped as `renderer-calibration.ts` caps it.
6. `webglcontextlost` stops the loop and shows the failure sentence.
7. `sim/sim-support.ts`: create a 4×4 `RGBA32F` target, render a known value, read it back.
   True means `simulating` is possible. This is a real render and read, not an extension query;
   some drivers advertise the extension and fail the framebuffer.
8. Wire only what is needed to load the route locally: the `src/route-meta.json` entry and the
   lazy route in `src/app/app.routes.ts`. The project card and the rest wait for the last phase.
9. A temporary e2e test that prints what `sim-support` returns under CI's SwiftShader. Read the
   same value on one real phone. Record both in the header of `sim-support.ts`, then delete the
   test.

**DoD.** The route draws a lit placeholder plane through the full chain. The component spec
passes with a stub renderer and composer and covers the failure path, the reduced-motion path
and disposal. `npm test` coverage has not fallen. The three.js chunk size after this phase is
written in this file as the baseline for later phases. The probe's two results are recorded.

### Phase 1 — the reference model

The simulation in plain TypeScript on plain arrays. No WebGL, no three.js, no Angular. This is
the specification the shaders will be held to, and it is also what builds the stored land.

1. `fields.ts`: `IFields` with `Float32Array`s `b`, `r`, `d`, `s`, the four fluxes, `u`, `v`, the
   four slump fluxes, and `size`. `createFields(size)`.
2. `erosion-calibration.ts`: one exported object. Extent 8,000 m, base level, gravity, timestep,
   pipe area and length, rain rate, evaporation rate, sediment capacity `Kc`, dissolve rate `Ks`,
   deposit rate `Kd`, regolith erodibility multiplier, minimum tilt, maximum erosion depth,
   talus angle, slump rate, velocity clamp, `STORM_STEPS`. Start from the paper's values; every
   number is provisional until Phase 8. Each carries its unit in a comment.
3. `uplift.ts`: `uplift(seed, size, constants)` writes `b`. Seeded gradient noise with its own
   permutation table (no dependency), ridged multifractal over a domain warp, multiplied by a
   broad dome so there is an inland divide, and brought down to base level along all four edges
   so rivers can leave. `r`, `d`, `s` start at zero.
4. `strata.ts`: `strataTable(seed)` returns 256 entries of hardness in (0, 1] and a colour,
   as beds of varying thickness; `strataWarp(seed, size)` returns the 2D offset field.
5. `step.ts`, as six functions with the signature `(fields, constants, …) => void`, called in
   this order by `step()`:
   1. **rain**: `d += dt · rainRate · rain`, where `rain` in [0, 1] is supplied by the caller.
   2. **flux**: for each of four neighbours, `f = max(0, f + dt · A · g · Δh / l)` with `Δh` the
      difference in total height `b + r + d`; then scale the four by
      `min(1, d · cell² / (Σf · dt))` so a cell cannot give more water than it holds. An
      off-grid neighbour has total height equal to base level.
   3. **water**: `d += dt · (Σf_in − Σf_out) / cell²`; velocity from the net flux through the
      cell divided by the mean of the old and new depth, guarded where that depth is near zero,
      then clamped.
   4. **erode**: capacity `C = Kc · max(sin(tilt), minTilt) · |v| · ramp(d)`, where `ramp`
      fades capacity out in very shallow water. If `C > s`, take `Ks · (C − s)` from `r` first
      (scaled by the regolith multiplier) and the remainder from `b` scaled by the stratum's
      softness, and add it to `s`. Otherwise move `Kd · (s − C)` from `s` to `r`.
   5. **transport**: `s(x) = s(x − v · dt)`, bilinear from four cells; then
      `d *= 1 − evaporation · dt`. Sediment in a cell whose water has evaporated to nothing is
      dropped into `r`. Sediment advected from off-grid is zero; what leaves is added to the
      exported tally.
   6. **slump**: where the surface slope to a lower neighbour exceeds the talus angle, an
      outflow proportional to the excess goes to `slump`; a second sweep applies it, taking from
      `r` then `b` and adding to the neighbour's `r`.
6. `tally.ts`: sums of each layer times cell area, and the running exported total.

**DoD.** Specs, each on a grid of 64² or smaller:

- Determinism: one seed, two runs, identical arrays.
- The erode exchange is exactly conservative: `b + r + s` summed over the grid is unchanged by
  `erode` alone, to float rounding.
- Slump is exactly conservative and never raises a cell above the neighbour it fell from.
- Flux never drives a depth negative.
- Over a hundred full steps the solid total plus the exported tally drifts by less than a stated
  bound, and the bound is a named constant with the measured value beside it.
- On a tilted plane water moves downhill and leaves by the low edge.
- A cone under uniform rain keeps four-fold symmetry.
- The timestep satisfies the stability limit implied by the calibrated depth and cell size.
- Uplift is at base level on all four edges and has its maximum inland.

### Phase 2 — the GPU model

The same six passes as fragment shaders, and the gate that keeps them the same.

1. `sim-shaders.ts`: one full-screen vertex shader, one fragment source per pass, and
   `SIM_PASSES`, an ordered array of `{ name, fragment, reads, writes }`. Slump is two entries.
   Constants arrive as uniforms named after the calibration object's keys. `texelFetch` only.
2. `sim-driver.ts`: two `RGBA32F` targets per state texture, `NearestFilter`, no depth, no
   mipmaps. `stepOnce(rain)` walks `SIM_PASSES`, binds what each reads, draws one triangle into
   what it writes and swaps. Uploads `uplift` and the strata textures at creation. Exposes the
   current `land`, `flow` and `light` textures for drawing and a `dispose()`.
3. `sim-clock.ts`: accumulator from frame time to whole steps, capped per frame by the tier so a
   stalled tab does not come back and run four thousand steps at once.
4. `scripts/verify-watershed.mjs`, on the model of `scripts/verify-shader.mjs`: launch
   Playwright's Chromium, build a raw WebGL2 page from `SIM_PASSES`, run fifty steps on a 64²
   grid from `uplift(HERO_SEED)`, read back `land`, run the same fifty steps through `step.ts`
   in Node, and compare layer by layer. Print the worst absolute difference per layer. Fail above
   a tolerance that is stated in the script with the measured value beside it.
5. Add the script to `package.json` as `verify:watershed` and to the e2e job in
   `.github/workflows/code-quality.yml` beside `verify:shader`, carrying
   `if: ${{ !cancelled() }}`. `check:docs` fails a step after the suite that lacks it.
6. Draw the height as flat greyscale on the Phase 0 plane, so there is something to look at.

**DoD.** The parity script passes locally and in CI, and its printed differences are recorded in
its header. Changing one constant in one shader makes it fail. On this box the route shows
greyscale valleys cutting in; the steps per second at 512² are recorded.

### Phase 3 — the land

1. `land/`: a plane of `GRID − 1` segments each way, displaced in the vertex shader to `b + r`
   from the `land` texture, with vertical skirts on the four edges down to below the fog deck.
2. The light pass, into the `light` texture at grid resolution: from each texel march toward the
   sun through the height texture for a fixed number of steps, keeping the minimum of
   `(ray height − terrain height) / distance` as a soft shadow term; occlusion from the mean
   horizon in eight directions at a short radius. Re-run only when the land or the sun changed.
3. The material, in the fragment shader:
   - normal by central differences of the height texture, plus a small procedural detail normal
     whose frequency depends on the material, so close ground is not smooth;
   - bedrock colour from the strata table at `b + warp`, darker and bluer in shade;
   - regolith over it by `r`: scree grey on steep ground, pale silt where flat;
   - vegetation by a function of slope, altitude, regolith and nearness to water, held back
     entirely until the storm has passed (it arrives with the light, in Phase 6);
   - snow above a line, refused by steep slopes;
   - the skirts shade as a section: strata bands straight through, regolith as a cap.
4. Direct sun times shadow, sky ambient times occlusion, in linear HDR.

**DoD.** At a fixed, late simulation time and a fixed afternoon sun the land reads as rock with
visible beds, shadowed valleys and scree below cliffs. Pausing the simulation stops the light
pass (assert it in a spec on the driver's dirty flag). Frame time on this box and from CI is
recorded.

### Phase 4 — the water

1. A second grid displaced to `b + r + d`, drawn after the land, discarded where `d` is below a
   threshold and faded in just above it so shorelines are not stair-stepped.
2. Colour by depth with Beer–Lambert absorption over the land colour beneath (read the scene
   colour target, or shade the bed again; choose by measuring), turbid where `s` is high.
3. Normals from two phases of a scrolling noise advected along `flow`, cross-faded so the
   pattern never stretches; amplitude proportional to speed, so lakes are glass and rapids are
   not. Whitewater where speed and slope are both high.
4. Fresnel reflection of the sky function along the reflected ray, and the sun's specular lobe
   left bright enough for bloom to take.
5. Wet ground: darken and gloss the land where `d` was recently above zero or rain is falling.

**DoD.** Setting rain to zero dries the rivers on screen within seconds and leaves the lake.
Nothing in `water/` decides where water is; a `check:docs` rule can hold that later by requiring
that the water shader reads `land` and declares no noise-based mask.

### Phase 5 — the air

1. `air/sky`: one GLSL function, `skyRadiance(direction, sun, weather)`: overcast grey-blue at
   `weather = 0`, a clear gradient with horizon warmth and a sun disc at 1. Used by the dome,
   by Phase 4's reflection and by the fog below. Export it as a string and interpolate it into
   each shader.
2. Aerial perspective in the land and water shaders: exponential height fog integrated
   analytically along the view ray, inscattering `skyRadiance` toward the sun.
3. Mist: the light pass's third channel is humidity, a wide blur of water depth. Fog density
   rises with it below a ceiling above the local surface, so mist lies in the valleys the water
   cut and follows the rivers.
4. The fog deck: a noise-surfaced layer below the block's rim, lit by the same sun, which is
   what the skirts descend into.
5. Cloud shadows: scrolling noise projected along the sun's direction, multiplying direct light
   only, fading out as `weather` falls (under overcast there is no direct light to shadow).
6. Rain: a post pass of slanted streaks whose density is the current rain value, and nothing
   else. No lightning; it would be the only effect here that shows no state.
7. Bloom, grade and grain tuned with everything above running.

**DoD.** Two committed frames in `docs/images/`, storm and golden hour, from the same land. The
second, set beside Phase 3's, is the argument for the phase. The three users of the sky agree:
a spec asserts the function's source appears in all three shaders.

### Phase 6 — the storm

One clock for everything, in `direction/direction.ts`, as pure functions of storm progress `p`
in [0, 1] and of seconds since the storm ended, `e`.

1. `rainAt(p)`: rises quickly, holds, and is zero from about 0.85 so the last steps drain the
   land and the rivers settle to their base flow instead of stopping mid-flood.
2. `weatherAt(p, e)`, `sunAt(p, e)`: overcast through the storm; the cloud breaks over the first
   seconds of `e` and the sun is low and warm.
3. `greeningAt(e)`: the vegetation term from Phase 3 comes in after the light does.
4. `cameraAt(p, e)` in `camera-path.ts`: a high three-quarter view on a very slow arc during the
   storm, where the making is legible; then a descent to a low pass up the main valley. The
   main valley is found, not assumed: read back a quarter-resolution copy of `land` once when
   the storm ends and take the path of greatest accumulated water. After the pass the camera
   settles into a slow orbit and the visitor may drag or use the arrow keys, within bounds.
5. Controls, as real DOM over the canvas: **New land** (a new seed, the URL updated, the storm
   restarted) and **Pause**. Both keyboard-operable, both obeying the interface rules: no
   `text-shadow`, no hover motion, the accent only where something can be clicked.
6. The readout and the state line. Totals come from a reduction of `land` to one texel, read
   back once a second with the asynchronous read so it never stalls a frame. Step count, rain as
   a depth, rock moved and rock exported as volumes. It is not a live region; a throttled
   `role="status"` summary carries it, for the reason ARCHITECTURE gives for the dashboard.

**DoD.** A full run needs no input, takes about ninety seconds on the middle tier on this box,
and ends on the hero shot. `?seed=` reproduces a land on the same machine. Specs hold the
curves' end points and monotonic sections, and that `rainAt` is exactly 0 at `p = 1`.

### Phase 7 — the stored land

1. `scripts/watershed-land.mjs`: pure pack and unpack. A 1024×512 RGB image: left half carries
   bedrock as sixteen bits across R and G and water depth in B; right half carries regolith in R
   and two spare channels. Ranges are named constants. Tests under `scripts/*.test.mjs`.
2. `scripts/build-watershed-land.mjs`: run `uplift` and `STORM_STEPS` of `step.ts` at 512² for
   `HERO_SEED`, write `public/watershed-land.png` and print its size. It will take minutes; say
   so when it starts. Refuse to write a file over 1 MB.
3. `--check`: recompute a digest of the calibration object, `HERO_SEED` and `STORM_STEPS` and
   compare it with the digest recorded beside the image, then assert the image's dimensions and
   that its water channel is not empty. It does not re-run the simulation in CI. Add both
   spellings to `package.json` and the check to the e2e job.
4. `stored/stored-land.ts`: fetch, `createImageBitmap` with colour-space conversion and
   premultiplication off, unpack to a `Float32Array`, upload as the same `land` texture the
   driver would have produced. Sampling a float texture needs no extension; only rendering to
   one does.
5. The `still` state: stored land, `p = 1`, `e` at the hero moment, one frame.
6. The `stored` state: stored land, the camera pass and the orbit, no storm, no **New land**.
7. The state line's three sentences.

**DoD.** With reduced motion the route shows the hero frame and requests the PNG. With
`sim-support` forced false it shows the pass over the stored land and says so. Changing any
erosion constant makes `--check` fail until the land is rebuilt.

### Phase 8 — the look

Tuning, with the whole instrument running. This is a phase and not an afterthought because it
is where the piece becomes beautiful or does not, and because colour decisions made before the
air existed were made blind.

1. Erosion constants, for character: enough bedrock hardness contrast that benches form, enough
   slump that cliffs shed scree, a storm long enough to cut and short enough to watch. Re-run
   Phase 1's specs and the parity script after every change; rebuild the stored land at the end.
2. The hero frame: sun azimuth and elevation, fog density, mist ceiling, bloom threshold, grade.
   Compose it for a 16:10 crop, because that is the shape of the project card.
3. Try six seeds. A hero that only works for one seed is a painting.
4. Tiers: confirm the lowest tier holds its frame rate on a phone and still reads as the same
   place.

**DoD.** Hero frames for six seeds, kept out of the repo, all acceptable. Frame times for each
tier recorded in the tier calibration file.

### Phase 9 — the wiring

Everything a route needs to exist on this site. Each line is a place that fails a gate, or
degrades silently, if skipped.

1. `vercel.json`: the rewrite to `/watershed/index.html`, beside murmuration's. Build with
   `npm run build`, never bare `ng build`, or the route's social card is not emitted.
2. `src/app/projects/projects.data.ts`: the card, with a `frame` whose alt describes the still.
   Alt text is checked against the frame's recorded words, so quote only text the route
   actually renders (the state line qualifies).
3. `e2e/project-frames.spec.ts`: a recipe anchored on the canvas and the state line, waiting on
   the state line's `still` sentence, which appears only after the stored land has drawn. Then
   `npm run frames:capture`, and commit the `.webp` and the record.
4. `e2e/home-link.spec.ts`: the route in `ROUTES`, and a twin of the test that the canvas keeps
   the whole viewport.
5. `e2e/watershed.spec.ts`: no console error on load; the canvas is not one flat colour; the
   state line says `still` under reduced motion; **New land** changes the URL's seed.
6. `e2e/a11y.spec.ts`: the canvas is not scanned, as murmuration's is not, but the controls and
   the readout are real DOM and must pass axe. The canvas carries a text alternative that says
   what state it is showing.
7. `README.md`: the route in the list of pieces, its frame in the table, and the sentence about
   the largest chunk if this route changed which one that is.
8. `CLAUDE.md`: add `/watershed` to the sentence listing routes with generated frames; rewrite
   this file's doc-map row to say what has landed; add the stored land to §Traps as a generated
   file never to be edited; add the spectacle paragraph's second beneficiary.
9. `scripts/check-docs.mjs`, in the same change as the claims: the stored land's `--check` is in
   the e2e job with its condition; `rainAt` is exactly 0 at the end of the storm; the water
   shader reads `land`; no `AudioContext` under `src/app/watershed/`; the route's CSS needs no
   exemption from the hover rule.
10. All six gates, `npm run e2e` and `npm run check:docs`, green.

**DoD.** The card is on the home page with a committed frame, a link shared to Slack shows this
route's card, and every gate is green in CI, not only here.

## Rules for every phase

- **One phase, one sitting, one visible or measurable result.** If a phase ends with nothing to
  show, it was cut in the wrong place; split it and say so here.
- **Numbers live in a `*-calibration.ts` file**, never inline in a shader string. A constant GLSL
  needs is a uniform, or is interpolated into the source from the TypeScript that owns it.
- **Record frame time at the end of every phase**, from this box and from the CI log. A jump is
  a regression in a shader, not a slow afternoon.
- **Watch the `any` budget on the first build of every phase.** Do not raise it without a number.
- **Do not tune before Phase 8.** Phases 3 to 6 build the instrument; make each one correct and
  legible and move on.
- **Do not loosen the parity tolerance or the conservation bound to get a phase through.** If
  one moves, find out which pass moved it.
- **When a phase lands**: delete it here, renumber, move what was learned into the header of the
  file it concerns, and update this file's size in `CLAUDE.md`.
