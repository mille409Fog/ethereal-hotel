# AUBADE — build notes for a piece that runs on the sun

_An **aubade** is a dawn song: a poem of lovers forced apart at daybreak. It is a form Provençal
troubadours wrote, Donne and Larkin wrote, and Wagner staged. It is also, exactly and without
modification, the tragedy of the vampire — the one creature for whom sunrise is not a metaphor._

This document specifies a second project, deliberately unlike the first. `ROADMAP.md` is about
making a competent thing credible. This is about making something that does not exist elsewhere.

When a task is completed, remove it from the list and then renumber the remaining tasks from the natural numbers onward e.g. 1,2,3 ...;

---

## The concept, in one paragraph

**Hôtel Aubade** is a hotel that keeps the guest's hours. It opens itself at astronomical
twilight, is fully alive at local midnight, and shutters at dawn — dawn where _you_ are, computed
from the real position of the real sun at your real longitude. A visitor in Lisbon at 03:00 and a
visitor in Tokyo at 14:00 open the same URL and are shown two different works. Neither is a
degraded version of the other. Most people arrive during the day, find the hotel closed, and are
told the precise minute the sun will set on them.

The whole thing is rendered by raymarching signed distance fields in a fragment shader. No 3D
library, no meshes, no asset pipeline — an interior that exists only as mathematics, which is the
correct construction technique for a building that is only there at night.

## Why this and not another particle demo

The web is saturated with WebGL portfolio pieces and they are all findable, because they are all
the same three things: a particle field that follows the cursor, a distorted image gallery, a
blob. They are technically fine and completely forgettable, because none of them is _about_
anything and none of them could not have been made by anyone else.

This one has three properties that are hard to copy:

1. **It is indexed to the real world.** The state of the piece is a function of astronomy, not of
   a timeline. It cannot be faked in a screenshot, it is different every hour, and it is different
   for every viewer. Nobody can experience the whole thing in one sitting.
2. **It refuses.** It is closed most of the time and says so. Every other portfolio piece on earth
   is desperate to be looked at; a work with hours is a work with a position.
3. **The concept and the technique are the same thing.** Raymarching builds space out of distance
   functions — rooms that are nowhere, with no geometry, that resolve only when looked at
   directly. That is not a stack choice dressed up in a theme. It is the theme.

If a visitor cannot describe the piece to a friend in one sentence, it has failed. The sentence
is: _"it's a hotel that's only open when it's actually night where you are."_

---

## The shape of the building

Six floors, descending, because a vampire's hotel keeps the good rooms underground. Each floor is
one shader and one idea.

| Floor  | Room                    | Idea                                                                                                                                                                                                        |
| ------ | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0**  | **The Desk**            | The lobby. Raymarched interior, volumetric light through the transom, dust. The register lists prior guests — real ones, anonymised to city and duration. "A guest from Lisbon, 4h ago, stayed 11 minutes." |
| **−1** | **The Mirror Corridor** | A mirrored wall, rendered by a second march. Everything in the corridor reflects. Your light does not. You will notice this about four seconds later than you think you will.                               |
| **−2** | **The Library**         | One sentence, migrating across eight languages in seven writing systems — English, Greek, Russian, Hebrew, Arabic, French, Hindi, Korean — glyphs dissolving into one another rather than cutting. **Built.** |
| **−3** | **The Cellar**          | Meditation. Near-silence. The camera slows to a 4-7-8 breath and the room resolves only if you stay — in the eye, not in the room, which never changes at all. **Built.**                                   |
| **−4** | **The Projection Room** | Film. The post-processing stack _is_ the exhibit, applied to the whole frame rather than to a screen in it. Six switches on a bench you can operate. What the sun moves is the rate. **Built.**             |
| **−5** | **The Box**             | Opera. An aria drives the geometry of the house beyond the balustrade, and what the sun takes is the house itself. Silent, and it says so. **Built.**                                                       |

The elevator between floors is not a transition, it is a room. It is where the morph between two
distance fields happens in full view, and it is the cheapest place in the piece to be spectacular.

---

## The clock (this is the load-bearing part)

Everything else is decoration on top of one function: **given the browser, what is the sun doing?**

- Timezone via `Intl.DateTimeFormat().resolvedOptions().timeZone`. **No geolocation prompt.** A
  permission dialog in the first two seconds kills the piece, and the IANA zone is enough — it
  gives longitude nearly exactly and latitude closely enough for twilight timings.
- A committed table maps IANA zone → representative lat/long. Trim to the ~150 zones that cover
  almost everyone; everything else falls back to the zone's UTC offset for longitude and 40°N for
  latitude, and the piece degrades gracefully because it never claims more precision than it has.
- Solar elevation from the standard NOAA solar-position equations: Julian day → mean longitude →
  equation of time → declination → hour angle → altitude. This is arithmetic, not a library. Do
  not install one.

**Thresholds — the state machine:**

| Solar elevation | State           | The hotel                                                                       |
| --------------- | --------------- | ------------------------------------------------------------------------------- |
| below −18°      | **Open**        | Astronomical night. Everything unlocked, everything alive.                      |
| −18° to −12°    | **Late**        | Rooms begin closing behind you. Lights go out in the order you are not looking. |
| −12° to −6°     | **The warning** | Nautical twilight. The desk clerk starts mentioning the time.                   |
| −6° to −0.833°  | **Aubade**      | Civil twilight. A countdown to the exact minute of sunrise. The piece's climax. |
| above −0.833°   | **Shuttered**   | Day. See below — this is not a failure state.                                   |

`−0.833°` rather than `0°` is the standard sunrise definition: atmospheric refraction plus the
solar radius. Getting this right costs nothing and is the sort of detail the piece is made of.

**Daytime is a second piece, not an empty one.** Blown-out highlights, bleached palette, dust in a
hard shaft of light through a shutter, everything over-exposed to the edge of white, silence. The
lobby is visible and the corridor is dark. On the desk is a card with the local sunset time and a
countdown. It should be beautiful enough that a visitor at noon feels they got something, and
pointed enough that they come back after dark.

**The invitation.** A vampire cannot enter uninvited — so the reverse also holds, and a daytime
visitor may invite themselves in. One control, plainly visible, diegetic, and slightly reluctant:
_"The night rooms can be opened for you. They will not be the same."_ Taking it runs the full
night piece with a faint permanent marker that this was not your hour. **This override is
mandatory and must be obvious.** A hiring manager opening the link at 2pm on a Tuesday must reach
the whole work in one click. The refusal is the concept; locking people out is just rudeness.

---

## Non-negotiables

Fail any of these and the piece is worse than not building it.

1. **The Reader's Edition.** A text version reachable from a visible link on every screen — not a
   `<noscript>` tag, not an ARIA description. It is the hotel written as a short prose work,
   ~1200 words, genuinely worth reading, with the current solar state stated in words. It serves
   screen readers, `prefers-reduced-motion`, absent WebGL, dying batteries, and people who simply
   prefer to read. Write it as literature, because half the point of the project is that you can.
2. **It never blocks the main site.** Lazy route, dynamic import of the renderer, no WebGL context
   created until the route is entered, shader sources in their own chunk. `/` and `/dashboard`
   Lighthouse scores must not move by a single point.
3. **`prefers-reduced-motion` is honoured at the concept level.** Not "slower animation" — the
   camera stops moving entirely, the piece becomes a series of still compositions that change on
   interaction. The repo already reasons about this properly in `styles.css`; hold that line.
4. **It degrades three times, deliberately:** no WebGL2 → WebGL1 path or straight to the Reader's
   Edition; weak GPU → half-resolution render with upscale; sustained sub-30fps → drop march steps
   and volumetric samples before dropping resolution again. Detect, decide, and **tell the user
   what you did** in the desk register. Silent degradation is how a portfolio piece gets
   remembered as "that one that ran badly on my laptop."
5. **Frame budget: 16ms at 1440p on integrated graphics.** Measured, not hoped. If the Cellar
   cannot make budget, the Cellar gets simpler — the piece does not get a spinner.
6. **No licensed audio, no scraped text.** Public domain or self-recorded, sourced in a credits
   file. This is a hiring artifact; a takedown notice is a bad look and an unattributed
   translation is worse.

---

## Placement

Build it in this repo, as `src/aubade/`, on a lazy route (`/aubade`), with **its own design
tokens and zero shared CSS**. One deploy, one CI, the existing lint/test/a11y safeguards apply for
free, and the portfolio links to it direc
tly.

The isolation is not optional. `src/styles.css` is the hotel-gothic system for the resume site;
Aubade must not import it, extend it, or leak into it. If the two ever need the same value, copy
it. A shared token is how a separate work quietly becomes a subsection.

Renderer is **raw WebGL2** — a fullscreen triangle, one fragment shader per room, a small uniform
block, and about 400 lines of TypeScript for context, resize, timing, and hot-swap. No three.js.
Not on principle: a fully raymarched interior needs no scene graph, no loader, and no material
system, so a 600KB dependency would buy nothing and cost the sentence "I wrote the renderer."

That estimate came in at roughly 500 once built (`src/aubade/gl/`, `camera/`, `renderer.ts`), and
the overrun is one thing: the quality ladder that non-negotiable 4 asks for. There is no shader
hot-swap and there does not need to be — `npm run verify:shader` compiles the real source in
headless Chromium and writes a PNG, which is a faster edit loop than reloading a page.

---

## Phases

Ship in this order. Each phase is deployable and each one is worth showing on its own. Do not
start a phase before the previous one is live.

Nine phases have landed and been deleted from this list, per the rule at the top: **the clock**
(`src/aubade/solar/`, checked against published almanac times for eight cities), **the lobby**
(`/aubade` — `src/aubade/gl/`, `camera/`, `rooms/`, `renderer.ts`), **day, night and the
invitation** (`rooms/light-rig.ts`, `desk.ts`, `fake-clock.ts`, and the shutter in
`rooms/hotel.frag.ts`), **the Reader's Edition** (`/aubade/reader` — `src/aubade/reader/`, plus
`hour.ts` and `tokens.css`, which the two routes now share), **the descent and the Mirror
Corridor** (`descent.ts`, `rooms/corridor-rig.ts`, and the second half of `rooms/hotel.frag.ts`),
**the Cellar** (`cellar.ts`, `rooms/cellar-rig.ts`, and `adapted()` in `rooms/hotel.frag.ts`), and
**the Projection Room** (`projection.ts`, `bench.ts`, `rooms/projection-rig.ts`, and
`projected()` in `rooms/hotel.frag.ts`), **the Library's sentence** (`sentence.ts`,
`scripts/build-sentence-atlas.mjs`, `scripts/sentence-field.mjs`, and `MAT_FRIEZE` in
`rooms/hotel.frag.ts`), and **the Box** (`box.ts`, `rooms/box-rig.ts`, and `BOX_GLSL` in
`rooms/hotel.frag.ts`). Their reasoning moved into those files' header comments, which are dense
and are the thing to read before touching any of them.

**Six floors exist and the hotel is complete as a building.** What is left below is not a room.

The Library is the one whose delay was never technical, and that is the part worth carrying
forward. It stood at four languages of eight for as long as it did because the missing four had
nobody to vouch for them, and AUBADE's sixth non-negotiable makes an unattributed translation
worse than a takedown notice. Nothing in the pipeline changed when they landed — a language is a
row in `SENTENCE_SCRIPTS`, a subsetted face, a row in `docs/aubade-credits.md` and a rebuilt
atlas, exactly as it was on the day the first four shipped. What changed is that four people read
the lines. Two smaller things fell out of it and are now facts rather than plans: the ids name
languages rather than scripts, because `latin` stopped being the English line the moment French
existed; and the table's *order* became a constraint, since English and French share an alphabet
and a morph between two Latin lines placed side by side reads as a typo being corrected.
`adjacentSameScript` in `sentence.ts` is that constraint, and `sentence.spec.ts` is the only thing
that enforces it — a table in the wrong order renders perfectly.

The Projection Room is the one that changed what a floor is allowed to _answer with_, so its shape
is worth carrying forward too. The first three rooms answer the sun with light — the lobby
brightens, the corridor's gas goes out, the library keeps its lamps and loses its writing. Floor −3
answers with the visitor. Floor −4 answers with **time**: the projector runs at twenty-four frames
a second at astronomical night and slows through eighteen, twelve and eight, and at noon it is
stopped dead with the lamp still on and one frame burning through in the gate. Nothing about the
light moves at any hour. What that costs is a fifth _shape_ of assertion, because no single frame
can show a rate — `verify-shader.mjs` renders this floor at two different seconds and requires them
to differ at astronomical night and to be identical to the byte at noon. The quantisation is in
TypeScript rather than in GLSL for one reason worth remembering: the camera has to step too, and a
room whose picture judders under a viewpoint that glides is a filter with a hotel painted on it.

The bench is the other half of that phase and is the only control surface in the piece that is not
diegetic furniture. Six switches — gate weave, halation, grain, judder, splice flashes, cue dots —
each of which visibly changes the frame, in `bench.ts` with its own template and stylesheet. The
rate is beside them as a readout and is deliberately not a control: the bench operates the
apparatus, the sun operates the film, and a visitor who could wind the machine back up at noon
would have been handed the floor's whole answer to the clock in one click.

The Cellar is the one that changed what a floor is allowed to be, so its shape is worth carrying
forward. The other three rooms answer the sun with light: the lobby brightens, the corridor's gas
goes out, the library keeps its lamps and loses its writing. Floor −3 answers it with the visitor.
The room is one brick vault and one candle and is **identical at every hour and for everybody** —
nothing in its distance field reads the clock or the stillness, and `check:docs` fails if that ever
stops being true. What ninety seconds of standing still buys is a gain and a desaturation applied to
the finished frame, modelling a dark-adapting eye; what the sun sets is the ceiling on that, which
is exactly zero at noon. A visitor who came in out of the daylight can stand there all afternoon and
see the room they walked into. Two committed frames per hour would have been five copies of one
picture, so `verify-shader.mjs` asserts the identity instead — all five arriving frames the same,
the settled one three times brighter and measurably less coloured, and the noon pair equal.

The room reads the clock: one shader, five sets of uniforms, five palettes and five light rigs,
with the daytime state built as its own picture — the louvres are geometry, the bars they cut are
the only direct light in the room, and the palette is faded rather than the night frame
over-exposed. The five frames are committed as `docs/images/aubade-lobby-<state>.webp` and
`npm run verify:shader` renders all five, asserting they brighten in the order the sun does. The
dev-only fake clock is `?t=<state|instant>` with an optional `?tz=`; it is gated on `isDevMode()`,
so the only way into the night rooms in production is the invitation, which is the point.

The Reader's Edition is the work in its other form rather than a summary of it: about twelve
hundred words of fixed prose in `reader/edition.ts`, with the hotel's standing computed into three
sentences at the top by `reader/standing.ts` — where the sun was read for and how confidently, how
far it is from that horizon, and what changes next. It is a route of its own rather than a band on
the lobby because the whole of its Definition of Done rested on no WebGL context being created on
it, so all three layers check that: `check:docs` walks its import graph, an e2e test counts
`getContext` calls on the live page, and the a11y sweep scans it with the other five routes. Both
of the lobby's screens link to it. Note the two things it deliberately does _not_ share with the
lobby — it ignores `?t=<state>`, because a forced state next to a real elevation is the one lie
this page cannot tell, and no font size on it is expressed in `vw`, because a `vw` size shrinks
when a reader zooms in.

The Box is the one that landed by being finished rather than by being completed, and that is the
part worth carrying forward. Its phase note put the floor last because _"audio licensing and
autoplay policy are the two things most likely to eat a week"_, and neither of them ate anything.
Autoplay was answered by the concept: the floor was already required to be worth looking at in
silence _"because for most visitors it will be"_, and taken to its end that is a room with no
audio graph in it, which has no autoplay policy to lose to. Licensing was answered by arithmetic —
`ARIA` is the author's own nineteen notes, so there was never a third party to clear and there
never had been. For a while this document described a floor waiting on provenance. It was a floor
that had already found its ending: an aria is being sung in a house five floors under the street
and nobody in the building can hear a note of it, because nobody has ever sung it. A hotel that
refuses is the concept, and this is the one floor that turns the refusal on the work itself rather
than on the visitor. `docs/aubade-credits.md` carries the provenance and the one route — a
public-domain recording — that is declined on the merits rather than left open.

**The sixth floor answers with space, and it had to.** Five answers were already spent — light
arriving, light leaving, writing leaving, the visitor's own eye, and speed — and three of those
five are a weight in [0, 1] that reaches exactly zero at noon. A fourth would have been the same
answer in a different hat. So `house` is a **length in metres**: the auditorium is thirty-four
metres deep at astronomical night and closes as the night ends, and at the shuttered hour it is
exactly zero — no auditorium, a solid wall flush with the balustrade, and a red cupboard two metres
deep with a reading lamp still lit in it. It is the only room in the hotel that is _cheaper to draw
at noon_, because there is less of it.

That forced a sixth _shape_ of assertion, which is the real test of whether a floor was worth
building. The frames cannot be ordered by brightness, held flat, paired by visitor or paired by
instant. What `verify-shader.mjs` requires instead is a **discontinuity**: the four hours with a
house in them brighten as it shrinks, and noon must be darker than all of them — which nothing
continuous can satisfy, and which a house of 200mm fails while looking entirely plausible in the
frame. That last was measured rather than assumed; the check before it, on peak luma, passed a
200mm house cleanly.

**And the floor needed a seventh assertion for the thing it is actually named after**, which was
very nearly missed. A still cannot show a voice any more than it can show a rate — and worse, the
script renders at second 0 by default, which is the start of the aria's first note where the attack
envelope is exactly zero. So the whole floor was verified, and its five reference images committed,
with the singer silent and the house standing perfectly still. Every gate passed. The `hushed`
probe is the answer, and it swaps the **voice** rather than the clock: two instants a few seconds
apart would also be two camera poses, because the camera breathes, so the noon comparison could
then only ever carry a tolerance — the trap `TURNED` records one floor up. Holding the second and
silencing the singer makes the difference in the frame _be_ the aria.

Two smaller things are now facts rather than plans. **The lift is behind the visitor here, and only
here**, because the far end is the thing the room is for and a camera turned round to keep the lift
in frame is a camera pointed at the back of the only floor with a view. And the seam stays built:
`voiceAt` returns **eight logarithmic bands from 80 Hz to 8 kHz** rather than the note that is
sounding, which is what an `AnalyserNode` hands back, so the decision to keep the floor silent
costs nothing that could not be undone by replacing one function.

The question a third floor raised is settled and the answer generalised, so a further room is no
longer an architectural decision. Two rooms fitted in one program because two distance fields can be
mixed by one uniform; three did not extend that for free, and the fork was either `mapScene`
branching on which pair is being mixed or the lift ceasing to be a mix and becoming a fade. The
branch was taken. `mapScene` now evaluates each room into its own local behind its own guard and
chooses between locals, so a settled floor still costs one field, a ride still costs two, and
another floor is one more guard and one more name. The rule that makes that true is that **no room
may be named twice** — see the note in `hotel.frag.ts`, which is where the ten-times-slower frame is
recorded. Two floors have arrived on those terms since it was written and neither touched the shape.
The one part that did not stay flat was the pair of nested ternaries choosing between the locals,
and the sixth room is where they were replaced by an array of six locals indexed by the leg — which
is what this paragraph said would happen, at the floor it said it would happen at. The index is a
uniform expression, so every invocation takes the same slot and it is not divergent addressing;
measured, the Box and the ride into it cost what the lobby costs.

Each room owes the Reader's Edition a paragraph, and owes `check:docs` and `verify-shader.mjs` a
committed frame per solar state. `reader/edition.ts` describes all six floors in the present tense
and then says plainly that all six are built — that sentence was the ledger while the building was
going up, and it is now a statement rather than a list. It still has to stay true.

### Phase 1 — The register

Where the existing backend skills come back. `POST /api/aubade/visits` on arrival, `GET` for the
register: city (from timezone, never IP), duration, floors reached, local solar state at arrival.

- **DoD:** no PII, no IP storage, no cookies. Retention capped and stated in the register itself.
  Rate-limited. The register is legible as a feature of the fiction and defensible as a privacy
  decision in the same breath — say so in the README.

### Phase 2 — Dawn

The ending. A visitor present through actual civil twilight into actual sunrise at their location
sees the hotel close: the countdown, the light arriving, the rooms shuttering in order, the last
frame. It happens once a day, per person, and cannot be triggered on demand.

- **DoD:** verified against a real sunrise, not the fake clock. Sit up for it once. If nothing
  else in this project is worth the trouble, that morning will be.

---

## Additional Vampiric Improvements

### Un - Make the morphing animation for gothic / vampiric

Currently we handle certain movements from one room to another through morphing,
the hotel guest does not move so much as the room twists and turns from one
state to another. That is all well and good and is possibly in keeping with an
enchanted gothic hotel. However the transition animation is a beige mess, it does not
read as vampriric so much as blase undifferentiated mass. Alter this transition to become
more gothic / vampiric and to appear more otherworldly.

- **DoD:** The transition state reads as magical and vampiric, not an undifferntiated mass of beige.

## How you will know it worked

Not by frame rate. By these:

- Someone screenshots it into a group chat without being asked.
- Someone comes back at night because they were told to.
- An interviewer opens it during the call instead of after it.
- Someone asks how the sun thing works, and you get to explain the equation of time to a person
  who wanted to know.

## How it fails

Recorded now, while it is still cheap to avoid:

- **It becomes a demo reel.** Six rooms of unrelated effects with a hotel painted on. The fix is
  the clock: every room must respond to the same solar state, or the concept is a wrapper.
- **It is pretty and it is slow.** Fatal. See non-negotiable 5.
- **The writing is bad.** A piece this literary cannot carry limp prose. Every string in it — the
  desk clerk's lines, the register, the invitation, the Reader's Edition — is written, not
  drafted. Fewer words, better.
- **It is impressive and unreadable.** If a visitor cannot tell where they are or what to do
  within eight seconds, the atmosphere has eaten the work. Ambiguity is a choice; confusion is a
  bug.
- **It never ships.** Six rooms is an ambition, not a commitment. The descent and the corridor were
  the rest of the project and they have landed, so **everything still on the list is optional** —
  a finished five-floor hotel with a Reader's Edition beats an abandoned six-floor one by an
  enormous margin, and that is now the thing that exists rather than the thing being argued for.

---
