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

## 1. Buy the domain

**Effort:** S · **Why:** `ethereal-hotel-pink.vercel.app` reads as a scratch deploy. A name you
own reads as a thing you maintain. This is an hour and it changes how every other item is
received.

**DoD:**

- [ ] Custom domain live on the Vercel project, HTTPS, apex and `www` both resolving with one
      redirecting to the other.
- [ ] `og:url`, canonical, and any absolute URLs in the README updated.
- [ ] `README.md`, resume, and GitHub profile point at the new domain.

## 2. Show the WebSocket, do not assert it

**Effort:** S · **Why:** The serverless/container split is the most interesting decision in the
repo and the live site cannot demonstrate half of it. The `/ws` path exists, is tested
(`test_websocket.py`), and is invisible to anyone who does not read Python.

**Needs item 4 first** — that one gets the container running and verified; this one only has to
point a camera at it.

**DoD:**

- [ ] A short screen recording (or animated WebP under 2MB) of the container deployment pushing
      live updates, committed to `docs/images/` and embedded in the README beside the polling
      explanation.
- [ ] The dashboard's connection badge is captured in both states, so the degradation is legible
      as a designed behaviour rather than a bug.

## 3. One resume, one source

**Effort:** M · **Why:** A site and a PDF that drift apart is a small, visible correctness bug in
the artifact whose entire job is being correct. Generating one from the other is a legitimately
nice piece of engineering and costs less than maintaining both.

**DoD:**

- [ ] Resume content lives in one typed structure (JSON or TS) consumed by the site.
- [ ] A script renders that structure to a PDF (print stylesheet + headless Chromium via the
      Playwright already installed — do not add a PDF dependency).
- [ ] `npm run resume:pdf` produces the file; CI regenerates it and fails if the committed PDF is
      stale.
- [ ] The PDF is genuinely presentable at A4 and US Letter, and text is selectable.

## 4. Run the container path, do not just document it

**Effort:** S, once Docker is installed — which is the actual cost here. **Why:** Item 6 required
that every code block in the docs had been executed. Every one was, except the `docker build` /
`docker run` pair in `ARCHITECTURE.md` §Container, which could not be: there is no Docker on the
development box. That leaves it the only instruction in the repo nobody has ever followed, and it
is the wrong one to leave unverified — the container is the half of the serverless/container split
the live demo cannot show, which makes it exactly the half a curious reviewer will try to run.

**DoD:**

- [ ] Both commands in `ARCHITECTURE.md` §Container execute as written from a clean clone. If they
      don't, fix the document — the point is the instructions, not getting a container up by hand.
- [ ] The running container answers `GET /api/health` with `liveStream: true` and `/ws` present in
      `endpoints`, which is what ARCHITECTURE's comparison table claims separates the two targets.
      The serverless side of that table is already verified against the live demo.
- [ ] A client actually receives a frame on `/ws` — point the dashboard at it by setting `wsUrl` in
      `environment.prod.ts`, so "pushed every 2s" is observed rather than inferred from
      `test_websocket.py`.
- [ ] `backend/docker-compose.yml` is either exercised or deleted. It is committed and listed in
      ARCHITECTURE's project tree, but no CI job, gate or verified instruction touches it — so it
      is either a second supported way in, or it is decoration.

Deliberately **before item 2** despite the higher number: 2 wants a screen recording of the
container pushing live updates, and recording something that has never been run is how a short task
turns into a debugging session. Do this first and 2 is just the capture.

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
