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

Three small aesthetic items for the travel quests, roughly cheapest first. The page's house rules
bind all of them: Fern's tokens and one accent for controls, the quest palettes in
`wanderquest.css` for places and never for controls, no glow, and no motion that does not show a
change of state. Any colour a change introduces is measured, not picked by eye. `wanderquest.spec.ts`
recomputes the palette contrasts from the CSS, so a new pairing goes into that spec too.
`e2e/a11y.spec.ts` runs axe over `/wanderquest` and has to stay green.

### 1. A completed quest says so

At 50 of 50 the tally reads exactly as it does at 49. **Effort:** 30 minutes.

**DoD:** when every required place is marked, the tally reads as complete (wording to the owner's
taste, e.g. "All 50 states visited"). There is no confetti, animation or colour change, only the
words. The bonus stays "not required" and does not block completion. A unit test covers 49, 50
and 50-plus-bonus.

### 2. A one-line introduction under the title

The header is the word "Wanderquest" and nothing else, so a visitor arriving from the projects
section has to work out what the page is from the tabs. **Effort:** 15 minutes.

**DoD:** one sentence under the `<h1>`, in `--color-text-secondary`, that says what the page does
and where the marks are kept (e.g. "Mark where you've been. It stays in this browser and nowhere
else."). That is the same claim the storage notice in the tally makes when it fails, so the two
must not contradict each other. If `src/route-meta.json` describes the route, the two are worded
consistently.

### 3. Hovering a checklist row highlights its place on the map

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
