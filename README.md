# EtherealHotel

[![Code Quality](https://github.com/mille409Fog/ethereal-hotel/actions/workflows/code-quality.yml/badge.svg)](https://github.com/mille409Fog/ethereal-hotel/actions/workflows/code-quality.yml)
[![Supply chain](https://github.com/mille409Fog/ethereal-hotel/actions/workflows/supply-chain.yml/badge.svg)](https://github.com/mille409Fog/ethereal-hotel/actions/workflows/supply-chain.yml)

**Live demo: https://ethereal-hotel-pink.vercel.app/**

A hotel operations dashboard, Angular 22 and FastAPI, deployed as one Vercel project. Every
figure on screen — occupancy, ADR, RevPAR, revenue — is derived from real booking rows in a
SQLite database. Two routes carry the argument: `/dashboard` reads, `/booking` writes.

![The hotel operations dashboard: occupancy, ADR, RevPAR, room revenue, arrivals/departures and rooms available](docs/images/dashboard.png)

*Captured before the API was deployed, so it shows the third badge state: the backend is
unreachable and the page says so rather than pretending. The live demo reads "polled from the
API".*

![The booking form with a check-out date the server rejected: the message "check_out must be after check_in" is rendered under the check-out input, which is outlined and marked aria-invalid, while the booking created a moment earlier appears in the list below](docs/images/booking-validation-error.png)

## Run it

```bash
npm install && npm start          # Angular on :4200
npm run start:backend             # FastAPI on :8000
```

The dashboard works without the backend — it falls back to a committed snapshot and labels
itself "simulated data". Full setup, including the Python virtualenv, is in
[CONTRIBUTING.md](CONTRIBUTING.md).

## Three decisions worth arguing about

**The app tells you which data you are looking at, instead of hiding the difference.** The
dashboard takes metrics from a WebSocket, or from polling, or from a committed fixture, and the
badge in the header names which of the three is live. The hosted demo is a serverless function
and cannot hold a socket open, so it polls and says "polled" — the stream is a real feature that
belongs to the container deployment, not a claim the demo makes and cannot keep. `/booking`
deliberately has *no* fixture fallback: a form whose entire claim is that it writes a durable
row cannot honestly fake one.
→ [Transport and degradation](ARCHITECTURE.md#transport-and-degradation)

**The booking rule exists once, on the server, and its error knows which field it belongs to.**
Check-out must be at least one night after check-in. That rule lives in
`backend/services/bookings.py` and has no counterpart in the browser, so the message in the
screenshot above is a real 422 — rendered under the input that caused it because the error
carries the field name on the wire. A second implementation in TypeScript would have rendered
faster and been one refactor away from disagreeing with the server.
→ [How a rejected booking comes back](ARCHITECTURE.md#how-a-rejected-booking-comes-back)

**One `create_app()` builds both deployments, and they run different Python versions on
purpose.** The serverless demo and the container differ by a single `live_stream` flag rather
than a fork. Vercel's runtime offers no 3.11, so the function runs 3.12 while the container and
the linters target 3.11 — the CI matrix runs both rather than assuming the gap is harmless, and
`test_dependency_pins.py` fails if the two dependency lists drift.
→ [Deployment](ARCHITECTURE.md#deployment)

## Gates

Four commands, all of them CI jobs: `npm run code-quality`, `npm test`, `npm run code-quality:py`,
`npm run test:backend`. Plus Playwright and axe (`npm run e2e`), dependency audits over both
languages, and `npm run check:docs`, which fails when the docs stop matching the repo.
[CONTRIBUTING.md](CONTRIBUTING.md) has the commands; accessibility is a build gate and the
reasoning behind the two non-obvious choices is in
[Accessibility](ARCHITECTURE.md#accessibility).

Performance and accessibility are budgets rather than aspirations. `npm run lighthouse` audits the
production build on `/` and `/dashboard` — the desktop profile, three runs, asserted against the
median — and the build **fails** below **performance 90**, **accessibility 100** and
**best practices 95**. Size has a ceiling in the same spirit: `angular.json` caps the
**initial payload at 15 kB** and **all scripts at 650 kB**, set just above what the build produces
today so the next regression trips it rather than being absorbed. `npm run check:docs` fails if
these numbers and the configs that enforce them ever disagree.

## More

- [ARCHITECTURE.md](ARCHITECTURE.md) — transports, the API surface, deployment, configuration
- [backend/README.md](backend/README.md) — schema, seeding, streaming internals, Alembic
- [CONTRIBUTING.md](CONTRIBUTING.md) — setup and the gates
- [docs/analytics.md](docs/analytics.md) — what the site measures, and why there is no cookie banner

[MIT](LICENSE) © Jacob Miller
