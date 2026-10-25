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

## 1. An outline of the countries map

The roughest contours of what the countries quest's map will look like, drawn inside its panel the
way the states and continents panels already draw theirs. An outline is not a map yet: nothing in
it is selectable, focusable, hoverable or filled by progress, and it does not have to look good.
The pipeline exists — this adds a `countries` target beside `states` and `continents` in
`scripts/build-outline.mjs`, and sets the quest's `outline` — and the continents target already
fetches the file this one needs and projects it in `equalEarthWorld()`, so the two world outlines
read as one atlas.

**DoD:**

- Natural Earth's 1:110m admin-0 shapes, cited in the header as `continents.outline.ts` cites
  them, and joined on the ISO alpha-2 code `places.data.ts` already chose for that reason — from
  `ISO_A2_EH`, not `ISO_A2`, which is `-99` for France and Norway in version 5.1.1.
- One path per `COUNTRIES` id that has a shape at this scale. 1:110m drops the smallest states (the
  Holy See, Monaco and many island nations among them), so the spec holds the list of ids with no
  path, and fails if that list grows or if a path carries an id outside the 195. The outline does
  not claim to draw what it cannot.
- Shapes Natural Earth carries that are not among the 195 — Antarctica, Greenland, Western Sahara,
  Taiwan, Northern Cyprus, Somaliland and the rest — are drawn unkeyed, so the coastline is whole
  without the count changing. `IOutlineShape` requires an id today, so this is where it learns to
  go without one, and where `outline.spec.ts`'s "every place exactly once" learns to ignore them.
- The outline joins `OUTLINES` in `outline.spec.ts` and the panel spec's list of drawn quests, so
  it is held to the same fill, stroke, labelling, no-focus and size-ceiling rules as the others.

Effort: half a day, most of it the join.

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
