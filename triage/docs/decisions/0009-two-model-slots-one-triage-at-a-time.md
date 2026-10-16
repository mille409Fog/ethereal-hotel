# 0009 — Two model slots, one triage at a time, and a stop that reaches every case

**Status:** accepted, 2026-10-16

## Context

One failed run can fail several jobs, and each is a case with two model calls. Run one
after another, three cases take three times as long. Run all at once, they hit two
limits:

- **The subscription.** It publishes no requests-per-minute figure; what runs out is
  the plan's usage window, which the maintainer also uses interactively. When it runs
  out, every further call fails the same way.
- **GitHub's API.** The built-in `GITHUB_TOKEN` gets 1,000 requests an hour per
  repository (GitHub docs, checked 2026-10-16). Past that, or under GitHub's secondary
  limits, requests fail until the window resets.

## Decision

**Inside one run** (`ci_triage/pipeline.py`):

- Up to `WORKERS = 4` cases run at once in a thread pool, which overlaps the `gh` fetches.
- At most `MODEL_SLOTS = 2` `claude` processes run at once. A `ModelGate` holds a
  bounded semaphore, and every model call happens inside one of its slots.
- **The gate has a stop.** The first case that hits the usage limit, the billing
  guard, or a fatal setup error records why, _while still holding its slot_, so no
  other case can start a call in between. After that, no model call starts anywhere
  in the run. Cases already in a call finish and save, and the rest report `stopped`,
  with their completed steps checkpointed (ADR 0008). The command exits 1: running it
  again resumes.
- **`gh` is retried only when it failed transiently.** That means an HTTP 429, a 5xx,
  "rate limit", or a timeout. The waits are 5s, 30s and 60s, because GitHub asks
  clients that get no `Retry-After` to wait at least a minute, and `gh run view`
  passes no headers through. A 404 or a missing login is not retried. A log fetch that
  still fails after the retries fails the case (resumable). It is never read as "no
  log", which would quietly turn an outage into "nothing to triage".

**Across runs** (`.github/workflows/triage.yml`): `concurrency: { group: ci-triage,
queue: max }`, so only one triage workflow runs at a time and the gate's two slots are
the whole load. `queue: max` matters: the default (`single`) keeps only one pending run
and **cancels** the older one when another arrives, which would drop every failure in
a burst but the last. `check:docs` fails if it is removed.

## Options considered

- **Sequential cases.** No concurrency questions, but the time grows with each failed
  job, and the brief's budget is two minutes from failure to record.
- **A token bucket (N calls per minute).** It is the right tool when a provider
  publishes a rate. This one publishes a quota, and the useful responses to a quota
  are "don't stampede" (the semaphore) and "stop when told" (the gate). A rate number
  would be invented.
- **Concurrency per target run** (`group: ci-triage-<run id>`). This would let
  different failures triage in parallel, at the cost of an unbounded total number of
  `claude` processes. Rejected: the volume is about 35 failures a month, so queueing
  costs minutes and nothing else.

## Consequences

- `test_pipeline.py` proves both halves with fakes. Five cases on two slots peak at
  exactly two calls in flight, so the run really is concurrent and really is capped.
  After a limit, no call starts, checked with one slot so the order is deterministic.
- The two slots are a judgement, not a measurement. Nothing published says how many
  concurrent headless sessions a Pro login tolerates. If the plan objects, the gate
  stops and says so, and `MODEL_SLOTS` is the one number to lower.
