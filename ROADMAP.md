# EtherealHotel — Improvement Roadmap

Work these in order. Each item has a **Definition of Done (DoD)** so a separate instance can
implement it and this instance can verify it. Effort is a rough estimate.
When finished with a task remove it from the list and alter the remaining
list in an ascending order of natural numbers e.g. 1, 2, 3, 4 ...;

The bar for every item: _would a senior engineer reviewing this repo in an interview see judgment,
or see a tutorial?_ Prefer finishing one thing convincingly over starting three.

**Notable details, for whoever reads this next:**

- Seeding uses a **fixed RNG seed** so every cold-started instance derives the same hotel;
  bookings are still laid out around `date.today()`, so the demo does not decay the way a
  committed snapshot would. Verified byte-identical across fresh instances.
- Vercel's Python runtime offers 3.12/3.13/3.14 and **no 3.11**, so the function runs 3.12 while
  the container and ruff/mypy target 3.11. The CI matrix runs both rather than assuming the gap
  is harmless. Dependencies are declared in two files for the same reason, and
  `backend/tests/test_dependency_pins.py` fails if they drift.
- `requires-python`/`.python-version` are only consulted when `pyproject.toml` is the dependency
  source; a root `requirements.txt` silently overrode both and pinned the build to 3.14, where
  our `pydantic-core` has no wheel. That is why there is no `requirements.txt` at the root.
- The Lighthouse gate asserts the **desktop** profile, and the README says so rather than
  implying more. On mobile emulation the same build scores 86 on `/` and 76 on `/dashboard` — the
  dashboard route ships Chart.js and 229kB of its own chunk. Raising _that_ is real work on the
  bundle, not a threshold edit, and it is deliberately not an item yet.

## `/wanderquest` polish

Nine small aesthetic items for the travel quests, roughly cheapest first. The page's house rules
bind all of them: Fern's tokens and one accent for controls, the quest palettes in
`wanderquest.css` for places and never for controls, no glow, and no motion that does not show a
change of state. Any colour a change introduces is measured, not picked by eye. `wanderquest.spec.ts`
recomputes the palette contrasts from the CSS, so a new pairing goes into that spec too.
`e2e/a11y.spec.ts` runs axe over `/wanderquest` and has to stay green.

### 1. Visited rows read brighter in the checklist

Every checklist row is `--color-text-secondary` whether ticked or not, so the list does not show
progress, and only the map does. **Effort:** 15 minutes.

**DoD:** a ticked row's label is `--color-text` and an unticked one stays
`--color-text-secondary`, selected from the checkbox state (`input:checked + label`) rather than a
second class that could disagree with it. Both lists change: the quest's and the bonus.
The difference does not rest on colour alone, because the checkbox still carries it.

### 2. Tabular numbers in the tally

The tally is centred, so going from "9 of 50" to "10 of 50" moves the whole line sideways.
**Effort:** 5 minutes.

**DoD:** `.quest-tally`, `.quest-bonus` and `.quest-owner` set
`font-variant-numeric: tabular-nums`. Check that the serif face in `--font-serif` actually has
tabular figures before claiming it fixes anything; if it does not, say so here and drop the item.

### 3. A short transition when a place fills

A place changes from unvisited to visited between one frame and the next. **Effort:** 15 minutes.

**DoD:** `.quest-outline path` and the bonus map's land transition `fill` over 120ms ease-out,
the timing the tabs already use, with a comment saying it plays once per mark, which is the state
it shows. Hover keeps its instant highlight, so the transition applies to the visited fill and not
the highlight. There is no local reduced-motion override, because the global block in
`styles.css` already collapses it, and the comment says that rather than adding a dead
`transition: none`.

### 4. The destructive answer looks destructive

"Clear them" and "Keep them" are the same button, and only one of them loses data.
**Effort:** 20 minutes.

**DoD:** "Clear them" has a `--color-negative` border and text. That is a state colour, not the
accent, as CLAUDE.md requires of an error-shaped thing. "Keep them" is unchanged and keeps focus
as it does now. Under `forced-colors` the two still differ by something other than colour; the
wording already does that, so confirm it rather than adding more. The text contrast on
`--color-bg` is stated in a comment beside the rule.

### 5. Place names on hover over the map

Hovering a shape highlights it but does not name it. On the countries outline most shapes cannot
be recognised without a name. **Effort:** 1 hour.

**DoD:** each keyed `<path>` on the three outlines carries a `<title>` with the place's name from
`places.data.ts`, so a pointer gets the browser's native tooltip. The SVG stays `role="img"` with
its one `aria-label`, so screen readers hear one image and not 195 names; `e2e/a11y.spec.ts`
proves that. The bonus map already draws its names, so it is left alone. A unit test checks that
every keyed path's title matches its place.

### 6. A progress bar under the tally

"12 of 50" is a number to read; a bar is a proportion you take in at a glance. **Effort:** 1 hour.

**DoD:** a thin bar under `.quest-tally`, filled with `--quest-visited` over a track of
`--quest-unvisited`. These are data colours, which the palette comment already permits, and each
pair is already measured at 3:1 or better. It is `aria-hidden`, because the tally sentence is the
accessible version and saying it twice is noise. Under `forced-colors` the fill is `Highlight` on
`Canvas`, matching the map. The bonus count gets a bar only if it reads as clearly secondary;
otherwise it gets none, and this item says which was chosen.

### 7. A completed quest says so

At 50 of 50 the tally reads exactly as it does at 49. **Effort:** 30 minutes.

**DoD:** when every required place is marked, the tally reads as complete (wording to the owner's
taste, e.g. "All 50 states visited"). There is no confetti, animation or colour change, only the
words. The bonus stays "not required" and does not block completion. A unit test covers 49, 50
and 50-plus-bonus.

### 8. A one-line introduction under the title

The header is the word "Wanderquest" and nothing else, so a visitor arriving from the projects
section has to work out what the page is from the tabs. **Effort:** 15 minutes.

**DoD:** one sentence under the `<h1>`, in `--color-text-secondary`, that says what the page does
and where the marks are kept (e.g. "Mark where you've been. It stays in this browser and nowhere
else."). That is the same claim the storage notice in the tally makes when it fails, so the two
must not contradict each other. If `src/route-meta.json` describes the route, the two are worded
consistently.

### 9. Hovering a checklist row highlights its place on the map

`--quest-highlight` is in the key but only appears when the map itself is hovered. The list and
the map are two drawings of one set of data and nothing connects them. **Effort:** 2–3 hours.

**DoD:** hovering or focusing a checklist row fills its shape with `--quest-highlight`, and
leaving the row clears it. Keyboard focus counts, which is the point: the list is the map's
keyboard route, so a keyboard user gets the link a mouse user gets. The hovered id is one signal
owned by the page, written by the checklist and read by the outline; neither component reaches
into the other. Places too small to draw do nothing, quietly. Unit tests cover hover, focus,
leaving, and an undrawn place; one e2e assertion confirms that the fill changes.

## Deliberately not doing

Recorded so the next instance does not helpfully add them:

- **Auth/JWT.** Nothing here is worth protecting. A login wall on a portfolio demo costs the
  reviewer a click and teaches them nothing.
- **Kubernetes, Prometheus, multi-tenancy.** Infrastructure with no load behind it is cosplay.
  The Dockerfile plus the serverless function already show the deployment reasoning.
- **A fourth and fifth CRUD screen.** The case studies already carry the breadth argument; more
  screens here read as padding.
- **Rewriting the frontend in another framework.** The Angular is fine and the time is better
  spent on `AUBADE.md`.
