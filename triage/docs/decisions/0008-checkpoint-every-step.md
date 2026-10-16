# 0008 — Checkpoint every step; resume at the first one not saved

**Status:** accepted, 2026-10-16

## Context

A triage is a chain: fetch the log, gather history, classify, investigate, report. Two
of those steps spend the subscription's quota. GitHub Actions makes the _trigger_
durable (ADR 0003), but a re-run job starts from nothing, and a local run killed by a
closed laptop or a usage limit loses whatever it had done. Restarting is affordable for
the `gh` steps. For the model steps it means paying twice for the same answer.

## Options

- **Restart the whole case.** Simplest, and safe because every step is idempotent. It
  pays for classify again whenever the investigation is interrupted, and an
  interruption is most likely during the longest step, which is the investigation.
- **A workflow engine (Temporal, Step Functions, a hosted queue).** Durable execution
  is exactly what they sell. Each needs a server or costs money, and the brief rules
  out both.
- **Resume Claude Code's own session** (`--resume <session id>`). This would let the
  investigation continue mid-loop. But the session lives in the runner's home
  directory, which dies with the runner, and `--no-session-persistence` is set on
  purpose so that nothing from a run is left behind. It was rejected.
- **A checkpoint file per step, written atomically.** Chosen.

## Decision

`ci_triage/pipeline.py` runs each case as five named steps. Each step's output is
written to `<state>/<run_id>/<job_id>/<step>.json` the moment the step ends, using the
same temp-file-then-rename `write_json` the corpus uses. Before a step runs, its
checkpoint is looked for:

- **Present and valid:** the saved output is used and the step is not run. The record
  lists it under "Resumed".
- **Absent:** the step runs, and its output is saved.
- **Present but unreadable, of another schema version, for another step, or not a
  valid output:** the case **fails** and names the file. The checkpoint is never read
  as "not done", because redoing the step silently would hide a bug or a tampered
  file and spend quota doing it. Deleting the file is the deliberate way to redo a
  step.

Every checkpoint carries `"schema": 1`. A change to a step's output shape bumps it, so
a state directory written by older code is refused by name.

**The investigation is all or nothing.** Its loop belongs to Claude Code, so a run
killed partway restarts it from the first turn. Classify's answer, saved before it
started, is not lost.

**Where the state lives.** Locally: `triage/state/`, which is gitignored. It is working
state, not evaluation data. In CI it is carried between attempts by `actions/cache`:
it is restored by the prefix `ci-triage-state-<target run>-` and saved under a key per
attempt, because cache entries are immutable. The save step runs on `always()`, so a
cancelled or timed-out job keeps its checkpoints.

## Consequences

- **A killed run pays only for the step it was killed in.** In the one live
  demonstration (RESULTS.md, Stage 5), the run was killed during the investigation,
  and the resumed run made no `gh` log request and no classify call.
- **A runner that dies outright never reaches the save step.** Its re-run starts the
  case from scratch. Because the steps are idempotent this costs time and at most two
  model calls. It does not produce a wrong answer.
- **Checkpoints are evidence.** The CI job uploads the state directory (records and
  traces) as an artifact kept for 14 days. That is where a Stage 8 dashboard can read
  from.
