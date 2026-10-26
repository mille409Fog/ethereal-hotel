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

## 1. Selectable states

The first of three items that turn an outline into a map a guest can use: selecting a state marks
it visited, selecting it again unmarks it. This one builds the mechanism, so the continents and
countries items after it are mostly wiring. A guest's progress is theirs alone — `progress.data.ts`
already says it "lives in their own browser" — and the owner's committed progress stays read-only.

**DoD:**

- A guest's visited places are held in a signal per quest and saved to `localStorage` under one
  versioned key, read back on load. Ids that are not in `places.data.ts` (a stale or hand-edited
  key) are dropped on read rather than counted. Every storage call is wrapped: when storage is
  unavailable the page still works for the visit, and says on screen that it will not be kept.
- The panel's tally counts the guest, and the owner's figures become a separate read-only line, so
  the page never mixes the two counts. Guest progress starts empty; it is never seeded from the
  owner's.
- Clicking a state on the map toggles it, and its fill moves between `--quest-unvisited` and
  `--quest-visited`; a hovered state takes `--quest-highlight`. The map stays one `role="img"` and
  takes no focus: the keyboard and screen-reader route is a list of native checkboxes, one per
  state and one per bonus place, bound to the same signal. The map is a picture of the list, not a
  second control, so the two cannot disagree. Small states (Rhode Island, Delaware) are hard to hit
  on a phone, and the list is the answer to that too.
- The bonus places, which the outline does not draw, are selectable in the list only, and fill the
  bonus tally.
- One control clears the guest's progress for the quest, and asks before it does.
- Nothing leaves the browser: no backend call, no analytics event. `docs/analytics.md` says what the
  page stores and why it needs no consent — it is the visitor's own record, kept because they asked
  — so the "nothing to consent to" claim stays true rather than quietly stretched.
- Specs cover a click and a checkbox toggling the same state, the tally following both, a reload
  restoring the selection, a bad key being ignored, and storage that throws.

Effort: a day, most of it the storage edge cases and the list.

## 2. Selectable continents

The seven continents, through the mechanism the states item built.

**DoD:**

- The map and a seven-checkbox list toggle the guest's continents, saved and restored as the states
  are, with the same clear control and storage failure message.
- Marking a country never marks its continent, and the reverse: `places.data.ts` says a continent
  is marked on its own, and the dissolved shapes are a drawing choice, not a rule. The spec says so.
- The same tally, fill, hover and read-only-owner rules as the states.

Effort: an hour or two.

## 3. Selectable countries

The 195, through the same mechanism. The list is the hard part: 195 checkboxes are a wall, so this
is where the list learns to be searched.

**DoD:**

- A text filter above the list narrows it by name as the guest types, with the number shown as a
  live count, and clearing the filter restores the whole list. Selection survives filtering.
- The 33 countries the outline cannot draw are selectable in the list like any other, and count;
  the panel's "too small to draw" line already promises that, and this is where it becomes true of
  a guest's tally too.
- The unkeyed land (Antarctica, Greenland, Taiwan and the rest) is never selectable and never
  changes colour: it is not one of the 195.
- The same storage, clear, tally, fill, hover and read-only-owner rules as the other two.

Effort: half a day, most of it the filter.

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

See **[AUBADE.md](AUBADE.md)** for the separate, deliberately un-boring project — this file is
about making the competent thing credible; that one is about making something nobody else has.
