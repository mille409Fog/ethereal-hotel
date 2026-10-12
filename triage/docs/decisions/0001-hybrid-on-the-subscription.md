# 0001 — Model access through `claude -p`, in a hybrid workflow + agent

**Status:** accepted, 2026-10-12

## Context

The project may cost nothing beyond the maintainer's existing Claude Pro subscription.
The Anthropic API is billed per token, separately from any subscription, so it is ruled
out. Headless Claude Code (`claude -p`) runs on the subscription's normal limits (policy
checked 2026-10-12; the brief says to re-check it before the first real call).

That decides _how_ the model is reached, and it changes the shape of the agent. Through
`claude -p` we do not write the model call ourselves. We hand Claude Code a prompt, and
Claude Code runs its own agent loop.

## Options

|     | Shape                                                                                                                                                                                               | For                                                                                                             | Against                                                                                                                                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | Claude Code's loop does everything; our tools are exposed over MCP                                                                                                                                  | Least code; robust loop; built-in turn caps                                                                     | Workflow steps that need no agent would run as one anyway; the loop is not ours to explain line by line                                                 |
| B   | Our own Python loop, one `claude -p` per step, the model answering in JSON (`{"call": …}` or `{"done": …}`)                                                                                         | Every line of the loop is ours                                                                                  | Each step is a new process re-sending the whole context, which burns the most quota and adds seconds per step. It imitates tool use instead of using it |
| C   | **Hybrid**: fixed steps (fetch, trim, classify) are our code making single `claude -p` calls; only the investigation runs in Claude Code's loop, with our tools over MCP and its built-in tools off | "Mostly workflow, agent where the path varies", built for real; MCP used for its actual purpose; low quota cost | We don't hand-write the agent loop                                                                                                                      |

## Decision

**C.** The investigation is the only step whose path varies from failure to failure, so
it is the only one that runs as an agent.

## Consequences

- In Stage 4, `claude -p` runs with built-in tools disabled (`--tools ""`), our tools
  supplied by `--mcp-config` with `--strict-mcp-config`, and a `--max-turns` cap.
- The loop is Claude Code's, so understanding it comes from reading its trace
  (`--output-format stream-json`) turn by turn rather than from writing it. Stage 4
  includes a walkthrough of one of our own traces.
- Structured output comes from `--json-schema`, which the CLI validates. We validate
  again ourselves, because a schema the CLI accepted is not one our types accepted.
- `--bare` is never used: it does not read the subscription token (ADR 0004).
- If the project ever moves to the API, only `ci_triage/claude_cli.py` should change.
