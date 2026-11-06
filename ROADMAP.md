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

### 1. Make the charts belong to the site

**Effort:** small–medium. **Why:** the rest of `/dashboard` is designed and the charts are Chart.js
defaults, so they are what makes the route look like a template. They use the library's default sans
rather than Source Sans, the line chart's legend repeats its title, revenue axis labels have no `$`,
and the gridlines are dense enough to compete with the data.

**DoD:**

- Chart text uses the site's body face. The font must be loaded before the first draw, because a
  canvas will not re-render when it arrives later.
- The single-series legend is gone, and money reads as money on the axis.
- Gridlines are reduced until the data is the strongest thing in the plot. Colours keep coming from
  the tokens at runtime.
- The doughnut's centre carries the occupancy figure, drawn from the same value as the metric card
  so the two can't disagree. `roomMixChartLabel` and the other canvas labels remain accurate.
- Frames re-captured.

### 2. Fix the navigation at phone width

**Effort:** small. **Why:** at 390px "Jacob Miller" wraps to two lines and crowds "Home". At 320px
the page scrolls sideways, because the nav needs 360px. The links are 20px tall, which is a small
tap target for the main way around the home page. `navigation.css` has no media query at all.

**DoD:**

- From 320px to 430px the brand stays on one line and nothing overlaps or wraps untidily.
- `document.documentElement.scrollWidth` equals the viewport width at 320px, asserted by an e2e test
  on `/`.
- Every nav link is at least 44px tall at phone width, including its padding.
- No menu icon or animated drawer, unless the four links genuinely cannot fit at 320px, in which
  case the item records why.

### 3. Give the demo routes a way back

**Effort:** small–medium. **Why:** visitors reach the demos from the project cards, and then the
site stops. `/dashboard`, `/booking`, `/aesthetic`, `/wanderquest` and `/murmuration` have no link
back at all. `/work` and `/gallery` have one, at the bottom of a long page.

**DoD:**

- Those seven routes reach the home page from the first screen, without scrolling, through one
  shared component rather than seven copies.
- It keeps the `/`, `/dashboard` and `/gallery` Lighthouse thresholds and passes the e2e axe run.
- `/murmuration` gets the smallest version that works, and its canvas stays uninterrupted.
- `/aubade` and `/aubade/reader` are untouched: that work shares nothing with this one.
- Bottom-of-page back links are removed if they have become redundant, and frames are re-captured.

### 4. Give an unknown URL a page

**Effort:** small. **Why:** `app.routes.ts` has no wildcard, so a mistyped address shows a completely
blank screen on production and rewrites the URL to `/` without showing the home page. For a site sent
to reviewers, a truncated link in a message is an ordinary way to arrive.

**DoD:**

- An unmatched path renders a page saying it doesn't exist, in the site's type and tokens, with a
  link home and the URL left as typed.
- The blank page's cause is understood first, in case it reaches beyond the missing wildcard.
- An e2e test covers it, including an axe pass.
- `scripts/emit-route-meta.mjs` does not stamp a static file for the wildcard. If the response stays
  HTTP 200 because of the SPA rewrite, a comment says so rather than implying a real 404.

### 5. Make the project cards read as one set, and describe them truthfully

**Effort:** small. **Why:** the grid is what most visitors judge, and it has three visible seams.
Buttons don't share a baseline across a row (their bottoms sit at 1581/1581/1638px and
2132/2099/2099px at 1440px). Two cards use lowercase titles, copy and labels ("start the quests")
beside title case on the rest. And the section intro calls them "enterprise applications I've
architected and delivered" at scale, above six personal demos, which is the kind of claim this repo
exists to avoid.

**DoD:**

- In any row, every button's bottom edge is at the same height, using flex or grid rather than fixed
  heights.
- All nine cards use one convention for titles, descriptions and button labels. If `wanderquest` and
  `murmuration` stay lowercase as names, their descriptions and labels still follow it.
- The intro describes what is actually in the grid: demos built here, and work under NDA.
- `npm run resume:check` still passes, and frames are re-captured.

### 6. Stop the booking table hiding its columns on phones

**Effort:** small. **Why:** at 390px the table is 625px wide inside a 308px scroller, so check-out,
guests, rate and status are out of view with nothing to suggest they exist. `status` is the column
that shows a booking was really written and cancelled.

**DoD:**

- At 390px every column's information is reachable, and it is obvious that it is. Either rows
  reflow into stacked records or the scroll is clearly signalled. Stacked records are preferred, as
  long as the table stays a real table to assistive technology.
- At 1440px the table is unchanged.
- The e2e booking assertions and axe run stay green, and frames are re-captured if the desktop frame
  moved.

### 7. Shorten the dashboard on phones

**Effort:** small. **Why:** at 390px the six metric cards stack in one column and the page is about
3,000px tall, so the charts start well below where most visitors stop. The desktop layout already
ranks two figures above the other four, and the phone layout could say the same thing.

**DoD:**

- At 390px occupancy and revenue stay full width and the other four sit two across, with no truncated
  value or label at 320px.
- The DOM order, reading order and throttled `role="status"` digest are unchanged.
- The charts begin at least one screen higher than they do today.

### 8. Keep the painting beside the words on `/gallery`

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

### 9. Remove the glow around the Gallery's panel

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

### 10. Tighten the Wanderquest layout

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
