# EtherealHotel — Improvement Roadmap

Work these in order. Each item has a **Definition of Done (DoD)** so a separate instance can
implement it and this instance can verify it. Effort is a rough estimate.

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

---

## The state of things, honestly

The infrastructure is finished and the content is not. Everything below assumes that diagnosis:

- `/dashboard` is real. It reads a real API backed by a real database, degrades to polling when
  the deployment has no process for a WebSocket, and falls back to a fixture when the API is down.
  That one route is the whole technical argument.
- ~~`booking`, `crm`, and `concierge` are **static markup with no behaviour**.~~ Done, and the
  premise was already stale when it was written: `src/app/booking/` had stopped being a booking
  form and become the Projects section, so there was no dead form to wire — there was a missing
  one. Item 1 renamed that component to `Projects` (matching the section id it actually renders)
  and built the real booking demo on its own route, `/booking`, the way `/dashboard` is built.
  `crm` and `concierge` were the same stale premise a second time — see item 2, now done.
- ~~The proprietary work is represented by gestures. That is the single biggest gap between this
  site and a site that gets a callback.~~ Done — see item 3. `/work` carries three case studies,
  and the five project cards that used to make the gestures now link into them.

Items 1–3 are the ones that change outcomes. Items 4–11 are polish, ordered by how much of it
survives contact with a hiring manager who spends ninety seconds on the page.

## 4. Make the link worth pasting

**Effort:** S · **Why:** This URL's most common first impression is a preview card in Slack,
LinkedIn, or iMessage — rendered before anyone decides whether to click. Right now that card is
almost certainly a bare URL and a blank rectangle, which is a wasted first impression on the
exact audience the site is for.

**DoD:**

- [ ] `og:title`, `og:description`, `og:image` (1200×630), `twitter:card=summary_large_image`,
      canonical URL, and a real `<meta name="description">` in `src/index.html`.
- [ ] The OG image is the site's own aesthetic — not a screenshot of a browser window, not a
      stock gradient. Committed under `public/`, under 300KB.
- [ ] A favicon set that survives a dark browser chrome (`.ico`, 180px apple-touch, SVG if you
      have one).
- [ ] Verified rendered: paste the URL into Slack and into LinkedIn's Post Inspector, screenshot
      both, attach to the PR. Metadata that is merely _present_ is not the DoD; metadata that
      _renders_ is.
- [ ] `/dashboard` gets its own title and description, since it is the link worth sharing on its
      own.

## 5. Buy the domain

**Effort:** S · **Why:** `ethereal-hotel-pink.vercel.app` reads as a scratch deploy. A name you
own reads as a thing you maintain. This is an hour and it changes how every other item is
received.

**DoD:**

- [ ] Custom domain live on the Vercel project, HTTPS, apex and `www` both resolving with one
      redirecting to the other.
- [ ] `og:url`, canonical, and any absolute URLs in the README updated.
- [ ] `README.md`, resume, and GitHub profile point at the new domain.

## 6. Cut the README to one page

**Effort:** M · **Why:** `README.md` is 25KB and `ARCHITECTURE.md` is 23KB, for a project with
one real route. The volume argues the opposite of what it intends: thoroughness at this ratio
reads as inability to prioritise, and nothing that long is read at all. The good material —
the deployment tradeoff, the Python version gap, the fixture fallback — is currently buried under
installation boilerplate and a list of what Chart.js is.

**DoD:**

- [ ] `README.md` fits on one screen plus a scroll: what it is, the live link, how to run it, and
      the three decisions worth arguing about, each linked into `ARCHITECTURE.md`.
- [ ] Sections explaining what FastAPI/RxJS/Pydantic/WebSockets _are_ are deleted. The reader
      knows. Explaining them signals you assume they do not.
- [ ] `ARCHITECTURE.md`'s "Future Enhancements" checkbox list is deleted outright — a generic
      unchecked wishlist (Kubernetes, multi-tenant, mobile app) is the clearest tutorial tell in
      the repo, and this ROADMAP is where real intentions live.
- [ ] Every remaining code block in both files has been executed and works as written.
- [ ] The emoji-per-heading convention is applied consistently or dropped entirely. Either is
      fine; the mix is what looks unconsidered.

## 7. A performance and accessibility budget that fails the build

**Effort:** M · **Why:** The a11y work is already done and already good — the reasoning in
`styles.css` about focus-ring contrast and the reduced-motion block is the kind of comment that
gets someone hired. It is currently protected by one axe scan and nothing else, which means the
next change quietly regresses it and no one finds out.

**DoD:**

- [ ] Lighthouse CI in `.github/workflows/`, asserting against the built site: performance ≥ 90,
      accessibility = 100, best-practices ≥ 95 on both `/` and `/dashboard`.
- [ ] Thresholds are committed as config, and the job **fails** below them — not a warning, not
      an artifact nobody opens.
- [ ] A bundle-size ceiling in `angular.json` budgets, set just above current actual size so the
      next regression trips it.
- [ ] The README's one-page version states the numbers the site holds itself to.

## 8. Show the WebSocket, do not assert it

**Effort:** S · **Why:** The serverless/container split is the most interesting decision in the
repo and the live site cannot demonstrate half of it. The `/ws` path exists, is tested
(`test_websocket.py`), and is invisible to anyone who does not read Python.

**DoD:**

- [ ] A short screen recording (or animated WebP under 2MB) of the container deployment pushing
      live updates, committed to `docs/images/` and embedded in the README beside the polling
      explanation.
- [ ] `docker compose up` in `backend/` reaches a working stream from a clean clone — verified by
      following your own instructions on a fresh checkout, not from memory.
- [ ] The dashboard's connection badge is captured in both states, so the degradation is legible
      as a designed behaviour rather than a bug.

## 9. One resume, one source

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

## 10. Know whether anyone visited

**Effort:** S · **Why:** Applications go out and nothing comes back; knowing that a link was
opened, from where, and for how long is the difference between iterating and guessing.

**DoD:**

- [ ] Privacy-respecting analytics (Vercel Analytics or Plausible), no cookie banner required, no
      third-party ad network.
- [ ] Custom events for the three things worth knowing: `/dashboard` reached, case study read to
      the end, resume PDF downloaded.
- [ ] A `docs/` note on what is collected and what is not — the same instinct as the a11y
      comments, applied to data.

## 11. Keep the supply chain honest

**Effort:** S · **Why:** The repo already runs strict mypy, `--max-warnings 0`, a pin-drift test,
and commit linting. Dependency freshness is the one gate not automated, and a portfolio repo with
stale advisories undercuts every other quality claim on the page.

**DoD:**

- [ ] Dependabot (or Renovate) configured for npm, pip, and GitHub Actions, grouped so it does not
      open twenty PRs a week.
- [ ] CodeQL on push to `main` and on PRs.
- [ ] `npm audit --audit-level=high` and `pip-audit` run in CI and fail the build.
- [ ] Any finding at the time of merge is fixed or has a dated, reasoned exception in the workflow
      file. An open advisory with no note is worse than no scanner.

---

## Deliberately not doing

Recorded so the next instance does not helpfully add them:

- **Auth/JWT.** Nothing here is worth protecting. A login wall on a portfolio demo costs the
  reviewer a click and teaches them nothing.
- **Kubernetes, Prometheus, multi-tenancy.** Infrastructure with no load behind it is cosplay.
  The Dockerfile plus the serverless function already show the deployment reasoning.
- **A fourth and fifth CRUD screen.** See item 2. Breadth here reads as padding.
- **Rewriting the frontend in another framework.** The Angular is fine and the time is better
  spent on `AUBADE.md`.

See **[AUBADE.md](AUBADE.md)** for the separate, deliberately un-boring project — this file is
about making the competent thing credible; that one is about making something nobody else has.
