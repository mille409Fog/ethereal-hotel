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

## `/wanderquest` maps

Five graphical items for the travel quests' maps, the first the one that matters most. They share
one complaint: a place the guest has marked that they cannot see. The page's house rules bind all
of them: Fern's tokens and one accent for controls, the quest palettes in `wanderquest.css` for
places and never for controls, no glow, and no motion that does not show a change of state. Any
colour a change introduces is measured, not picked by eye; `wanderquest.spec.ts` recomputes the
palette contrasts from the CSS, so a new pairing goes into that spec too. `e2e/a11y.spec.ts` runs
axe over `/wanderquest` and has to stay green.

Two things every item here will trip over. The `*.outline.ts` files are generated: edit
`scripts/build-outline.mjs` and re-run `npm run outline:build`, which needs the network and runs by
hand, and keep each outline under the size ceiling `outline.spec.ts` holds it to. And any change to
what the page draws fails `e2e/project-frames.spec.ts` until `npm run frames:capture` is re-run;
that is the gate working.

### 1. The hovered place is named under the map

A place's name appears only in the browser's native tooltip: about a second late, wherever the OS
puts it, and never on touch. **Effort:** 2 hours.

**DoD:** a line directly under each outline names the place under the pointer, or the one a
checklist row is highlighting, with its state ("Texas — visited"), and updates instantly. After a
tap on a touch screen it names the place just toggled, so a tap has a visible answer. The line
reserves its height, so the page does not jump as it fills and empties. It is not an `aria-live`
region, for the reason the dashboard's metrics grid is not one: the checklist already announces
every change, and a hover narrated aloud is noise. The `<title>` elements go, since two names for
one hover is worse than one; the unit test that checks every title matches its place moves to the
caption, and the a11y assertion that screen readers hear one image still holds.

### 2. The world maps sit on the globe's outline

The continents and countries float on the page background with no edge, so the projection's shape
is lost and the oceans are nowhere. **Effort:** 1–2 hours.

**DoD:** the build script emits Equal Earth's sphere outline as an optional `sphere` path on
`IOutline`, drawn beneath the places in a Fern token and answering no click. The states outline,
an Albers composite with no sphere, gets none. Every fill on the map is measured against the new
background: unvisited, visited and highlight per palette, and the unkeyed grey, which must still
read as land and not as sea. Those pairs join `wanderquest.spec.ts`. The borders between places
are drawn in `--color-bg`; if that no longer reads against the sphere's fill, the stroke changes
and the comment on `.quest-outline` says why. Under `forced-colors` the sphere is `Canvas` with a
`CanvasText` edge, so it adds a frame and takes nothing away.

### 3. The scattered bonus territories can be found in their tiles

The U.S. Virgin Islands and American Samoa are islands spread far apart, so fitting each group to
its tile leaves the land a few pixels across and the tile looks empty. **Effort:** 2 hours.

**DoD:** in any tile whose land covers less than a threshold share of its area — computed by the
build script, not a hand-picked list — each island group is circled with a 1px non-scaling ring
that takes its place's current fill, so the ring changes colour as the land does. Every ring colour
clears 3:1 against `--color-bg` or it is not used, and that pair is in the spec. The threshold and
which tiles it currently catches are written in the generated file's header. DC, Puerto Rico and
Guam, which fill their tiles, are untouched.

### 4. The countries checklist stops being 7,000 pixels on a phone

At 375px the countries list is one column of 195 rows and the page is about 7,300px tall; the
"Clear my countries" button is at the bottom of all of it. **Effort:** 2–3 hours.

**DoD:** on the countries quest only, the list shows the places the guest has visited and whatever
the search matches; the full alphabetical list is behind a native `<details>` ("All 195
countries"), closed by default. Nothing is lost to the keyboard: the search is still the first
control, and opening the disclosure gives the whole list. Grouping by continent is out, because the
repo holds no country-to-continent mapping and every one is contested (Russia, Türkiye, Egypt);
inventing one would put a claim on screen nothing backs. Measure the page height at 375px before
and after and record both in this item's commit message. States and continents are short enough to
stay as they are.

### 5. The Caribbean gets an inset, as Europe did

The measurement Europe's inset left in `build-outline.mjs` decided it: at 320px the world map
draws 17 Caribbean countries narrower than 8px, against Europe's 43, in a third of the area, and
the panel's note still names seven overlapping dots there and Trinidad and Tobago hidden under
three of them. **Effort:** 2–3 hours.

**DoD:** a second inset under Europe's, the `CARIBBEAN` box at a whole multiple of the world map's
scale, built by the same code path rather than a copy of it: `EUROPE` and `CARIBBEAN` become a list
of insets, each writing its own outline and its own `enlarges` rectangle on the world map. The
note stops naming the Caribbean for the reason it stopped naming Europe, and `outline.spec.ts`
holds the same claims for both. The header's measurement says which insets exist instead of
"nothing enlarges yet".

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
