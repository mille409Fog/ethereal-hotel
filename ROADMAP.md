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

Items 1 to 3 begin `/wanderquest`, a simulation of three travel quests: the 50 states (with DC
and the five inhabited territories as an unrequired bonus), the seven continents, and the 195
countries the UN lists as members or observers. The lists and their reasoning already live in
`src/app/wanderquest/places.data.ts`, and the owner's progress in `progress.data.ts`. These items
are visual only: where a guest's progress is stored is deliberately not decided yet, and nothing
here should write to the browser or the backend. They go in order — a selector that works, then
one that looks right, then a palette that gives each view its own identity.

## 1. A button selector for the quest view

The route needs one control before it needs a map: which of the three quests is on screen. Start
plain, and get the semantics right while there is nothing to get in the way.

**DoD:**

- Three buttons — states, continents, countries — choose the view, and exactly one is selected
  at a time. The bonus category belongs to the states view, not a fourth button.
- The pattern is a named one and fully implemented: WAI-ARIA tabs (`tablist`/`tab`/`tabpanel`,
  arrow keys move between tabs, Home/End jump to the ends) or toggle buttons with `aria-pressed`.
  Whichever it is, the spec tests the keyboard behaviour, not only the click.
- Each panel shows its quest's real count from `places.data.ts` (50, 7, 195) and the owner's
  progress against it from `progress.data.ts`, even while both read 0. No figure is typed into
  the template.
- `/wanderquest` is added to the route list in `e2e/a11y.spec.ts` and passes axe.
- The current view is a signal; nothing is persisted.

Effort: an afternoon.

## 2. A selector that looks deliberate

Once the selector works, make it look like it belongs on the site. The house rules apply in full
here, because this is interface rather than spectacle: no glow, one accent ("Fern"), no decorative
motion, and a focus ring that is an outline.

**DoD:**

- The selector uses only existing tokens from `styles.css`. It adds no new accent colour, and
  `check:docs` passes without a new exemption.
- The selected state is distinguishable without colour: a weight, underline, fill or border
  change that survives greyscale and Windows High Contrast (`forced-colors: active`).
- Any transition between states is short, plays once per change, and is removed under
  `prefers-reduced-motion`. Nothing loops.
- It reads correctly at 320px wide with no horizontal scroll, and the touch targets are at least
  44×44 CSS px.
- The owner signs off on how it looks. This item has no other measure of done, so that one is
  stated.

Effort: an afternoon, plus iteration.

## 3. A palette per quest view

Each quest gets a small palette of its own: at minimum unvisited, visited and a highlight, plus a
colour for the states view's bonus category. These are data colours, the way the dashboard's chart
colours are, not a second interface accent. The selector and the page's own controls stay Fern.

**DoD:**

- Three palettes are defined as CSS custom properties in six-digit hex (the charts' convention,
  so a canvas or SVG map can read them at runtime), with their derivation written above them the
  way `styles.css` writes Fern's — computed in OKLCH, as `/aesthetic` does, rather than picked by
  eye.
- Each palette's visited colour has at least 3:1 contrast against the page background and against
  its own unvisited colour (WCAG 1.4.11, non-text contrast). A unit test computes these ratios from
  the token values, so a later tweak cannot quietly fail them.
- The three palettes stay distinguishable under deuteranopia and protanopia simulation, and the
  views never rely on colour alone to show visited against unvisited.
- The selected quest's palette is applied to the panel, and switching views switches it, so the
  palette shows on screen before there is a map to fill.
- Nothing outside `src/app/wanderquest/` reads these tokens.

Effort: a day, most of it choosing.

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
