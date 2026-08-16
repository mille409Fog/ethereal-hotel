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
| **−2** | **The Library**         | One sentence, migrating across eight writing systems — Latin, Greek, Cyrillic, Arabic, Devanagari, Hebrew, Han, Hangul — glyphs dissolving into one another rather than cutting.                            |
| **−3** | **The Cellar**          | Meditation. Near-silence. The render loop slows to a breath cycle and the room resolves only if you stay. The one place that rewards patience, and therefore the only one anybody remembers.                |
| **−4** | **The Projection Room** | Film. The post-processing stack _is_ the exhibit: gate weave, halation, grain, 24fps judder, splice flashes, reel-change cue dots. Exposed as a projectionist's bench you can operate.                      |
| **−5** | **The Box**             | Opera. A single aria drives the geometry. Silent by default — must be beautiful with the sound off, because for most visitors it will be.                                                                   |

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
free, and the portfolio links to it directly.

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

Five phases have landed and been deleted from this list, per the rule at the top: **the clock**
(`src/aubade/solar/`, checked against published almanac times for eight cities), **the lobby**
(`/aubade` — `src/aubade/gl/`, `camera/`, `rooms/`, `renderer.ts`), **day, night and the
invitation** (`rooms/light-rig.ts`, `desk.ts`, `fake-clock.ts`, and the shutter in
`rooms/hotel.frag.ts`), **the Reader's Edition** (`/aubade/reader` — `src/aubade/reader/`, plus
`hour.ts` and `tokens.css`, which the two routes now share), and **the descent and the Mirror
Corridor** (`descent.ts`, `rooms/corridor-rig.ts`, and the second half of `rooms/hotel.frag.ts`).
Their reasoning moved into those files' header comments, which are dense and are the thing to read
before touching any of them.

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

### Phases 1–4 — One room each

In this order, by ratio of impact to risk:

2. **The Cellar** — breath pacing, 4-7-8 cycle, the room resolving over ~90 seconds of stillness.
   The hardest thing here is nerve: it must actually be quiet and actually be slow.
3. **The Projection Room** — the film stack, operable. Cheapest spectacle in the project.
4. **The Box** — opera, WebAudio FFT → geometry. Last, because audio licensing and autoplay policy
   are the two things most likely to eat a week.

A third floor is a bigger step than the second one was, and it is worth knowing why before
starting. Two rooms fit in one program because two distance fields can be mixed by one uniform and
the settled floors each cost what one room cost. Three rooms do not extend that for free: either
`mapScene` starts branching on which pair is being mixed, or the lift stops being a mix and becomes
a fade. Decide which before writing any GLSL, because the answer changes `hotel.frag.ts` far more
than it changes the new room.

Each new room owes the Reader's Edition a paragraph, and owes `check:docs` and
`verify-shader.mjs` a committed frame per solar state. `reader/edition.ts` describes all six
floors in the present tense and then says plainly which are built — a room that ships without
moving itself out of that list has quietly made the page lie.

### Phase 5 — The register

Where the existing backend skills come back. `POST /api/aubade/visits` on arrival, `GET` for the
register: city (from timezone, never IP), duration, floors reached, local solar state at arrival.

- **DoD:** no PII, no IP storage, no cookies. Retention capped and stated in the register itself.
  Rate-limited. The register is legible as a feature of the fiction and defensible as a privacy
  decision in the same breath — say so in the README.

### Phase 6 — Dawn

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
  a finished two-floor hotel with a Reader's Edition beats an abandoned six-floor one by an
  enormous margin, and that is now the thing that exists rather than the thing being argued for.

---
