# CI Triage — Project Brief

## Problem

This repository's CI fails often, and usually for a reason that has happened before. Between
2026-08-10 and 2026-10-12 GitHub Actions recorded **68 failed runs**. In the Code Quality workflow
the end-to-end job alone failed 37 times. Most of that time went to the same opening move: read
the log, find the failing step, compare with the last time it broke, check what the commit changed,
and remember which entry in `CLAUDE.md` §Traps applies.

CI Triage does that opening move. Given a failed run, it states what kind of failure it is, why it
probably happened, which evidence supports that, and what the fix likely touches.

## Users

One: the maintainer of this repository. Nobody else's pipeline is in scope.

## Inputs and outputs

**Input:** one failed GitHub Actions run of this repository (its id).

**Output:** a triage record containing:

- **category**, one of:
  - `flaky`: timing, nondeterminism, passes on re-run
  - `regression`: the commit broke something real
  - `environment`: runner, network, toolchain or service outage
  - `threshold`: a budget, coverage or score gate tripped
  - `dependency`: lockfile, advisory or version drift
- **root-cause hypothesis**, in a sentence or two
- **evidence**: the log lines, commit, files or past runs it rests on
- **suggested fix**: which files the fix probably touches, and why
- **confidence**, which decides whether a case is escalated to the human (Stage 6)

At first the record goes to the run's job summary. Nothing leaves the run, so this needs no
approval. Posting an issue or a PR comment is a later step, and it waits for human approval
because it publishes.

## In scope

- Failed runs of this repository's workflows (`code-quality.yml`, `supply-chain.yml`).
- Read-only investigation: logs, commits, diffs, earlier runs of the same job, repository files.
- A rolling corpus of failure logs committed to the repository (see §Data).

## Out of scope

- **Fixing anything.** It suggests fixes and never edits code, pushes, or re-runs jobs.
- Other repositories, and failures that happen only on a developer's machine.
- Any change to the portfolio site. `/dashboard` and `/booking` stay untouched, as they would
  for `/aubade`.

## Success metrics

| Metric                                                                   | Target           |
| ------------------------------------------------------------------------ | ---------------- |
| Category accuracy on the held-out set                                    | ≥ 85%            |
| Suggested fix names a file the real fix touched                          | ≥ 60% of cases   |
| Improvement over the rule-based baseline (Stage 2) on both metrics above | measured, stated |
| Time from failure to triage record                                       | ≤ 2 minutes      |

**The labels come from history:** the commit that turned each failure green is its answer key.

**A known weakness of the data:** the e2e job dominates, and many of its failures probably share
one root cause (the lobby timeout `CLAUDE.md` describes). The classes are unbalanced and full of
near-duplicates, so the held-out set is split **by time or by root cause, never at random**. A
random split would let near-identical failures land on both sides and inflate the score.

## Cost ceiling: $0 beyond the existing subscription

This is a hard constraint, not a target. The project must never create a charge.

- **Model access goes through the maintainer's existing Claude Pro subscription**, using Claude
  Code in headless mode (`claude -p`). That usage draws from the plan's normal limits. When the
  limits are reached, a run must **stop and say so**. It must not fall back to a paid route.
- **`ANTHROPIC_API_KEY` must never be set**: not in `.env`, not in CI, not on the machine. When
  present it takes precedence over subscription login and is billed per token. A guard in the
  client module refuses to start if it finds one.
- **"Extra usage" must stay disabled** in the claude.ai account settings, so hitting a limit stops
  usage instead of billing for it.
- **GitHub Actions minutes are free** for this public repository. No paid service, host, database
  or tracing tool is added at any stage. Where the plan suggests one, a local or free alternative
  replaces it.
- **Evaluation spends the same quota as daily use.** The golden set stays small and evals run on
  demand, not on every push.

The usage policy for running Claude Code headlessly on a subscription has changed during 2026.
Re-check it at Stage 3, before the first real call, and record what was found in an ADR.

## Data

- **Corpus:** a rolling window of the **50 most recent failed runs**, committed to the repository.
  When a new failure is added, the oldest is deleted.
- **What is stored:** a **trimmed excerpt** of the failing step's log, not the raw log, plus run
  metadata (id, workflow, job, commit, date) and later a label. Raw failed-step logs measured
  31–166 KB, and every rotation stays in git history permanently, so storing them raw would grow
  the repository on every failure. The trimming rule is built in Stage 2. GitHub masks secrets in
  logs before they are stored, and the repository is already public. A scrub pass runs anyway.
- **Open (decided at Stage 2):** whether the labelled golden set is a frozen copy kept apart from
  the rolling window, so scores stay comparable over time.
