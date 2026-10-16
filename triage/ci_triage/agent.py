"""Stage 4: the investigation, the one step that runs as an agent (ADR 0007).

    FailedJob ─┬─ ensure_commit: the failing commit exists locally   (workflow)
               ├─ case_context: history + earlier failures, cached   (workflow)
               └─ claude -p, our tools over MCP, in a loop           (agent)
                     ├─ every event → data/traces/<version>/<case>.jsonl
                     └─ a result → Triage, or the rules if there is none

The loop itself is Claude Code's: the model reasons, picks one of our tools, Claude
Code calls our MCP server, the result goes back into the context, and it repeats
until the model answers in the schema or a limit stops it. Four limits, each enforced
by something different:

    turns    --max-turns              Claude Code stops the loop
    cost     --max-budget-usd         Claude Code stops the loop (notional dollars)
    time     the wall clock here      we kill the process
    tokens   TokenWatch here          we kill the process

The time and token limits are ours because a limit we cannot observe being enforced
is not a limit. A run stopped by any of them has no answer, so the rules answer
instead, and the record and the trace both say which limit it was.

One attempt per case, no retries: a retried investigation repeats every tool call
and every turn, which makes it the most expensive thing to repeat in the system.
"""

import json
import queue
import subprocess
import sys
import tempfile
import threading
import time
from collections.abc import Callable, Collection, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Final

from ci_triage.classify import PROMPTS, by_rules, render_case, triage_schema
from ci_triage.claude_cli import (
    TASK,
    CallResult,
    ClaudeCallError,
    UsageLimitError,
    failure_kind,
    find_claude,
    usage_of,
)
from ci_triage.corpus import write_json
from ci_triage.models import FailedJob, JsonObject, Triage, TriageRecord, Usage
from ci_triage.tools import TOOLS, CaseContext, Git

AGENT_VERSION: Final = "investigate.v1"
MAX_TURNS: Final = 12
TIME_LIMIT_SECONDS: Final = 120  # the brief's budget for a whole triage
MAX_BUDGET_USD: Final = 0.30
# Tokens processed across all turns: fresh input, cache reads and writes, and output.
# Each turn re-reads the whole conversation, so this is what grows when a loop wanders.
MAX_TOKENS: Final = 500_000

SERVER: Final = "triage"
ALLOWED_TOOLS: Final = tuple(f"mcp__{SERVER}__{tool.name}" for tool in TOOLS)
MCP_SERVER_SCRIPT: Final = Path(__file__).resolve().parent.parent / "mcp_server.py"

Event = JsonObject


def agent_prompt(version: str = AGENT_VERSION) -> str:
    return (PROMPTS / f"{version}.md").read_text(encoding="utf-8")


def mcp_config(context_path: Path, repo: Path) -> JsonObject:
    return {
        "mcpServers": {
            SERVER: {
                "type": "stdio",
                "command": sys.executable,
                "args": [
                    str(MCP_SERVER_SCRIPT),
                    "--context",
                    str(context_path),
                    "--repo",
                    str(repo),
                ],
            }
        }
    }


def agent_args(system_prompt: str, config_path: Path, model: str) -> list[str]:
    """The flags for one investigation. Each one closes a door; none may be dropped."""
    return [
        "-p",
        TASK,
        # One JSON event per line as the loop runs: the raw material of the trace.
        "--output-format",
        "stream-json",
        "--verbose",
        "--json-schema",
        json.dumps(triage_schema()),
        "--system-prompt",
        system_prompt,
        # No built-in tools: no shell, no file edits, no web. Only ours.
        "--tools",
        "",
        "--mcp-config",
        str(config_path),
        "--strict-mcp-config",
        # Ours, by full name, pre-approved: a -p run has nobody to ask.
        "--allowedTools",
        ",".join(ALLOWED_TOOLS),
        "--no-session-persistence",
        "--model",
        model,
        "--max-turns",
        str(MAX_TURNS),
        "--max-budget-usd",
        f"{MAX_BUDGET_USD:.2f}",
    ]


class TokenWatch:
    """Counts tokens processed per assistant message and calls a halt past the cap.

    stream-json repeats a message's usage on each of its content blocks, so the count
    is kept per message id, not summed per event.
    """

    def __init__(self, cap: int = MAX_TOKENS) -> None:
        self.cap = cap
        self.by_message: dict[str, int] = {}

    @property
    def total(self) -> int:
        return sum(self.by_message.values())

    def __call__(self, event: Event) -> str | None:
        message = event.get("message")
        if event.get("type") != "assistant" or not isinstance(message, dict):
            return None
        usage = message.get("usage")
        if not isinstance(usage, dict):
            return None
        counted = sum(
            v
            for k in (
                "input_tokens",
                "cache_creation_input_tokens",
                "cache_read_input_tokens",
                "output_tokens",
            )
            if isinstance(v := usage.get(k), int)
        )
        self.by_message[str(message.get("id", len(self.by_message)))] = counted
        if self.total > self.cap:
            return f"token cap reached ({self.total:,} > {self.cap:,})"
        return None


@dataclass(frozen=True)
class StreamOutcome:
    # None when we stopped the process ourselves.
    exit_code: int | None
    events: list[Event]
    # Which of our limits stopped it, if one did.
    stopped: str | None
    stderr_tail: str


# (args, env, stdin, cwd, time limit, watch) → what happened. `watch` sees each event
# and returns a reason to stop, or None.
StreamRunner = Callable[
    [list[str], Mapping[str, str], str, Path, float, Callable[[Event], str | None]],
    StreamOutcome,
]


def run_streaming(
    args: list[str],
    env: Mapping[str, str],
    stdin: str,
    cwd: Path,
    time_limit: float,
    watch: Callable[[Event], str | None],
    executable: str | None = None,
) -> StreamOutcome:
    """The real `StreamRunner`: read events as they arrive, kill on a limit.

    `executable` stands in for `claude` in tests; in use it is always found on the
    PATH of `env`, the environment `preflight` vetted.
    """
    stderr_path = cwd.parent / "stderr.txt"
    with stderr_path.open("w", encoding="utf-8") as stderr:
        process = subprocess.Popen(
            [executable or find_claude(env), *args],
            env=dict(env),
            cwd=cwd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=stderr,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        lines: queue.Queue[str | None] = queue.Queue()

        def pump() -> None:
            assert process.stdout is not None
            for line in process.stdout:
                lines.put(line)
            lines.put(None)

        threading.Thread(target=pump, daemon=True).start()
        assert process.stdin is not None
        try:
            process.stdin.write(stdin)
            process.stdin.close()
        except OSError:
            pass  # it exited early; what it printed says why

        deadline = time.monotonic() + time_limit
        events: list[Event] = []
        stopped: str | None = None
        while True:
            remaining = deadline - time.monotonic()
            try:
                line = lines.get(timeout=max(remaining, 0))
            except queue.Empty:
                stopped = f"time limit reached ({time_limit:.0f}s)"
                break
            if line is None:
                break
            try:
                event: object = json.loads(line)
            except ValueError:
                continue
            if isinstance(event, dict):
                events.append(event)
                stopped = watch(event)
                if stopped:
                    break
        if stopped:
            process.kill()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
    tail = stderr_path.read_text(encoding="utf-8", errors="replace")[-500:]
    return StreamOutcome(
        exit_code=None if stopped else process.returncode,
        events=events,
        stopped=stopped,
        stderr_tail=tail.strip(),
    )


# Traces are committed to a public repository. The session's opening event describes
# the machine it ran on (paths, account and plugin details), so only the fields that
# explain the run are kept from it.
_INIT_FIELDS: Final = (
    "type",
    "subtype",
    "model",
    "tools",
    "mcp_servers",
    "claude_code_version",
)


def _public(event: Event) -> Event:
    if event.get("type") == "system" and event.get("subtype") == "init":
        return {k: event[k] for k in _INIT_FIELDS if k in event}
    return event


def ensure_commit(git: Git, sha: str) -> bool:
    """Make the failing commit available locally, fetching it from origin if needed.

    Dependabot branches are deleted after they merge or close, so their commits are
    often missing from a clone. GitHub keeps them under refs/pull/*, and a fetch by
    SHA retrieves one without changing any branch.
    """
    if git(["cat-file", "-e", f"{sha}^{{commit}}"])[0] == 0:
        return True
    git(["fetch", "--no-tags", "--quiet", "origin", sha])
    return git(["cat-file", "-e", f"{sha}^{{commit}}"])[0] == 0


def _record(
    case: FailedJob,
    triage: Triage,
    usage: Usage | None,
    fallback_reason: str | None,
) -> TriageRecord:
    return TriageRecord(
        case_id=case.case_id,
        prompt_version=AGENT_VERSION,
        source="agent" if fallback_reason is None else "rules",
        triage=triage,
        usage=usage,
        fallback_reason=fallback_reason,
    )


def _tokens_only(watch: TokenWatch, seconds: float) -> Usage:
    """What a run stopped without a result spent, as far as the stream showed it."""
    return Usage(
        model="unknown",
        input_tokens=watch.total,
        cache_creation_input_tokens=0,
        cache_read_input_tokens=0,
        output_tokens=0,
        cost_usd=0.0,
        duration_ms=int(seconds * 1000),
        num_turns=len(watch.by_message),
        attempts=1,
    )


@dataclass(frozen=True)
class Investigator:
    """Everything an investigation needs besides the case. One per evaluation."""

    env: Mapping[str, str]
    model: str
    repo: Path
    tracked: Collection[str]
    traces: Path
    git: Git
    context_for: Callable[[FailedJob], CaseContext]
    run: StreamRunner = run_streaming
    prompt: str = ""

    def trace_path(self, case_id: str) -> Path:
        return self.traces / AGENT_VERSION / f"{case_id}.jsonl"

    def __call__(self, case: FailedJob) -> TriageRecord:
        """Investigate one case. UsageLimitError and a fatal error propagate."""
        if not ensure_commit(self.git, case.head_sha):
            return _record(
                case,
                by_rules(case, self.tracked),
                None,
                f"commit {case.head_sha[:10]} is not available locally or on origin",
            )
        ctx = self.context_for(case)
        watch = TokenWatch()
        started = time.monotonic()
        with tempfile.TemporaryDirectory(prefix="ci-triage-agent-") as tmp:
            root = Path(tmp)
            work = root / "work"  # empty: nothing for claude -p to load (ADR 0006)
            work.mkdir()
            context_path = root / "context.json"
            config_path = root / "mcp.json"
            write_json(context_path, ctx.to_json())
            write_json(config_path, mcp_config(context_path, self.repo))
            outcome = self.run(
                agent_args(self.prompt or agent_prompt(), config_path, self.model),
                self.env,
                render_case(case),
                work,
                TIME_LIMIT_SECONDS,
                watch,
            )
        seconds = time.monotonic() - started

        result = next(
            (e for e in reversed(outcome.events) if e.get("type") == "result"), None
        )
        if result is None:
            reason = outcome.stopped or (
                f"claude exited {outcome.exit_code} without a result"
                + (f": {outcome.stderr_tail}" if outcome.stderr_tail else "")
            )
            record = _record(
                case, by_rules(case, self.tracked), _tokens_only(watch, seconds), reason
            )
        else:
            record = self._from_result(case, result)
        self._write_trace(case, outcome, record)
        return record

    def _from_result(self, case: FailedJob, result: Event) -> TriageRecord:
        usage = usage_of(result)
        kind = failure_kind(CallResult(0, json.dumps(result)))
        detail = f"subtype={result.get('subtype')}"
        if kind == "limit":
            raise UsageLimitError(
                "The Claude subscription's usage limit was reached during an "
                f"investigation; nothing was retried or rerouted. ({detail})"
            )
        if kind == "fatal":
            raise ClaudeCallError("fatal", f"{detail} {result.get('result')}", usage)
        if kind != "ok":
            return _record(
                case, by_rules(case, self.tracked), usage, f"{kind}: {detail}"
            )
        structured = result.get("structured_output")
        assert isinstance(structured, dict)  # failure_kind checked it
        try:
            triage = Triage.from_json(structured)
        except ValueError as invalid:
            return _record(
                case, by_rules(case, self.tracked), usage, f"invalid answer: {invalid}"
            )
        return _record(case, triage, usage, None)

    def _write_trace(
        self, case: FailedJob, outcome: StreamOutcome, record: TriageRecord
    ) -> None:
        """One JSON object per line: our header, each event as received, our verdict."""
        header: Event = {
            "type": "triage_trace",
            "case_id": case.case_id,
            "workflow": case.workflow,
            "job": case.job,
            "branch": case.branch,
            "version": AGENT_VERSION,
            "model": self.model,
            "recorded_at": datetime.now(UTC).isoformat(timespec="seconds"),
            "limits": {
                "max_turns": MAX_TURNS,
                "time_limit_seconds": TIME_LIMIT_SECONDS,
                "max_budget_usd": MAX_BUDGET_USD,
                "max_tokens": MAX_TOKENS,
            },
        }
        footer: Event = {
            "type": "triage_outcome",
            "source": record.source,
            "category": record.triage.category.value,
            "fallback_reason": record.fallback_reason,
            "stopped_by": outcome.stopped,
            "exit_code": outcome.exit_code,
        }
        path = self.trace_path(case.case_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        events = [_public(event) for event in outcome.events]
        with path.open("w", encoding="utf-8", newline="\n") as handle:
            for event in (header, *events, footer):
                handle.write(
                    json.dumps(event, ensure_ascii=False, sort_keys=True) + "\n"
                )
