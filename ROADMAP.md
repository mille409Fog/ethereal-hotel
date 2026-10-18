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

## 1. CI triage agent (`triage/`)

An agent that explains why this repository's own CI failed. It is a separate tree under
`triage/`, beside the site rather than in it, the way `/aubade` is.
[`triage/docs/PROJECT_BRIEF.md`](triage/docs/PROJECT_BRIEF.md) is its spec and
[`triage/docs/ARCHITECTURE.md`](triage/docs/ARCHITECTURE.md) says which parts exist. It
is built in stages, each ending with the maintainer's sign-off: baseline, single LLM
calls, agent loop, durability, guardrails, evaluation, observability, deployment.

**The constraint every stage assumes:** it costs $0 beyond the existing Claude Pro
subscription. Model access is `claude -p`, never the API, and every `claude` process
passes the billing guard first (ADR 0004 in `triage/docs/decisions/`).

**DoD:**

- On the held-out set, category accuracy is ≥ 85% and the suggested fix names a file
  the real fix touched in ≥ 60% of cases. Both beat the rule-based baseline, by margins
  stated in `triage/docs/`.
- A failure in Actions produces a triage record on the run within 2 minutes.
- Nothing is published outside the run without human approval.
- No path can bill anything beyond the subscription.

Effort: weeks, in stages.

Items 2–3 came from comparing the home page with the portfolios engineers themselves cite
(Brittany Chiang, Lee Robinson, Emil Kowalski, Rauno Freiberg, Sam Rose, Julia Evans, Josh
Comeau, Bruno Simon). What they share: one specific claim on the first screen, evidence over
assertion, writing as the proof of judgment, the most distinctive work first, restraint, and one
human line. The repo already does the hard part; the home page does not show it.

## 2. A hero that makes one checkable claim

`hero.html` says "scalable, high-performance… Let's build something exceptional together" — the
copy every portfolio above avoids, on a site whose bar is that every claim is executable. The
repo's actual idea (every number on screen is derived from real rows; when the app can't do
something it says so) is a better first sentence than any adjective. Same family:
`experience.html`'s "serve millions of users" is the one claim on the page with nothing behind it.

**DoD:**

- The hero's first sentence is specific enough to disagree with, and nothing in it is an
  adjective the reader has to take on trust.
- "Let's build something exceptional together" and "serve millions of users" are gone, or the
  second is replaced by a figure the owner can source.
- No other section description on `/` makes a claim the page cannot back.

Effort: an hour of writing, minutes of code.

## 3. A writing section

Six of the eight portfolios above have one, usually ranked above projects. The owner writes long
form, and the repo already holds finished essays in its comments and docs: comparing the résumé
PDF by text rather than bytes, a docs file that fails the build when it lies, a 1.5s frame as a
canary for a shader regression. The case studies are writing too, and sit one click away.

**DoD:**

- A `/writing` route with at least two posts, each about a decision made in this repository, each
  linking to the code it describes.
- The route is registered everywhere a route has to be (router, `vercel.json`,
  `emit-route-meta.mjs`) so a shared post gets its own card.
- The home page lists the posts, and the case studies, in one writing block.
- No post explains what a tool _is_ — same rule as the docs.

Effort: days, nearly all of it writing.

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
