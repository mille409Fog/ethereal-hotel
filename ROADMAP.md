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
- **The first visual pass finished; this list is the second.** The first brought the interface back
  in line with rules `CLAUDE.md` already states (no decorative motion, no glow, one accent, state
  colours are not decoration) without adding an effect, and neither may an item here. Its one
  lasting rule still applies: an item that changes `/dashboard`, `/booking`, `/gallery` or a project
  card changes a committed frame in `public/projects/`, so `npm run e2e` fails until
  `npm run frames:capture` is re-run and the new `.webp` files are committed. That is part of the
  item's DoD, not a separate step.
- These items come from photographing the routes at 1440px and 390px, with production supplying the
  real API. Figures quoted below were measured on 2026-11-06. A local build has no API, so anything
  about live data has to be checked against production or a stubbed backend.

## Items

### 1. Shorten the dashboard on phones

**Effort:** small. **Why:** at 390px the six metric cards stack in one column and the page is about
3,000px tall, so the charts start well below where most visitors stop. The desktop layout already
ranks two figures above the other four, and the phone layout could say the same thing.

**DoD:**

- At 390px occupancy and revenue stay full width and the other four sit two across, with no truncated
  value or label at 320px.
- The DOM order, reading order and throttled `role="status"` digest are unchanged.
- The charts begin at least one screen higher than they do today.

### 2. Keep the painting beside the words on `/gallery`

**Effort:** small. **Why:** on desktop the label runs far longer than the painting, leaving roughly
700px of empty column under the picture while the visitor reads about details they can no longer
see. "Up close" asks you to look at the boats while the boats have scrolled away.

**DoD:**

- From the two-column breakpoint up, the painting and its credit stay in view while the label
  scrolls, using `position: sticky` and no scripted motion.
- A painting taller than the viewport is still fully viewable.
- At one column the layout is unchanged, and `prefers-reduced-motion` needs nothing special because
  nothing animates.
- Frames re-captured if the Gallery frame moved.

### 3. Remove the glow around the Gallery's panel

**Effort:** small. **Why:** `CLAUDE.md` says no glow, and the check behind it only reads
`text-shadow`, so a `box-shadow` halo gets through. Two things on `/gallery` use one, and they are not
the same case. The orbs' colour is the choice being offered, so it is content and stays. The halo
around the hung painting's panel (`0 0 80px` of `--room-accent`) is interface chrome: the panel's
tint already carries the colour.

**DoD:**

- The panel's coloured halo and its `box-shadow` transition are gone. Its tint stays, as do the
  painting's dark drop shadows, which are depth rather than glow.
- The orbs stay as they are, with a comment saying why they are content.
- `check:docs` fails on a coloured zero-offset `box-shadow` in `src/app/` and `styles.css`, with the
  orbs and `/aesthetic` named as exemptions and the reason beside each. `/aesthetic`'s glow shows
  state, so it is not part of this item.
- `CLAUDE.md`'s no-glow rule states the new check and its exemptions, and frames are re-captured.

### 4. Tighten the Wanderquest layout

**Effort:** small. **Why:** the legend explains the map but sits below all six bonus tiles, a long
way from it. The tiles stack two across and three down, which pushes the checklist further away, when
a single row would fit at desktop width.

**DoD:**

- The legend sits directly under the map, on all three tabs.
- At desktop width the six bonus tiles share one row. They wrap as needed on narrower screens.
- The tile-scale note stays attached to the tiles.
- Checkbox rows are at least 44px tall at phone width, the map's existing interactions are unchanged,
  and frames are re-captured.

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
