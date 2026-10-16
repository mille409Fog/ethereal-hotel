# 0006 — Stage 3: one schema-checked call per case, on Sonnet, rules as fallback

**Status:** accepted, 2026-10-15

## Context

Stage 3 puts the first model call into the workflow. The brief required the usage
policy for headless Claude Code on a subscription to be re-checked before that call.

**Policy, as found on 2026-10-15.** Anthropic's support article _Use the Claude Agent
SDK with your Claude plan_ (updated 2026-10-07) says the change announced for June 15,
which would have moved `claude -p` to a separate credit, was paused: "You can still use
the Claude Agent SDK, `claude -p`, and third-party apps with your subscription limits."
The monthly API credits introduced in October are for Max and Team only ("Free, Pro,
and Enterprise plans aren't eligible"), and apply only to runs that use an API key.
So on Pro, signed in with the plan, `claude -p` draws on the plan's limits and nothing
else. An API key on this account would get no credit at all, only per-token billing:
one more reason the billing guard (ADR 0004) refuses one.

**The CLI, as measured on 2026-10-15** (Claude Code 2.1.300, one probe call):
`--output-format json` returns the answer in `structured_output` and reports `subtype`,
`is_error`, `api_error_status`, token `usage`, `duration_ms`, `num_turns` and
`total_cost_usd`. A structured answer takes **two turns**, because the CLI delivers it
through an internal tool call. `--max-turns` works, although `--help` no longer lists
it. There is no `--system-prompt-file`; the prompt is passed inline.

## Decisions

1. **One call per case returns the whole record**: category, hypothesis, evidence,
   files, rationale and confidence. Not a chain (classify, then a second call for
   files), because both answers come from reading the same log, and a chain would pay
   for that log twice. Not routing (rules first, model for the rest) yet, because the
   rules already recognise every golden case, so there would be nothing left to route.
2. **Sonnet** (`--model sonnet`, which resolved to `claude-sonnet-5-5`). The project
   is off by default and run by hand when wanted (ADR 0005), so calls are few and the
   better reader of long logs is worth its quota. Haiku is the lever if that changes.
3. **The schema is enforced twice.** The CLI holds the answer to a JSON Schema built
   from our enums; `Triage.from_json` checks it again against our types. When either
   fails, the Stage 2 rules answer instead, and the record says so (`source: rules`
   with a `fallback_reason`) so a score can never quietly mix the two.
4. **Outcomes are classified, not just retried** (`failure_kind`). Timeouts, crashes
   and server errors are retried twice, at 2s then 4s. The usage limit is never
   retried: the run stops and says so. Auth failures and bad requests stop the run
   too. Claude Code already retries throttling inside the process, so a 429 that
   reaches us is final.
5. **Each call runs in an empty temporary directory.** `--bare` is banned (ADR 0004),
   and without it `claude -p` loads the hooks, MCP servers and `CLAUDE.md` of the
   directory it starts in. In this repository that would hand it `CLAUDE.md` §Traps,
   which reads like an answer key.
6. **Records are cached** in `data/runs/<prompt version>/`, one file per case, saved
   as each case finishes. Re-scoring costs no quota, a run stopped by the limit
   resumes where it stopped, and the records are committed as the evidence behind
   `RESULTS.md`. A new prompt version gets a new directory.
7. **A canary.** If the first fresh call of a run falls back, the run stops: a fault
   shared by every call would otherwise spend quota on every case to learn one thing.

## Consequences

- `total_cost_usd` is an estimate at API list prices and is **not billed**. It is
  logged as a measure of quota used, which is the scarce thing here.
- The model is given the repository's file list (minus the corpus and binaries), so
  it can name a file the log never mentions. The rule suggester can only name files
  the log does mention. That difference is the point of the comparison.
  **Amended in Stage 4:** the list must be the tree **at the failing commit**. At
  first it was today's tree, which included files that the later fixes created, and
  that leaked the answer (RESULTS.md, Stage 4). `classify.files_at` now builds it
  per case.
- The prompt was written after the golden set had been read. Its tie-breaking
  conventions match the labels for that reason, which is the same caveat Stage 2's
  score carries (see RESULTS.md).
