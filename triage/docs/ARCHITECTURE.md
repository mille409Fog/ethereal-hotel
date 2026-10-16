# CI Triage — Architecture

How the pieces fit. What it is for, and the numbers it has to hit, are in
[PROJECT_BRIEF.md](PROJECT_BRIEF.md). Why each choice was made is in
[decisions/](decisions/).

## The shape

Mostly workflow, with one agent where the path genuinely varies
([ADR 0001](decisions/0001-hybrid-on-the-subscription.md)).

```mermaid
flowchart TD
    trigger["Trigger<br/>a Code Quality / Supply chain run fails<br/>(GitHub Actions workflow_run)"]

    subgraph workflow["Workflow — our code decides every step"]
        fetch["Fetch<br/>run metadata + failed-step log (gh)"]
        trim["Trim<br/>cut the log to the failing window"]
        classify["Classify<br/>one claude -p call, JSON schema output"]
    end

    subgraph agent["Agent — the model decides the next step"]
        loop["Claude Code loop<br/>claude -p, built-in tools off,<br/>turn · cost · time · token limits"]
        tools["Our tools over MCP (read-only, as of the failure)<br/>search_repo · read_file · commit_changes ·<br/>job_history · earlier_failures"]
        loop <--> tools
    end

    history[("History<br/>job runs before the failure,<br/>gathered by gh, cached (git)")]
    history --> tools

    record["Triage record<br/>category · hypothesis · evidence ·<br/>suggested fix · confidence"]
    summary["Job summary on the run<br/>(nothing leaves the run)"]
    gate{"Human approval<br/>(Stage 6)"}
    publish["Issue / PR comment"]

    corpus[("Corpus<br/>last 50 failures,<br/>trimmed excerpts (git)")]
    traces[("Traces<br/>one JSONL line per step")]
    guard["Billing guard<br/>refuses any claude run<br/>not on the subscription"]

    trigger --> fetch --> trim --> classify --> loop --> record
    record --> summary
    record --> gate -->|approved| publish
    trim --> corpus
    classify -.-> traces
    loop -.-> traces
    guard -. "before every claude process" .-> classify
    guard -. "before every claude process" .-> loop
```

## What exists today

Everything up to the job summary is built. The approval gate and publishing are the
plan, and each lands in the stage named here. Evaluation still scores the two model
strategies separately; `triage:run` and the workflow chain them, keeping the
investigation's answer, else the single call's, else the rules'.

| Piece                               | Where                                                           | Status                                        |
| ----------------------------------- | --------------------------------------------------------------- | --------------------------------------------- |
| Billing guard                       | `ci_triage/billing_guard.py`, `ci_triage/claude_cli.py`         | **Built.** `npm run triage:doctor` runs it    |
| Fetch, trim, corpus                 | `ci_triage/fetch.py`, `trim.py`, `corpus.py`, `github.py`       | **Built.** Corpus in `triage/data/corpus/`    |
| Fix evidence, labels, freeze        | `ci_triage/labels.py`, `triage/data/labels.json`                | **Built.** Golden set frozen once confirmed   |
| Rule baseline + scorecard           | `ci_triage/baseline.py`, `ci_triage/evaluate.py`                | **Built.** Scores in [RESULTS.md](RESULTS.md) |
| Classify (single LLM call)          | `ci_triage/classify.py`, `claude_cli.ask`, `prompts/`           | **Built.** Records in `triage/data/runs/`     |
| Agent loop + MCP tools              | `ci_triage/agent.py`, `tools.py`, `history.py`, `mcp_server.py` | **Built.** Traces in `triage/data/traces/`    |
| Trigger, checkpoints, concurrency   | `ci_triage/intake.py`, `pipeline.py`, `workflows/triage.yml`    | **Built**, off until Stage 6 (ADR 0005)       |
| Approval gate, injection defences   | —                                                               | Stage 6                                       |
| Larger golden set, LLM-as-judge     | —                                                               | Stage 7                                       |
| Traces dashboard                    | —                                                               | Stage 8                                       |

## The building blocks, mapped

- **The model call** is `claude -p`, never the API. Each call is a fresh, stateless
  process, so whatever the model needs has to be in the prompt or reachable by a tool.
- **Prompts** live as versioned files under `triage/prompts/` (`classify.v2.md` is current), so a
  prompt change shows up in a diff and can be evaluated. A new version is a new file,
  and its results go to a new directory under `triage/data/runs/`
  ([ADR 0006](decisions/0006-one-call-per-case-on-sonnet.md)).
- **Tools** are read-only Python functions (`ci_triage/tools.py`) served over MCP to
  Claude Code's loop by a hand-written stdio server (`mcp_server.py`). MCP is used here
  because the loop belongs to a program we don't control, and MCP is how that program
  accepts outside tools. They read the repository at the failing commit and history
  from before the failure, so the fix is never visible
  ([ADR 0007](decisions/0007-the-investigation-is-the-agent.md)).
- **State** for one triage is a checkpoint per step, in
  `triage/state/<run>/<job>/<step>.json`. A killed run resumes at the first step it had
  not saved, and an unreadable checkpoint fails the case instead of being redone
  ([ADR 0008](decisions/0008-checkpoint-every-step.md)).
- **Orchestration** is our code for the workflow half and Claude Code's loop for the
  agent half.
- **Memory**: short-term is one run, meaning the context of an investigation plus that
  case's checkpoints. Long-term memory is three stores, all committed or cached, and
  none of them new in Stage 5:
  - the **corpus**: the last 50 failures' error lines, which `earlier_failures` reads
    so a recurrence can be recognised;
  - the **history cache**: earlier runs of the job, which tell an inherited failure
    from one the commit introduced;
  - `CLAUDE.md` §Traps: past root causes, written by hand.

  Past _answers_ are deliberately not stored for the agent to read
  ([ADR 0007](decisions/0007-the-investigation-is-the-agent.md), rule 2). A retrieval
  index would be the next step at a larger scale. At 50 cases, a filter on job name
  finds them all.

## Trigger, queue and concurrency

Three ways in, all checked by `ci_triage/intake.py` before any work is done: the
`workflow_run` event when Code Quality or Supply chain finishes, `workflow_dispatch`
with a run id, and `npm run triage:run -- <run_id>`. A malformed request exits 2 and
names the field. A valid one with nothing to do (the run passed, it came from a fork)
exits 0.

We don't build a queue: a `workflow_run` event in GitHub Actions is already durable,
retried and free on a public repository
([ADR 0003](decisions/0003-actions-as-the-queue-files-as-storage.md)). One triage runs
at a time (`queue: max`, so waiting ones are kept, not cancelled). Inside it, cases run
side by side with at most two `claude` processes at once, and a usage limit stops every
case ([ADR 0009](decisions/0009-two-model-slots-one-triage-at-a-time.md)).

## Money

No path in this system can bill anything beyond the Claude Pro subscription. Four layers
make that true, and the brief's §Cost ceiling explains why it matters.
[ADR 0004](decisions/0004-a-fail-closed-billing-guard.md) describes them.

## Commands

| Command                                                       | What it does                                                                                       |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `npm run test:triage`                                         | pytest over `triage/tests/`                                                                        |
| `npm run code-quality:py`                                     | ruff and mypy-strict, over `triage/` along with `backend/` and `api/`                              |
| `npm run triage:doctor`                                       | Runs the billing guard against this machine and says whether `claude` may run                      |
| `npm run triage:fetch`                                        | Adds new failed runs to the corpus and rotates it to 50 runs (`gh`, read-only)                     |
| `npm run triage:label`                                        | Finds each new case's fix in history and adds it to `labels.json`                                  |
| `npm run triage:freeze`                                       | Copies confirmed labels into the golden set, once                                                  |
| `npm run triage:eval`                                         | Scores the rule baseline against the golden set                                                    |
| `npm run triage:eval -- --llm [--split holdout\|tune\|all]`   | Scores the model call; calls Sonnet once per case not already in `data/runs/`                      |
| `npm run triage:eval -- --agent [--split holdout\|tune\|all]` | Scores the investigation; one agent run per case not already in `data/runs/`, each writing a trace |
| `npm run triage:trace -- <case_id>`                           | Prints an investigation's trace turn by turn                                                       |
| `npm run triage:run -- <run_id>`                              | Triages every failed job of one run, checkpointed in `triage/state/`; run it again to resume       |
| `npm run triage:enable` / `triage:disable`                    | Sets or deletes the `TRIAGE_ENABLED` repository variable that switches the workflow on             |

None of these runs on its own, and the workflow does nothing until `TRIAGE_ENABLED` is
`true`: the project is off by default ([ADR 0005](decisions/0005-off-by-default.md)).
