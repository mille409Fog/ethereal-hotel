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
- **The items below are a visual pass, not new features.** Each one brings the interface back in
  line with rules `CLAUDE.md` already states (no decorative motion, no glow, one accent, state
  colours are not decoration). None of them adds an effect. Any item that changes `/dashboard`,
  `/booking`, `/gallery` or a project card changes a committed frame in `public/projects/`, so
  `npm run e2e` fails until `npm run frames:capture` is re-run and the new `.webp` files are
  committed. That is part of each item's DoD, not a separate step.

## Items

### 1. Make the three NDA cards read as deliberate, not as missing images

**Effort:** small. **Why:** the last row of project cards says "No screenshot. The case study shows
the reasoning." three times in a row. One of those reads as an honest note; three in a row read as
broken images.

**DoD:**

- Each NDA card's plate carries its own line: the constraint or the decision its case study is
  about, taken from `/work` and stated just as plainly. It stays type on the ground, in the existing
  `.room-plate` style. No illustrations or stock images, because the plate exists so as not to
  pretend.
- The text comes from the case-study data rather than a second copy in the card, so the two
  cannot drift. If the data has no field for it, add one there.
- The footnote under the grid still explains why there are no screenshots.

### 2. Small consistency fixes: contact headings, booking errors, a stale header

**Effort:** small. Three unrelated fixes, batched because each is too small to stand on its own.

**DoD:**

- **Contact headings** ("Contact Information", "Links", "Education" …) are in `--color-text`, not
  the accent. Today they are the same blue as the links under them, so headings and links can't be
  told apart.
- **The booking rejection is styled as two different things.** On a field-attributed server error,
  the message appears under the field and again beside the submit button (`booking.ts`,
  `setOutcome`). Both are wanted: one is attached to the field, the other is the outcome of the
  submit. But they currently look identical, so it reads as a bug. The outcome line gets a
  distinct treatment (for example a bordered `--color-negative` callout with the field error kept
  inline), or, when the error is attributed to a field, it says which field rather than repeating
  the message. Whichever is chosen, the ARIA wiring stays the same and the e2e booking assertions
  stay green.
- **`projects.css` opens with "Booking Engine Styles"** and carries `.form-control` and
  `.form-row` rules the project cards never use. Correct the header and move or delete the dead
  rules.
- Frames re-captured if `/booking` changed.

### 3. Rework the hero's composition

**Effort:** medium. **Why:** the first screen is left-aligned text with the right ~40% of a desktop
viewport empty, and three buttons of equal weight. It is the weakest screen on the site and the one
every visitor sees.

**DoD:** pick one of the two directions below and record the choice and the reason in a comment
above the hero markup.

- **(a) Show the claim on the first screen.** Fill the empty column with a small read-only digest
  from the same API as `/dashboard` (occupancy, the latest booking), linking to the full route. It
  must degrade the way the dashboard does: when the API is down it says so, and it never shows a
  fixture number as if it were live. It must not cost `/` its Lighthouse scores (performance 90,
  accessibility 100): no Chart.js on `/`, and the request must not block first paint.
- **(b) Recompose as a single column.** A reading-width single column with more vertical space,
  one primary call to action, and the other two as text links.
- Either way: no motion, no illustration, no glow, and the hero still works before hydration (plain
  `href`s, as the current comment explains).

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
