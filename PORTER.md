# PORTER — the hotel's messages to other machines, delivered and accounted for

A third route that is part of the technical argument, beside `/dashboard` (reads) and
`/booking` (writes): `/porter`, the **deliveries**. When a booking is made or cancelled, the hotel
tells another machine, and it does that the way a payment processor or a channel manager would.
The event is recorded in the same transaction as the write, signed, delivered at least once and
retried on a schedule. A duplicate does no harm, and a delivery that keeps failing goes to a
dead-letter queue instead of disappearing. The route is the ledger: every attempt, its status
code, its latency and the next retry time, read from real rows.

This is the whole plan: what the piece is, the decisions already taken and why, and the phases,
each with a Definition of Done so that one instance can build a phase and another can verify it.
Nothing has landed.

**Phases are deleted as they land and the rest renumbered from 0**, as `ROADMAP.md` does. The
reasoning that survives a finished phase moves into the header of the file it describes. So a
phase number is a position in a queue; never cite one from outside this file.

## The piece

A visitor makes a booking on `/booking`. The confirmation now carries one more line, _Event
`evt_…` queued for delivery_, and a link. On `/porter` that event is the top row of the ledger.
Its first attempt went out within a second and was refused with a `503`. The visitor can see
why: the receiver refuses the first attempt of every event on purpose, and the row says so. The
second attempt, after the backoff the row predicted, was accepted with a `200` in 38 ms. Under
the row is the exact HTTP request that was sent: headers, body and the Ed25519 signature. Next to
it is a `curl` command that replays it against the receiver, and the response the receiver gives
a replay: `409`, already seen, or `400`, timestamp outside tolerance.

The visitor checks the signature with `openssl` against a public key the site publishes, without
trusting anything the page says. That is the point of the route: **every guarantee on screen can
be checked from a terminal.**

### What is real, and the one thing that is not

The events, the attempts, the signatures, the status codes and the latencies are real. They are
rows written by real HTTP requests between two real endpoints. The ledger renders those rows and
derives every number from them, as the dashboard does.

**The receiver's first refusal is injected, and the piece says so wherever it shows.** A
receiver that never fails would make the retry machinery dead code on screen. A receiver that
fails at random would be a simulation, and a visitor could not tell it from a real fault. So the
fault is deterministic: the first attempt of each event gets a `503` carrying the header
`Porter-Injected: first-attempt`. The ledger renders that header as words ("refused on purpose,
so you can watch a retry"). Every other outcome is the network's and the code's own.

### Three states, said on screen

The dashboard tells a visitor which transport their numbers came from. This route does the same
for its courier, in one line of ordinary text above the ledger:

| State      | When                                                    | What drives delivery                                          |
| ---------- | ------------------------------------------------------- | ------------------------------------------------------------- |
| `worker`   | The container stack (`backend/Dockerfile`)              | A long-lived worker drains the outbox every second            |
| `on-call`  | Vercel, with a shared database configured               | Due deliveries are drained by the next request to any `/api/` |
| `isolated` | Vercel with no shared database, or the fixture fallback | Nothing outlives the instance, and the line says so           |

`on-call` is the honest name for what a serverless deployment can do: a function has no process
lifetime (see `api/index.py`'s header), so a retry falls due and waits for traffic. The ledger
shows the gap between `due_at` and `sent_at` for every attempt instead of hiding it. A schedule is
a promise this deployment cannot keep to the second, and the route shows exactly how late it
was.

## Decisions already taken

Each of these was a fork. They are recorded so the next instance does not reopen them without a
measurement.

- **Transactional outbox, not "send after commit".** `services/bookings.py` commits and returns.
  A send after that commit can be lost between the two, and a send before it can announce a
  booking that then rolls back. So `create_booking` and `delete_booking` insert an
  `OutboxEvent` row in the **same** session before the one `db.commit()`. Either both rows exist
  or neither does. This is the only change to the booking path, and it must not grow: the rules
  stay in `services/bookings.py` and delivery stays out of it.
- **Standard Webhooks, not a house format.** Headers `webhook-id`, `webhook-timestamp` and
  `webhook-signature`, as the Standard Webhooks specification defines them, so the receiver
  could be any of its published verifier libraries. Inventing headers would make a
  hiring artifact less legible, not more.
- **Ed25519 (`v1a`), not HMAC (`v1`).** HMAC needs a shared secret, and a visitor cannot verify a
  signature without the secret, which would leave "signed" as a claim on the page. With an
  asymmetric key the public half is served at `GET /api/porter/key` and a visitor can verify any
  delivery from a terminal. The private key comes from the `PORTER_SIGNING_KEY` env var, so
  every instance signs with the same key. A missing key is a startup error on Vercel, never a key
  generated on the spot: two instances would then sign with two different keys.
- **At-least-once delivery, idempotency at the receiver.** Exactly-once delivery over HTTP is not
  on offer, and the piece does not claim it. What it claims is an **exactly-once effect**: the
  receiver records `webhook-id` under a unique constraint. A redelivery or a replayed `curl`
  returns `409` and changes nothing. The ledger counts deliveries and effects separately, and the
  difference between the two counts is the duplicate traffic.
- **Replay tolerance is five minutes, both ways.** The receiver rejects a `webhook-timestamp`
  more than 300 s from its clock with `400`. A replayed `curl` from the page shows this as soon as
  it is old enough, and the page explains it.
- **Backoff is a table, not a formula.** `0s, 5s, 30s, 2m, 10m, 1h`, then the dead-letter queue.
  A table can be printed on screen and tested; `2^n` with jitter is a sentence nobody checks.
  Jitter is ± 10% from a seeded RNG keyed on the event id, so a test can predict `due_at`.
- **The receiver lives on the same deployment, and visitors cannot register a URL.** A
  user-supplied delivery URL turns the site into an open relay and an SSRF probe of whatever the
  function can reach. The receiver is `POST /api/porter/inbox`. It verifies the signature and the
  timestamp and records the effect, like an independent consumer. In the container stack it runs
  as a second service in `docker-compose.yml`, on its own port, so the deliveries really cross a
  process boundary. On Vercel they cross a function boundary, which is less, and
  ARCHITECTURE says so.
- **The worker and the on-call drain are one function.** `services/porter.py` exports
  `drain(db, now, limit)`. It claims due rows with `UPDATE … WHERE claimed_at IS NULL` so that two
  drains (two instances, or the worker and a request) never send one attempt twice. The
  container worker calls it from a loop, and the Vercel middleware calls it after the response
  with a short time budget. Two implementations would disagree about what "due" means within a
  week.
- **The drain never delays a response.** On Vercel it runs in a background task after the
  response is sent, with a 2 s budget and a limit of five sends. If the platform freezes the
  instance first, the claim expires after 30 s and the next drain takes the row back. That expiry
  is what makes a frozen function lose nothing. It needs a test.
- **No new UI framework, no polling faster than the dashboard's.** The ledger refreshes at the
  dashboard's REST cadence and reuses its degradation: live, then polling, then a committed
  fixture with the badge that says so.
- **No auth.** As for every route here (ROADMAP's "Deliberately not doing"). The ledger shows
  booking ids, room numbers and event types, never guest names. The receiver records the
  payload's hash, not the payload.

## The one decision still open: where the outbox lives on Vercel

This has to be settled before the first phase. Today each Vercel instance seeds its own SQLite
file in `/tmp` (see `api/index.py`). An outbox row would then exist only on the instance that
took the booking. A drain triggered on another instance would never see it, and the ledger would
show a different history depending on which instance answered. That would be the two-hotels
problem the fixed RNG seed was introduced to stop, back again in a new place.

The options, in order of preference:

1. **A free-tier hosted Postgres** (Neon's free plan needs no card), reached through
   `DATABASE_URL`, the seam `api/index.py` already names. Only the Porter tables move there,
   through a second engine, so the hotel data stays seeded per instance. The free plan's limits
   (storage, compute hours and suspend-on-idle) are written into this file and into ARCHITECTURE
   before anything depends on them. A cold Postgres adds wake-up latency to the first drain, and
   the ledger shows that too. **The owner must create the account. An instance must not.** This
   is a $0 service, but it is still a third party holding rows, and `docs/analytics.md`'s privacy
   note gains a paragraph.
2. **No shared store: ship `isolated` on Vercel and `worker` in the container.** This is the
   honest minimum. The route still works and states its limits, but the hosted demo's ledger
   loses its history whenever the instance recycles, and a visitor's booking can land on a
   different instance from the page reading the ledger.

Option 1 is recommended. Option 2 is what the route does whenever `PORTER_DATABASE_URL` is
unset, so it gets built either way.

## Traps specific to this piece

- **`db.commit()` is called inside the service today.** The outbox insert has to happen before
  it, in the same function, and not in the router. A router-level insert would sit outside the
  transaction, and that is the bug the outbox exists to prevent.
- **`HTTPException` is serialised by `jsonable_encoder`** (see `_as_http` in
  `routers/bookings.py`). The inbox's `409` and `400` bodies must be plain dicts, for the same
  reason.
- **Python runs at two versions.** The signing library must have wheels for 3.11 and 3.12, it
  must be pinned in both `backend/requirements.txt` and `pyproject.toml`, and
  `test_dependency_pins.py` will say so if one is missed. `cryptography` is the expected choice;
  check `pip-audit` before pinning.
- **Clock skew is real between instances.** `due_at` and the replay tolerance compare
  timestamps written by different machines. Store UTC from the database's clock (`now()` on
  Postgres) where possible, not each instance's.
- **The e2e suite stubs the backend at the network layer.** The ledger's fixture and the stubs in
  `e2e/support/backend.ts` must contain an injected refusal and a retry, or the screenshot
  shows a ledger where nothing ever went wrong, which is the one picture this route must not
  give.
- **Do not let the drain become decorative motion.** The ledger updates when rows change, and a
  row that changes gets a colour change, not a transition. A spinner on a pending retry is a loop
  that shows state, and `check:docs` wants a comment above it saying which state.

## Layout

```text
backend/
  db/models.py          + OutboxEvent, DeliveryAttempt, InboxReceipt
  alembic/versions/     + one migration for the three tables
  services/porter.py    enqueue(), drain(), the backoff table; no FastAPI imports
  services/signing.py   sign(), verify(), the Standard Webhooks byte layout
  routers/porter.py     GET /api/porter/events, GET /api/porter/key, POST /api/porter/inbox
  worker.py             the container's loop around services.porter.drain
api/index.py            + the post-response drain, behind the shared-store check
src/app/porter/
  porter.ts .html .css .spec.ts   the ledger
  attempt-row/                    one attempt: status, latency, lateness, the request
  replay/                         the curl and openssl commands, generated from the row
src/app/services/porter-api.service.ts (+ fixture)
e2e/porter.spec.ts
```

Tables (column names are the wire names, as `BookingOut` does it):

| Table              | Holds                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------- |
| `outbox_event`     | `id` (`evt_` + ULID), `type`, `booking_id`, `payload` JSON, `created_at`, `dead_at`    |
| `delivery_attempt` | `event_id`, `n`, `due_at`, `claimed_at`, `sent_at`, `status`, `latency_ms`, `injected` |
| `inbox_receipt`    | `webhook_id` UNIQUE, `received_at`, `payload_sha256`, `attempts_seen`                  |

## The phases

### Phase 0 — the outbox, with nothing sent

1. The three tables and their Alembic migration. `OutboxEvent.id` is a ULID so ids sort by time
   without a second column.
2. `services/porter.enqueue(db, type, booking)` inserts an event and its attempt `n = 0`, due
   now. `create_booking` and `delete_booking` call it before their commit. Event types are
   `booking.created` and `booking.cancelled`. The payload is `BookingOut`'s fields, so a
   receiver needs no second schema.
3. A test that makes the commit fail (a constraint violated after `enqueue`) and asserts that
   neither the booking nor the event exists. That one test is the outbox's whole argument.
4. `GET /api/porter/events` lists events with their attempts, paged the way
   `GET /api/bookings` is.

**DoD.** A booking made through the API produces exactly one event and one due attempt, in the
same transaction. The rollback test passes. The backend's test count in `CLAUDE.md` is updated,
because `check:docs` holds it.

### Phase 1 — signing and the receiver

1. `services/signing.py`: the Standard Webhooks signed content
   (`{id}.{timestamp}.{body}`), Ed25519 `v1a`, base64 as the spec has it. The key is loaded
   from `PORTER_SIGNING_KEY`. A development key lives in the test fixtures only, never in the
   repo's runtime config.
2. Test the signer against one of the Standard Webhooks specification's own published test
   vectors, committed with a link to its source. A signer that only agrees with its own verifier
   proves nothing.
3. `POST /api/porter/inbox`: verify, check tolerance, insert `InboxReceipt`, return `200`,
   `409` on a duplicate `webhook-id`, and `400` on a stale timestamp or a bad signature, each
   with a reason. The first time a valid `webhook-id` arrives, the receiver records a refusal
   (`inbox_receipt.attempts_seen = 1`, no effect) and answers `503` with
   `Porter-Injected: first-attempt`. Standard Webhooks has no attempt-number header, so the
   receiver keeps count itself, as an independent consumer would have to.
4. `GET /api/porter/key` serves the public key as PEM and as the raw base64 the spec uses.

**DoD.** A hand-built `curl` with a signature made by `openssl` is accepted, the same `curl`
again gets `409`, and one with its timestamp moved six minutes gets `400`. CONTRIBUTING gains
the three commands, and they work when pasted.

### Phase 2 — the courier

1. `services/porter.drain(db, now, limit)`: claim due attempts, send with a 5 s timeout, record
   the status, latency and the `Porter-Injected` header, and schedule `n + 1` from the backoff
   table or set `dead_at`.
2. Claims expire after 30 s. Test: claim, "freeze" (no send), advance the clock, drain again,
   and assert exactly one send.
3. Test: two drains racing on one row send it once, on SQLite and, if option 1 was chosen, on
   Postgres in CI's service container.
4. `backend/worker.py` and a `porter-worker` service in `docker-compose.yml`. Health gains a
   `courier` field, `worker`, `on-call` or `isolated`, beside `liveStream`.
5. The post-response drain on Vercel, only when the shared store is configured.

**DoD.** In the container, a booking's event is refused once and accepted on the second attempt
five seconds later, with no request from anyone. On a Vercel preview with the shared store, the
same happens on the next request after the retry falls due, and the recorded lateness matches
the gap between the two requests.

### Phase 3 — the ledger

1. `/porter`: the state line, then the ledger, newest event first. Each event shows its
   attempts in a row with status, latency, `due_at → sent_at` lateness and the injected marker in
   words. The dead-letter queue is a filter, not a second screen (ROADMAP's "no more CRUD
   screens").
2. `replay/` renders, from the row, the exact `curl` and the `openssl` verification for that
   delivery. They are generated, never hand-written, so they cannot drift from the signer.
3. `/booking`'s confirmation gains the one line linking to its event.
4. The degradation the dashboard has (live, then polling, then fixture) with its badge. The
   fixture is a committed ledger with a refusal, a retry and one dead letter.
5. The three counts are deliveries, effects and dead letters, each derived from rows. Do not
   add a success rate: with one injected refusal per event it is 50% by construction, and a
   reader would take it for a fault.

**DoD.** The route passes axe. Its table is a real `<table>` with headers, and the state line
is a throttled `role="status"`, not a live region over the table (ARCHITECTURE §Accessibility).
The component spec covers all three states and the fixture path. `npm test` coverage has not
fallen.

### Phase 4 — the wiring

1. `vercel.json`'s rewrite, `src/route-meta.json`, the lazy route, and the card in
   `src/app/projects/projects.data.ts`. Build with `npm run build`.
2. `e2e/project-frames.spec.ts` gets a recipe, then run `npm run frames:capture` and commit the
   frame.
3. `ARCHITECTURE.md` gains a §Delivery covering the endpoints, the three states, the backoff
   table, the signature layout and the shared-store decision with its free-tier limits.
4. `CLAUDE.md`: the two-routes framing in §What this repo is becomes three, and this file's
   doc-map row says what landed. `check:docs` gains these checks: the outbox insert precedes the
   commit in `services/bookings.py`; no HMAC secret env var exists; the backoff table in `services/porter.py` matches the one in ARCHITECTURE; nothing
   under `src/app/porter/` hard-codes a status code that the fixture does not contain.
5. All six gates, `npm run e2e` and `npm run check:docs`, green.

**DoD.** The card is on the home page with a committed frame, and a visitor can go from a
booking to its verified signature without leaving the site, except to open a terminal.

## Rules for every phase

- **One phase, one sitting, one result someone can check from a terminal.**
- **Never claim exactly-once.** The words are "at least once" and "exactly-once effect", in the
  UI, the docs and the commit messages.
- **The injected refusal is the only injected thing.** If another failure is wanted on screen,
  it has to be a real one.
- **$0.** No paid tier, no metered queue, and no service the owner has not created themselves.
- **When a phase lands**: delete it here, renumber, move what was learned into the header of the
  file it concerns, and add this file to `CLAUDE.md`'s doc map or update its size there.
