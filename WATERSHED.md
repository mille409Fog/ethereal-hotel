# WATERSHED — a landscape that erodes while you watch

The second spectacle on this site, after `/murmuration`, and meant to be much larger. This is the
whole plan: what the piece is, the decisions already taken and why, what has landed, and the
phases still to do, each with a Definition of Done so that one instance can build a phase and
another can verify it. The simulation runs, and the land it makes is drawn with its water on it, under a sky, in haze and mist, standing in a deck of cloud, with the rain falling; the direction is not built, so the weather follows the rain and the sun stands still.

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
- **Bedrock is stored as the depth cut from it, not as a height.** Even 32-bit float resolves
  only a quarter of a millimetre at 2,400 m, and a step of erosion on a hillside is smaller. A
  height would not move while the sediment taken from it was still added to the water, and the
  model would make rock out of nothing on every slope. So the raised land is a static texture
  and the state is `cut`, which starts at zero and is small exactly where erosion is slow.
- **Sediment travels in the pipes.** The paper traces each cell back along the velocity and
  interpolates, which creates and loses sediment. Here a pipe carrying a tenth of a cell's water
  carries a tenth of what that water holds. Every pass therefore conserves rock exactly, what
  crosses the edge is a real number, and no pass interpolates.
- **Nearest sampling everywhere in the simulation.** `OES_texture_float_linear` is absent on a
  real share of phones, so the simulation uses `texelFetch` throughout. With sediment in the
  pipes nothing needs more. The drawing shaders interpolate state by hand where they need to.
- **Evaporation is a depth per second, not a share of the depth.** A share drains a lake as fast
  as a film, and the lake is what should still be there when the rain has gone.
- **Edges drain.** A closed boundary turns the block into a bathtub. Cells outside the grid are
  treated as empty ground at base level: water and sediment that cross the edge are removed, and
  the sediment is tallied as exported. The uplift is shaped so the divide is inland.
- **Bedrock and regolith are separate layers.** The surface is `uplift − cut + regolith`.
  Deposition adds to the regolith, erosion takes regolith first at a high rate and then bedrock
  at the rate its bed allows, and rockfall turns bedrock into regolith next door. This is what
  lets the drawing show sediment where sediment actually is.
- **Strata are a lookup by absolute elevation.** A 256×1 table of erodibility and colour, built
  from the seed on the CPU, read at the bedrock's height plus `warp(x, z)`, a 2D texture that
  tilts and folds the beds. Erosion therefore cuts _through_ layers, and benches and cliffs
  appear without being placed. The same number sets how steep a face the bed holds before it
  breaks, so a hard bed is both slow to cut and able to stand as a cliff.
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
  `model/` except `reference.ts`, and `sim-shaders.ts`, may use `import type` and nothing else,
  and takes its collaborators as arguments, the way `land.ts` takes its parts. Erasable syntax
  only: no `enum`, no parameter properties. The app's own suite cannot see this broken, because
  Vitest bundles; `scripts/watershed-model.test.mjs` imports the model with Node and can.
- **GLSL is in template literals.** No backtick in a shader comment. GLSL ES 3.00 reserves
  `sample`, `input`, `output`, `half` and more; a sediment variable called `sample` fails with a
  line number and no reason.
- **The pipe model explodes above its timestep limit**, and it does so beautifully enough to be
  mistaken for a feature for a few seconds. The limit is `cell / (2 · sqrt(gravity · pipeDepth))`
  and does not depend on the water's depth; `stableTimestep` derives it and a spec runs a
  checkerboard either side of it. **On the 1,024 grid the limit is 1.25 s and the timestep is
  1 s**, which is the thinnest margin in the piece: raising the timestep or the pipe depth, or
  adding a finer tier, breaks it. If the water turns to spikes, look here first.
- **Rock drift is rounding, about one part in a hundred million of the rock moved.** Every pass
  conserves, so the specs bound the drift a hundred times above what was measured and no looser.
  A drift orders of magnitude larger means a pass has stopped conserving; do not widen the bound.
- **A PNG with an alpha channel is premultiplied on decode** and the low byte of a height is
  destroyed. The stored land is RGB only, decoded with colour-space conversion off.
- **Two machines do not make the same land from one seed.** GPU float arithmetic differs in the
  last bit and erosion is chaotic. A seed reproduces a land exactly on one machine and in
  character everywhere else. Do not write an e2e test that compares a live land to stored bytes.
- **The shared three.js chunk is 598 kB against a 620 kB warning.** This piece needs nothing from
  `three/examples/jsm` that murmuration does not already import. Keep it that way; no
  `GPUComputationRenderer`, the driver is forty lines over `WebGLRenderTarget`.

## Layout

```text
src/app/watershed/
  watershed.ts  .html  .css  .spec.ts     the component: assembles, owns nothing clever   (built)
  watershed.tokens.ts                     renderer, composer, random, search              (built)
  land-state.ts                           the three states and their sentences            (built)
  seed/            seed.ts                mulberry32, parseSeed, drawSeed, HERO_SEED      (built)
  quality/         calibration, meter     the tiers, and the choice from frame time       (built)
  stage/           calibration, camera    the block's size and vantage; the slab shown until there is a land (built)
  composer/        calibration, passes    render, bloom, output, grade, grain             (built)
  canvas/          follow-canvas-size.ts  renderer, composer and lens follow the canvas   (built)
  model/           (leaf modules; the reference, importable by Node)                      (built)
    erosion-calibration.ts                every constant with its unit; stableTimestep
    fields.ts                             the state arrays, the ledger, the static terrain
    noise.ts       uplift.ts              seeded gradient noise; the raised bedrock
    strata.ts                             erodibility and colour table; the beds' warp
    step.ts                               rain, pipes, carry, flow, erode, evaporate, slump
    tally.ts                              volumes on the block, to audit against the ledger
    land.ts                               raises a land from a seed, given its parts
    reference.ts                          hands land.ts its parts for the app; not a leaf
  sim/                                                                                    (built)
    sim-shaders.ts                        the same step as GLSL, and SIM_PASSES (leaf)
    sim-layout.ts                         fields packed into texels and back (leaf)
    sim-driver.ts                         ping-pong targets over SIM_PASSES
    sim-clock.ts   sim-calibration.ts     frames into whole steps; the storm's pace
    storm.ts                              a land, its driver, its clock, and the land on the stage
    sim-support.ts                        the float-target probe; decides `stored`
  land/                                                                                   (built)
    land-calibration.ts                   the sun, the light pass's reach, the ground's colours (leaf)
    land-geometry.ts                      one vertex a cell and four walls, as plain arrays (leaf)
    land-shaders.ts                       the light pass, the ground's two chunks, the mesh's shaders (leaf)
    light-pass.ts                         runs the light pass, and only when the land or sun moved
    land-mesh.ts                          the geometry and the material as a mesh in the scene
  water/                                                                                  (built)
    water-calibration.ts                  how deep water is before it is drawn, and its look (leaf)
    water-shaders.ts                      the water's two shaders, built on the ground's chunks (leaf)
    water-mesh.ts                         the ground's vertices and that material as a mesh
  air/                                                                                    (built)
    air-calibration.ts                    the sky, the sun through the air, haze, mist, deck, clouds, rain (leaf)
    air-shaders.ts                        the one sky, the fog, the dome, the deck, the rain's streaks (leaf)
    air.ts         rain-pass.ts           the dome, the deck and the air's shared uniforms; the rain's post pass
  direction/       direction.ts (the curves), camera-path.ts, calibration
  stored/          stored-land.ts         decode the committed land into the same textures
scripts/
  watershed-model.test.mjs                Node imports the model: the leaf rule's gate    (built)
  watershed-land.mjs  (+ .test.mjs)       pack and unpack, pure
  build-watershed-land.mjs                run the reference for HERO_SEED, write the PNG
  verify-watershed.mjs                    GPU against reference, in Chromium              (built)
public/watershed-land.png
e2e/watershed.spec.ts
```

Textures, all `RGBA32F` at `GRID` × `GRID` (512; 1024 on the top tier) except `strata`, which is
256×1, and `light`, which is eight-bit `RGBA8` because both its terms lie in [0, 1]. One channel is
one array in `fields.ts`. `terrain` and `strata` are uploaded once and never written.

| Texture   | R          | G             | B                   | A           |
| --------- | ---------- | ------------- | ------------------- | ----------- |
| `terrain` | uplift     | strata warp   | unused              | unused      |
| `strata`  | red        | green         | blue                | erodibility |
| `land`    | cut        | regolith      | water depth         | suspended   |
| `flux`    | out left   | out right     | out up              | out down    |
| `flow`    | velocity x | velocity y    | unused              | unused      |
| `slump`   | out left   | out right     | out up              | out down    |
| `light`   | sun shadow | ambient occl. | humidity (for mist) | unused      |

## What has landed

**The stage** (2026-11-11). `/watershed` loads, unlinked from the home page: a lit slab the size
of the land, drawn through the full HDR chain, with the state line in the corner. The reasoning
is in the headers of the files under `src/app/watershed/`; what a later phase needs from it is
here.

- **Baselines.** The shared three.js chunk is 597.70 kB raw and the route's own is 6.95 kB.
  Before this route existed three.js sat inside murmuration's chunk at 610.03 kB, so adding the
  route split the shared code out and made the largest chunk smaller. The `any` budget warns at
  620 kB.
- **The probe passes on SwiftShader**: headless Chromium on this box renders to `RGBA32F` and
  reads the value back exactly, so CI can run the live simulation. **Two readings are still
  owed**, the Linux CI image and one real phone; `sim-support.ts` says how to take them and is
  where they are recorded.
- **There is no dither pass.** Murmuration's grain already adds triangular noise to display
  values as the last pass, which is a dither. `composer/orchestrate-passes.ts` records it.
- **Tiers are tried from the top and only step down.** A display paints no faster than its
  refresh, so frame time can show a tier is too dear and never that a dearer one would fit. Two
  consequences for the GPU model: the grid size is a tier property, so **the storm must not
  start until the meter has settled**, and SwiftShader always settles on the lowest tier.
- **The picture has no antialiasing yet**, and now on a measurement: see **The land** below.
- **Two kinds of console noise are not failures**, and the route's e2e spec must filter them
  rather than assert an empty console: the local server answers 404 for
  `/_vercel/insights/script.js`, and SwiftShader prints a "GPU stall due to ReadPixels"
  performance warning for every read-back, the probe's included.
- **Two of the state line's three sentences are provisional.** No land is stored yet, so `still`
  and `stored` say what the device was found able to do, not what it is shown. So is
  `HERO_SEED`, and so is the route's description in `src/route-meta.json`, which says "in
  progress".

**The reference model** (2026-11-11). `src/app/watershed/model/` is the simulation in plain
TypeScript on plain arrays: no WebGL, no three.js, no Angular. `step.ts` is the specification
the shaders will be held to and what will build the stored land; its header says what is the
paper's and what is not. Nothing draws it yet, so the route looks as it did.

- **It makes a land.** 3,000 steps on a 256 grid from the hero seed cut a connected drainage
  with lakes in the basins and sediment aprons at the rim, moving 575 million cubic metres of
  rock and carrying 363 million off the block. That run took 41 s in Node, so the full storm at
  512 will take about eleven minutes; the stored-land script should say so before it starts.
- **The books balance.** Rock on the block plus rock exported drifted by 8.8e-9 of the rock
  moved over a hundred steps, and water by 8.4e-10 of the rain. The specs bound both at 1e-6.
- **The stability limit was derived wrong, caught by its own spec, then measured.** See §Traps.
- **Every pass is a gather**, written so each function in `step.ts` is one shader: a cell works
  out what its neighbours send it by repeating their arithmetic, and reads a snapshot where a
  pass changes what its neighbours read. Slumping is two functions because it is two passes.
- **Heights are rounded to 32-bit at each sum**, in a fixed order, because that is where float
  and double disagree by enough to matter. The shaders must add in the same order:
  `(uplift − cut) + regolith`, then `+ water`.
- **Sums are taken in pairs**, `left + right + (up + down)`, so a land mirrored or turned gives
  the same bits. The cone spec depends on it; the shaders should keep it.
- **The water hits the speed limit.** `maxSpeed` is 12 m/s and the fastest cell sat on it for
  the whole run. Erosion is proportional to speed, so the clamp is shaping the land, and the
  pipes have no friction to stop it. That is a tuning question for the look phase, with adding
  friction to the pipes as the alternative to moving the clamp.
- **All the constants are provisional**, and so are the rock colours in `strata.ts`.

**The GPU model** (2026-11-11). The simulation runs on the GPU and `/watershed` shows it: on a
device that can render to float, a storm starts once the quality meter settles and the land
appears on the slab as a grey relief map with its water in blue, cutting as you watch. The state
line counts the storm's steps.

- **The shaders are the model.** `npm run verify:watershed` runs both from the hero seed's land
  for fifty steps on a 64 grid: the worst differences were 5.3e-5 m in the cut, 6.3e-5 m in the
  regolith, 1.7e-5 m in the water and 6.9e-4 m in the suspended sediment, in layers reaching
  210 m, 136 m, 0.7 m and 31 m. The tolerances are about ten times those. With `capacity` raised
  1% in the shaders alone every layer fails by a factor of eighty or more, and the script
  requires that failure on every run.
- **It is in CI's e2e job but has not run there.** It passed here, on SwiftShader under Windows.
  The first push is the first reading on Linux; if a layer is over by a little, the tolerance
  moves, from that reading and with the number written beside it.
- **Pace.** On SwiftShader at 512 the storm ran 31 steps a second, so a storm there takes about
  six and a half minutes where the calibration asks for ninety seconds. That is the lowest tier
  on a software rasteriser and is the floor, not the experience. The reading on a real GPU was
  taken with the land drawn and is under **The land** below.
- **Baselines.** The shared three.js chunk is 597.76 kB and the route's own is 24.98 kB.
- **Nine passes, none merged.** `flow` is two because a pass has one output. Rain could fold
  into any pass that writes the land, and evaporation into erosion. Do it on a measurement that
  says the pass count is what a real GPU is short of; the verifier makes it safe.
- **The meter measures the empty stage, not the storm.** A device can settle on the top tier
  with nothing to draw and then struggle with a 1,024 grid. The clock stops that from spiralling,
  because it forgives the steps a frame could not run, but nothing steps the tier down once the
  storm has begun. Either measure with a few steps of the simulation running, or let the storm
  restart once on a smaller grid; decide it in the phase that directs the storm.
- **The land is raised on the main thread** in the frame the storm starts: noise at every cell,
  a visible hitch at 1,024. The same phase hides it behind the opening or moves it to a worker.
- **Sediment has no ceiling but the flow's capacity.** On the verifier's land, which is far
  steeper than any real one, a cell held 31 m of suspended sediment in 0.7 m of water. Capacity
  is a thickness and does not know the depth beyond the shallow ramp. Tune it with the look.
- **One stand-in**: `RAIN_SHARE` in `sim-calibration.ts`, which the storm phase replaces with a
  curve.

**The land** (2026-11-12). The storm's land stands on the stage as itself: a mesh with one vertex
on every cell, lifted each frame to wherever the simulation has the ground, coloured by the bed
its bedrock has been cut down to and by the regolith lying on it, lit by a fixed afternoon sun
whose shadows are marched across the land, with the block's four sides cut clean and the beds
running through them. The reasoning is in the headers of the files under `land/`.

- **What it looks like.** A third of the way through the hero seed's storm the beds read as
  bands round every flank, the valleys are in shadow and the basins are pale with silt. By the
  end the slopes are close-set gullies under scree and the beds show mostly on the walls and
  where rock is bare. That is the erosion constants and `regolithFull`, and it is the look
  phase's to settle. The water was not drawn when this landed; it is now, and is the next entry.
- **The gate.** `npm run verify:watershed` now compiles the light pass and the mesh too and
  holds two claims: every cell whose ground rises toward the sun faster than the sun does is in
  full shadow (1,471 such cells on the gate's land, none lit), and a flat land is fully lit.
  With the march walked the wrong way, 883 of 1,135 were lit and the gate failed. Its `--out`
  option draws a whole block to look at.
- **The light stops when the land does.** A frame that runs no step draws no light pass, which
  is all a pause is; `storm.spec.ts` and `light-pass.spec.ts` hold it on the pass's dirty flag.
- **Frame time, on a real GPU.** Headless Chromium on this box's RTX 3070 Ti through D3D11 held
  17 ms a frame, which is the display's 60, from the first step to the last and after, and ran
  the whole storm of 12,000 steps in 90 s. That is also the reading the GPU model owed: the
  calibrated pace is met with the land drawn. The meter settled on the top tier there, so that
  is a 1,024 grid.
- **Frame time, on SwiftShader**, which settles on the lowest tier. The empty stage is 117 ms a
  frame at full resolution and 50 ms at the lowest tier's. The storm was about 97 ms a frame
  with the grey map and is about 310 ms with the land, of which the light pass is 134 ms and
  the mesh 243 ms when each is timed alone at 512. So a storm there now takes about twenty
  minutes. It is the floor and nothing was bent for it. **The reading from CI is owed**: the
  first push prints the gate's line, and the route itself is not in the e2e suite yet.
- **The quality meter cannot settle on a device slower than four frames a second.** A gap over
  250 ms is taken for a hidden tab and the window starts again, so where every frame is that
  long no tier is ever chosen and the storm never starts. This box's SwiftShader is under the
  line at 117 ms. CI is three to five times slower and may not be, which the wiring phase's
  e2e spec will meet first. The storm phase owns the meter; count a run of long frames as
  slowness, not absence.
- **Antialiasing was tried and is off.** Four samples on the composer's target cost nothing
  visible on the real GPU and cleaned every ridgeline, depth texture attached. On SwiftShader
  they took the empty stage from 117 ms to 420 ms, over the line above, and the storm never
  started. `COMPOSER_SAMPLES` is the number and `watershed.tokens.ts` has the measurement;
  samples want to be a tier property once the meter can step down from a slow frame.
- **The light is eight bits and the march snaps to the grid.** Both are in the shader's header.
  The first means a device that cannot render to float can still be lit, which the stored land
  needs. The second replaced reading the nearest cell, which shades a smooth slope in stripes.
- **Baselines.** The shared three.js chunk is 597.81 kB and the route's own is 35.91 kB. The
  build's total-scripts warning (1.75 MB) is over by 27.66 kB; this phase added about 11 of it.
- **Two stand-ins**, both gone with the air: the three flat lights in `land-calibration.ts`, and
  the plants' nearness to water, which was the depth of water on the cell itself.

**The water** (2026-11-13). The simulation's water is drawn where the simulation has it: a second
mesh on the land's own vertices, lifted to the water's level, coloured by its depth over the bed
and by the sediment it carries, rippled where it moves, white where it is fast and falling, and
reflecting the sky and the sun. The ground is dark and glints where a film lies on it or rain is
falling. The reasoning is in the headers of the files under `water/` and of `land-shaders.ts`.

- **The Definition of Done, in numbers.** The rain stops and the rivers go. On the reference
  model's 128 grid, at the end of the storm's rain 1,280 cells hold water deep enough to draw;
  50 steps later, which is under half a second of the storm, 872 do; 150 steps later 474; at the
  storm's end 312, of which 166 are over a metre deep and the deepest is 35 m. Drawn, on a 256
  grid after 1,500 steps, the water is on 14,718 pixels in the rain and 5,029 once it has
  drained. `npm run verify:watershed -- --out a.png` and the same with `--raining` are the pair.
- **The lakes that are left are small**, about one cell in a hundred. The wide basins fill with
  silt and drain, so what a visitor sees at the end is pale flats with a few dark teal ponds in
  them. That is the erosion constants and the look phase's to settle, with the water's colours.
- **The gate.** `verify:watershed` compiles the water's shaders and holds the rule that nothing
  in `water/` decides where water is: it draws water on the reference land, and with every cell
  capped at `waterFrom` it draws not one pixel. That count found a bug on its first day: on a
  multisampled target the depth was carried on past the edge of a triangle, and a steep dry bank
  drew water that was not there, four pixels in ten of all the water counted. The depth is
  `centroid` now. The route's own target has no samples, so it never showed there, and would
  have the day the samples became a tier property.
- **The bed is shaded again, not read back**, by measurement and then by judgement: the two cost
  the same on a real card and within 8 ms on the software rasteriser, and a copy of the frame
  cannot be taken from a multisampled target. `water-shaders.ts` has the readings.
- **Wet ground has no state of its own.** It is wet under a film of water, and the film a cell
  keeps after its water has run off is the model's own record of where water lately was. A
  wetness channel with a drying rate chosen here would be a second, invented one.
- **Frame time, on a real GPU.** 16.6 ms from the first step to after the last on the 1,024 grid,
  and the storm on pace. It was not at first: the water's mesh rasterised the whole dry land a
  second time to throw it away, and the frame was 22 to 27 ms through the second half of the
  storm. Vertices with no water near them are now put outside the view.
- **Frame time, on SwiftShader**, timed alone at 512 in the rain: the light pass 70 ms, the land
  126 ms and the water 107 ms, so a storm's frame there is about a third dearer than it was.
  This box read the land at 243 ms a day earlier, so compare within a day and not across two.
  **The reading from CI is still owed**, as it was for the land.
- **Baselines.** The shared three.js chunk is 597.81 kB, unchanged, and the route's own is
  44.94 kB. The build's total-scripts warning (1.75 MB) is over by 36.69 kB; this phase added 9.
- **Three stand-ins**: the sky the water reflects was the land's two flat lights, which went with
  the air; a lake reflects no mountain; and the ripples run on the frame's clock, so they move
  when the storm is over and will move when it is paused. The phase that directs the storm owns
  the last.

**The air** (2026-11-14). The land stands under a sky and in its weather: overcast and raining
through the storm, clear when the rain stops. One GLSL function draws the dome, is what the
water reflects, is the colour the fog scatters, and lights the ground; haze thickens toward the
ground and in the storm; mist lies where the light pass finds the ground humid; the block's walls
go down into a deck of cloud; clouds overhead cast shadows; rain falls across the screen. The
reasoning is in the headers of the files under `air/`.

- **The Definition of Done.** `docs/images/watershed-storm.webp` and
  `docs/images/watershed-golden.webp` are the two frames, the same seed and the same 1,500 steps
  on a 256 grid, the storm's still raining and the golden hour's drained.
  `docs/images/watershed-bare.webp` is the golden hour's land and sun with no air at all, and
  beside the golden frame it is the argument. They are drawn by `verify:watershed`; its header
  has the three commands. `air.spec.ts` asserts the sky's source is in the dome's, the deck's,
  the land's and the water's shaders exactly once each.
- **The frames are the verifier's, not the route's**, and so have no bloom, grade or grain, a
  sun put low by hand (`GOLDEN_ELEVATION`) and a camera put low by hand (`--view low`). The route
  can show neither until the storm is directed. The route itself was run on this box's card
  through a whole storm: overcast and raining to the end of the rain, then clear.
- **The gate.** The light pass's humidity is held to the water's rule: none on a land with no
  water, and on the gate's land with only its 27 pools left, humid on 290 cells and on none out
  of reach of a pool. With 0.05 added to the shader's humidity it failed on all three counts.
  The dome, the deck and the rain are compiled on every run.
- **Two looks went wrong first, both in humidity, and both were the mist.** Each cell's wetness
  taken straight made a drained hillside's film count; the square root of the mean turned the
  first look to land on a pool from nothing into a fifth. Either one laid the mist across the
  high ground in hard-edged patches. Wetness is eased now and humidity is the plain mean;
  `--set key=value` on the verifier's picture is how they were found, one term at a time.
- **The clouds stand 4,500 m up, above the land by more than its relief**, and a spec holds it.
  At 2,600 m, just over the peaks, a low sun cast every few metres of height to somewhere else.
- **Frame time, on a real GPU.** 16.7 ms from the first step to after the last on the 1,024
  grid, the storm on pace, and the only console error the known 404.
- **Frame time, on SwiftShader**, which this phase made the dearest yet. Back to back with the
  commit before it, timed alone at 512 in the rain: the land from 146 ms to 292, the water from
  128 to 275, and the deck 151, the dome 31 and the rain 33 on top. The route's storm frame there
  went from about 690 ms to 840; it still settles and runs. Branching on the weather and on each
  fog layer is exact and changed nothing there, because a software rasteriser runs both sides;
  `air-shaders.ts` has the readings. **The reading from CI is still owed.**
- **Baselines.** The shared three.js chunk is 597.83 kB and the route's own is 59.45 kB. The
  build's total-scripts warning (1.75 MB) is over by 51.22 kB; this phase added 14.5.
- **The grade, the bloom and the grain were looked at with all of this running and left as they
  were.** The bloom catches the sun's disc and its glints and nothing else, and what the grade
  should do is a choice about the hero frame, whose sun, camera and weather do not exist until
  the storm is directed. That item moved to the look phase rather than being decided blind.
- **Four stand-ins**: the weather is `1 − rain` (`weatherAt` in `sim/storm.ts`), so the cloud
  breaks the instant the rain stops; the golden sun and the low view live in the verifier; the
  deck is shaded as a surface, so a low sun barely lights its top, where real cloud scatters it;
  and the mist is taken to lie along the whole ray as it does at the point drawn, which holds
  from the storm's vantage and is generous from a low one.

## The phases

### Phase 0 — the storm

One clock for everything, in `direction/direction.ts`, as pure functions of storm progress `p`
in [0, 1] and of seconds since the storm ended, `e`.

1. `rainAt(p)`, replacing the on-off stand-in of that name in `sim/storm.ts`: rises quickly, holds, and is zero from about 0.85 so the last steps drain the
   land and the rivers settle to their base flow instead of stopping mid-flood.
2. `weatherAt(p, e)`, replacing the stand-in of that name in `sim/storm.ts`, which is `1 − rain`
   and breaks the cloud the instant the rain stops; and `sunAt(p, e)`: overcast through the
   storm; the cloud breaks over the first seconds of `e` and the sun is low and warm. The sun is
   moved with the light pass's `sunTo`, which is what makes the light be worked out again; the
   pass marches along the air's own vector, which the dome, the deck and both meshes read, so
   the sky and the shadows move together. The verifier's `GOLDEN_ELEVATION` and `--view low` are
   where the golden frame put the sun and the camera by hand; retire both for these curves.
3. `greeningAt(e)`: the plants are already in the land's shader, multiplied by its `greening`
   uniform, which is 0. This raises it after the light has come.
4. `cameraAt(p, e)` in `camera-path.ts`: a high three-quarter view on a very slow arc during the
   storm, where the making is legible; then a descent to a low pass up the main valley. The
   main valley is found, not assumed: read back a quarter-resolution copy of `land` once when
   the storm ends and take the path of greatest accumulated water. After the pass the camera
   settles into a slow orbit and the visitor may drag or use the arrow keys, within bounds.
5. Controls, as real DOM over the canvas: **New land** (a new seed, the URL updated, the storm
   restarted) and **Pause**. A paused storm runs no step, so it already draws no light pass;
   `storm.spec.ts` holds that. Both keyboard-operable, both obeying the interface rules: no
   `text-shadow`, no hover motion, the accent only where something can be clicked.
6. The readout and the state line. Totals come from a reduction of `land` to one texel, read
   back once a second with the asynchronous read so it never stalls a frame. Step count, rain as
   a depth, rock moved and rock exported as volumes. It is not a live region; a throttled
   `role="status"` summary carries it, for the reason ARCHITECTURE gives for the dashboard.

**DoD.** A full run needs no input, takes about ninety seconds on the middle tier on this box,
and ends on the hero shot. `?seed=` reproduces a land on the same machine. Specs hold the
curves' end points and monotonic sections, and that `rainAt` is exactly 0 at `p = 1`.

### Phase 1 — the stored land

1. `scripts/watershed-land.mjs`: pure pack and unpack. A 1024×512 RGB image: left half carries
   the cut as sixteen bits across R and G and water depth in B; right half carries regolith in R
   and two spare channels. Ranges are named constants. Tests under `scripts/*.test.mjs`.
2. `scripts/build-watershed-land.mjs`: `raiseLand` for `HERO_SEED` at 512², then `stormSteps` of
   `step`, with the parts wired as `scripts/watershed-model.test.mjs` wires them. Write
   `public/watershed-land.png` and print its size. It will take about eleven minutes; say so when
   it starts. Refuse to write a file over 1 MB. Only the fields are stored: the uplift and the
   strata are raised again from the seed in the browser, which is why they are not in the image.
3. `--check`: recompute a digest of the calibration object, `HERO_SEED` and `STORM_STEPS` and
   compare it with the digest recorded beside the image, then assert the image's dimensions and
   that its water channel is not empty. It does not re-run the simulation in CI. Add both
   spellings to `package.json` and the check to the e2e job.
4. `stored/stored-land.ts`: fetch, `createImageBitmap` with colour-space conversion and
   premultiplication off, unpack to a `Float32Array`, upload as the same `land` texture the
   driver would have produced. Sampling a float texture needs no extension; only rendering to
   one does. The light pass and the mesh ask an `ISimDriver` for three textures and a size and
   for nothing else, and the light's own target is eight-bit, so a stored land that offers the
   same four is lit and drawn by the code that draws a live one. The stage's slab and its two
   lights go when this does.
5. The `still` state: stored land, `p = 1`, `e` at the hero moment, one frame.
6. The `stored` state: stored land, the camera pass and the orbit, no storm, no **New land**.
7. The state line's three sentences.

**DoD.** With reduced motion the route shows the hero frame and requests the PNG. With
`sim-support` forced false it shows the pass over the stored land and says so. Changing any
erosion constant makes `--check` fail until the land is rebuilt.

### Phase 2 — the look

Tuning, with the whole instrument running. This is a phase and not an afterthought because it
is where the piece becomes beautiful or does not, and because colour decisions made before the
air existed were made blind.

1. Erosion constants, for character: enough contrast between hard and soft beds that benches form, enough
   slump that cliffs shed scree, a storm long enough to cut and short enough to watch. Re-run
   the model's specs and the parity script after every change; rebuild the stored land at the end.
2. The hero frame: sun azimuth and elevation, fog density, mist ceiling, bloom threshold, grade.
   Compose it for a 16:10 crop, because that is the shape of the project card. Bloom, grade and
   grain were left untouched when the air landed, for want of a hero frame to set them against;
   they are this item's. So are the air's numbers (`air-calibration.ts`), and two things in its
   shading that are crude on purpose: the deck is shaded as a surface, so a low sun barely lights
   its top, and one stream through a valley makes little mist (`humidityDepth`, `mistDensity`).
3. Try six seeds. A hero that only works for one seed is a painting.
4. Tiers: confirm the lowest tier holds its frame rate on a phone and still reads as the same
   place. The air doubled the land's and the water's cost on the software rasteriser, where
   branching saves nothing; if the lowest tier is short, less arithmetic in `fogged` and in the
   sky is where to look first.

**DoD.** Hero frames for six seeds, kept out of the repo, all acceptable. Frame times for each
tier recorded in the tier calibration file.

### Phase 3 — the wiring

Everything a route needs to exist on this site. Each line is a place that fails a gate, or
degrades silently, if skipped.

1. `src/route-meta.json`: replace the "in progress" description with what the piece is. The
   `vercel.json` rewrite is already there; `check:docs` demanded it the moment the route had a
   meta entry. Build with `npm run build`, never bare `ng build`, or the social card is not
   emitted.
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
- **Do not tune before Phase 2.** Phases 0 and 1 build the instrument; make each one correct and
  legible and move on.
- **Do not loosen the parity tolerance or the conservation bound to get a phase through.** If
  one moves, find out which pass moved it.
- **When a phase lands**: delete it here, renumber, move what was learned into the header of the
  file it concerns, and update this file's size in `CLAUDE.md`.
