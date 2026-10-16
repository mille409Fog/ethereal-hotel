# 0007 — The investigation is the agent; five read-only tools over a hand-written MCP server

**Status:** accepted, 2026-10-15

## Context

Stage 3 ran one model call per case. Its misses on tune (RESULTS.md) were not misreadings
of the log. They were questions that the log cannot answer:

- **Inherited or introduced?** Upgrade-branch failures were blamed on the upgrade when
  the same job had already been failing on `development-alpha`.
- **Platform or content?** A résumé PDF that renders differently on Windows and Linux
  looked like a stale artefact.
- **Where does the fix go?** The file that carries a budget is rarely the one the log
  prints.

Each needs facts from outside the log, and _which_ facts depends on the case. A fixed
sequence of lookups would either fetch everything for every case or miss the one that
mattered. That variation is the definition of where an agent earns its cost.

## Decision

**Only the investigation is an agent.** Everything else stays workflow, written and
tested as ordinary code: making the failing commit available, gathering history,
running the loop under limits, validating the answer, falling back to rules, and
storing the record and the trace.

**Five tools, all read-only** (`ci_triage/tools.py`): `search_repo`, `read_file`,
`commit_changes`, `job_history`, `earlier_failures`. Three rules hold for every tool:

1. **As of the failure.** Repository reads happen at the failing commit, and history
   stops before the failing run, so the fix is never visible. The triage tool's own
   files (`triage/`, which holds the labels) are refused at any commit.
2. **No labels.** Earlier failures carry their error lines only. A deployed triage would
   remember its own answers, but this history repeats a few causes so often that labels
   would let the agent copy instead of investigate (maintainer, 2026-10-15).
3. **Small answers.** Every result stays in the context and is re-read on each later
   turn, so every tool caps its output and says how to ask for more.

The tools run offline. `gh` is called by the workflow before the loop starts
(`history.py`), and the results are cached in `data/history/`, so a re-run replays the
same facts and the server process needs no GitHub credentials.

**Limits**, with what enforces each:

| Limit                       | Value          | Enforced by                           |
| --------------------------- | -------------- | ------------------------------------- |
| Turns                       | 12             | `--max-turns` (Claude Code)           |
| Notional cost               | $0.30 per case | `--max-budget-usd` (Claude Code)      |
| Wall clock                  | 120 s          | our stream reader kills the process   |
| Tokens processed, all turns | 500,000        | `TokenWatch`, which kills the process |

The time and token limits are ours because a limit we cannot see being enforced is not
a limit. Hitting any of them leaves no answer, so the rules answer, and the record and
the trace both say which limit it was. There is one attempt per case, because a retried
investigation repeats every turn.

**The trace** is the raw `stream-json` event stream, bracketed by our own header
(case, version, limits) and verdict, one JSON object per line, in
`data/traces/<version>/<case>.jsonl`. `npm run triage:trace -- <case>` renders it turn
by turn. The session's opening event is cut down to its model, tools and version
before it is written, because the traces are committed to a public repository.

## MCP: hand-written, standard library only

| Option                                            | For                                                                                        | Against                                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Official `mcp` Python SDK                         | Protocol upgrades handled upstream; typed decorators                                       | The package's first runtime dependency (ADR 0002), plus transports, resources and prompts nothing here uses |
| **Hand-written stdio JSON-RPC** (`mcp_server.py`) | ~150 lines; the whole protocol is readable in one file; tested in-process and as a process | We track protocol changes ourselves                                                                         |
| No MCP: our own loop                              | Every line of the loop is ours                                                             | Rejected in ADR 0001: through `claude -p`, MCP is how outside tools reach the loop                          |

**Hand-written.** The server implements `initialize`, `tools/list` and `tools/call`
(and `ping`). A tool's failure is returned as a result with `isError`, which the
model reads and recovers from. Protocol errors are kept for malformed messages. The
cost is real but small: if a future Claude Code requires something these three methods
do not cover, this file has to learn it. A test runs the real process over stdio, so
that breakage would show up there first.

## Consequences

- The agent sees the repository as of each failure, which needs the failing commit
  locally. Dependabot commits often are not, so `ensure_commit` fetches them by SHA
  from `refs/pull/*` before the loop starts. That is read-only, and changes no branch.
- `job_history` can only show what GitHub can list: Dependabot's own dynamic workflow
  has no listable history, and this repository's CI does not run on `main`. Both come
  back as empty histories, said plainly, not as errors.
- The prompt (`prompts/investigate.v1.md`) carries the tie-breaking rules learnt from
  the **tune** misses (inherited vs introduced, platform-dependent renders). Its
  holdout score is therefore an honest test of those rules, which were written without
  reading the holdout.
- Stage 6 inherits a precise attack surface. Untrusted text reaches the model through
  the log and through tool results (commit messages, file contents), and the tools are
  read-only by construction.
