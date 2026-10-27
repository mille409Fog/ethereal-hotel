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

## 1. Selectable continents

The seven continents, through the mechanism the states built: `GuestProgressStore` in
`guest-progress.ts` already stores and restores all four lists, so this is flipping `selectable`
in `quest-state.ts` and passing the map's fill and the checklist through.

**DoD:**

- The map and a seven-checkbox list toggle the guest's continents, saved and restored as the states
  are, with the same clear control and storage failure message.
- Marking a country never marks its continent, and the reverse: `places.data.ts` says a continent
  is marked on its own, and the dissolved shapes are a drawing choice, not a rule. The spec says so.
- The same tally, fill, hover and read-only-owner rules as the states.

Effort: an hour or two.

## 2. Selectable countries

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
