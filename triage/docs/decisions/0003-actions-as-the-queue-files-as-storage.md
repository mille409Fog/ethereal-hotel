# 0003 — GitHub Actions as trigger and queue; files as storage

**Status:** accepted, 2026-10-12. Implemented across Stages 2 and 5.

## Context

The plan asks for a trigger, a job queue and a data store. The project's cost ceiling is
$0, its volume is about 35 failures a month, and it only ever reads one repository's CI.

## Options

- **A queue service (Redis, SQS, a hosted workflow engine) and a database.** This is the
  production-shaped answer, and none of it is needed at this volume. Each costs money or
  needs a host, and the brief rules both out.
- **A cron job polling the GitHub API.** It works, but it adds latency, needs somewhere
  to run, and spends API quota asking "anything new?"
- **GitHub Actions `workflow_run`.** GitHub records the failure, starts a job, retries
  infrastructure failures, and keeps the run's history. On a public repository this is
  free. Chosen.

For storage:

- **The corpus as committed JSON files** (trimmed excerpts plus metadata, the latest 50).
  They are versioned with the code that reads them, need no server, and can be reviewed
  in a diff. Chosen.
- **Traces as local JSONL**, one JSON object per step, appended. Any tool can read them,
  and a Stage 8 dashboard can be built over them.

## Consequences

- Durability comes from Actions itself. Resuming a half-finished triage still needs our
  own per-step state, because a re-run job starts from scratch. That is ADR 0008.
- A `concurrency` group is not quite a queue by default: it keeps one pending run and
  cancels the rest. The workflow sets `queue: max` (ADR 0009).
- The trigger job will run with repository secrets, including the subscription token.
  A `workflow_run` job can be started by a run from a fork's pull request, and failure
  logs are untrusted text. Stage 6 has to treat both as hostile before this trigger
  goes live.
- Rotating the corpus deletes files but not git history, which is why excerpts are
  trimmed: the history grows by kilobytes per failure, not by 100 KB raw logs.
