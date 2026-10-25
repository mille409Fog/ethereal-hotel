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

## 1. An outline of the continents map

The roughest contours of what the continents quest's map will look like, drawn inside its panel,
the way the states panel already draws its own. An outline is not a map yet: nothing in it is
selectable, focusable, hoverable or filled by progress, and it does not have to look good. The
pipeline exists — `npm run outline:build`, its arithmetic in `scripts/outline.mjs`, and an
`outline` on each quest that the panel renders when it is not null — so this item is mostly data.

**DoD:**

- Natural Earth's 1:110m land and admin-0 data, which is public domain, cited in the generated
  file's header the way `states.outline.ts` cites the Census.
- Equal Earth projection, chosen once here for both world outlines so they read as one atlas, and
  equal-area so Africa is not drawn smaller than Greenland.
- Seven paths keyed by `CONTINENTS` id, Antarctica included. There is no authoritative boundary set
  for the seven-continent model, so the shapes are Natural Earth's countries dissolved by its
  continent field, and the transcontinental countries (Russia, Türkiye, Egypt, Kazakhstan) are each
  drawn wholly on one side. That compromise is written beside the data: it is a drawing choice, and
  `places.data.ts` is right that progress is never derived from countries.
- The same fill, stroke, labelling, no-focus and size-ceiling rules `states.outline.spec.ts` and
  the panel spec hold the states outline to.

Effort: a couple of hours.

## 2. An outline of the countries map

The 195, at the same rough fidelity and in the continents outline's projection.

**DoD:**

- Natural Earth's 1:110m admin-0 shapes, joined on the ISO alpha-2 code `places.data.ts` already
  chose for that reason.
- One path per `COUNTRIES` id that has a shape at this scale. 1:110m drops the smallest states (the
  Holy See, Monaco and many island nations among them), so the spec holds the list of ids with no
  path, and fails if that list grows or if a path carries an id outside the 195. The outline does
  not claim to draw what it cannot.
- Shapes Natural Earth carries that are not among the 195 — Antarctica, Greenland, Western Sahara,
  Taiwan and the rest — are drawn unkeyed, so the coastline is whole without the count changing.
  `IOutlineShape` requires an id today, so this is where it learns to go without one.
- The same fill, stroke, labelling, no-focus and size-ceiling rules as the other two outlines.

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
