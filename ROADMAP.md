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

One graphical item for the travel quests' maps. Its complaint: a place the guest has marked that
they cannot see. The page's house rules bind it: Fern's tokens and one accent for controls, the quest palettes in `wanderquest.css` for
places and never for controls, no glow, and no motion that does not show a change of state. Any
colour a change introduces is measured, not picked by eye; `wanderquest.spec.ts` recomputes the
palette contrasts from the CSS, so a new pairing goes into that spec too. `e2e/a11y.spec.ts` runs
axe over `/wanderquest` and has to stay green.

Two things any item here will trip over. The `*.outline.ts` files are generated: edit
`scripts/build-outline.mjs` and re-run `npm run outline:build`, which needs the network and runs by
hand, and keep each outline under the size ceiling `outline.spec.ts` holds it to. And any change to
what the page draws fails `e2e/project-frames.spec.ts` until `npm run frames:capture` is re-run;
that is the gate working.

### 1. The Caribbean gets an inset, as Europe did

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
