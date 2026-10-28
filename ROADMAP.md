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

## 1. Selecting the bonus map

**Effort:** two hours. **Why:** the three main maps fill as a guest marks places. The bonus map
under the states outline (`QuestBonusMap`, drawn from `bonus.outline.ts`) is the one map that
can't be marked. The storage, the checklist, the tally and the clear control already handle the
`bonus` list. Only the map is missing.

**Definition of Done:**

- **Clicking a tile marks or unmarks that place**, exactly like ticking its bonus checkbox. The
  map and the checkbox stay in step whichever one is used, and the tally's "N of 6 bonus" line
  moves with them.
- **The hit target is the whole tile, not the land.** American Samoa's land and DC are each only
  a few units across, too small to click reliably. Each tile is at least 24 × 24 CSS pixels at
  the narrowest supported width, which is WCAG 2.5.8's minimum target size.
- **The map stays a picture of the checklist**, as the other three are: one `role="img"`, nothing
  in it takes focus, and the keyboard route is the bonus checkboxes. Its click-handler lint
  suppression carries the same reason as the states map's.
- `onMapClick` toggles the list the map draws rather than the quest's own list. A click on the
  bonus map must never write to `states`, and a click on the states map must never write to
  `bonus`; a test asserts both.
- **A marked place is filled with the panel's `bonus` colour**, not `visited`, so the key's
  existing "Bonus, visited" swatch describes something on screen. The swatch keeps its contrast
  against the unvisited fill, and forced colours show the fill as `Highlight`, as the other maps do.
- **It survives reload and clearing.** Marks persist under the existing `wanderquest.guest.v1`
  key, with no second key; a test already asserts there is only one. "Clear my states" empties
  the bonus map along with the checkboxes.
- Unit tests cover:
  - a click on a tile;
  - a click on the tile's water;
  - the checkbox and the map staying in step;
  - reload;
  - clear;
  - storage that throws.

  `npm run e2e` passes, including axe on `/wanderquest`.

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
