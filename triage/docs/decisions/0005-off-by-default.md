# 0005 — Off by default; switched on from the command line

**Status:** accepted, 2026-10-13. Stages 2–4 satisfy it by construction; the switch
itself lands with the trigger in Stage 5.

## Context

The maintainer wants nothing to run, and no model to be called, unless he has asked
for it. Triage spends subscription quota he also uses interactively, and from Stage 5
it will react to CI failures with nobody watching.

## Decision

- **Until Stage 5, every action is a command someone typed**: `npm run triage:fetch`,
  `triage:label`, `triage:freeze`, `triage:eval`, and later the triage command itself.
  No schedule, hook or workflow starts any of them.
- **From Stage 5, the GitHub Actions trigger checks a repository variable,
  `TRIAGE_ENABLED`.** The job runs only when it is exactly `true`. Unset, empty, or any
  other value means off, so the default state of a fresh fork or a deleted variable is
  off.
- **`npm run triage:enable` and `npm run triage:disable`** set and clear it with
  `gh variable set` / `gh variable delete`. That is free, needs no commit or deploy,
  and takes effect on the next failure.

## Options considered

- **Manual only, ever.** Simpler, but it drops the plan's requirement that the
  deployed system runs on a real trigger.
- **A committed flag file.** Visible in diffs, but switching it costs a commit and a
  push, and a forgotten flag in a branch would switch it on wherever that merged.
- **A repository variable.** Chosen: default off, one command each way, no deploy.

## Consequences

- The workflow's `if:` compares against the literal string `'true'`, so a typo in the
  variable fails closed, in the same spirit as the billing guard (ADR 0004).
- The switch gates _starting_ a triage. The billing guard still vets every `claude`
  process once one has started; neither replaces the other.
