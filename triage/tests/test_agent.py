"""The investigation: limits, outcomes, the trace, and the stream reader itself."""

import json
import os
import sys
from collections.abc import Callable, Mapping
from pathlib import Path

import pytest
from fakes import make_case

from ci_triage import agent
from ci_triage.agent import (
    ALLOWED_TOOLS,
    MAX_TURNS,
    Event,
    Investigator,
    StreamOutcome,
    TokenWatch,
    agent_args,
    ensure_commit,
    mcp_config,
    run_streaming,
)
from ci_triage.claude_cli import ClaudeCallError, UsageLimitError
from ci_triage.models import Category
from ci_triage.tools import CaseContext
from ci_triage.trace import read_trace

CASE = make_case(text="Unlocking the lobby… Timeout 20000ms")
CTX = CaseContext(
    sha=CASE.head_sha,
    workflow=CASE.workflow,
    job=CASE.job,
    branch=CASE.branch,
    created_at=CASE.created_at,
    history={},
    earlier=(),
)

ANSWER = {
    "category": "threshold",
    "hypothesis": "The lobby missed LOBBY_TIMEOUT; it was failing on development too.",
    "evidence": ["Timeout 20000ms"],
    "suggested_files": ["e2e/support/lobby.ts"],
    "fix_rationale": "The budget is defined there.",
    "confidence": "high",
}


def assistant(message_id: str, *blocks: Event, tokens: int = 1000) -> Event:
    return {
        "type": "assistant",
        "message": {
            "id": message_id,
            "content": list(blocks),
            "usage": {"input_tokens": tokens, "output_tokens": 10},
        },
    }


def result(
    subtype: str = "success", structured: object = ANSWER, **extra: object
) -> Event:
    event: Event = {
        "type": "result",
        "subtype": subtype,
        "is_error": subtype != "success",
        "num_turns": 4,
        "duration_ms": 30_000,
        "total_cost_usd": 0.09,
        "usage": {"input_tokens": 100, "output_tokens": 400},
        "modelUsage": {"claude-sonnet-5-5": {}},
        **extra,
    }
    if structured is not None:
        event["structured_output"] = structured
    return event


INIT: Event = {
    "type": "system",
    "subtype": "init",
    "model": "claude-sonnet-5-5",
    "tools": [*ALLOWED_TOOLS, "StructuredOutput"],
    "cwd": "C:/Users/someone/private/path",
    "session_id": "secret-ish",
}

TOOL_CALL = assistant(
    "m1",
    {"type": "text", "text": "Check whether development was already failing."},
    {
        "type": "tool_use",
        "id": "t1",
        "name": "mcp__triage__job_history",
        "input": {"branch": "development-alpha"},
    },
)
TOOL_RESULT: Event = {
    "type": "user",
    "message": {
        "content": [
            {
                "type": "tool_result",
                "tool_use_id": "t1",
                "content": [{"type": "text", "text": "job failure, run failure"}],
            }
        ]
    },
}


class FakeStream:
    def __init__(self, outcome: StreamOutcome) -> None:
        self.outcome = outcome
        self.calls: list[tuple[list[str], str, Path]] = []

    def __call__(
        self,
        args: list[str],
        env: Mapping[str, str],
        stdin: str,
        cwd: Path,
        time_limit: float,
        watch: Callable[[Event], str | None],
    ) -> StreamOutcome:
        self.calls.append((args, stdin, cwd))
        # The working directory must be empty: nothing for claude -p to load.
        assert list(cwd.iterdir()) == []
        for event in self.outcome.events:
            watch(event)
        return self.outcome


def ok_git(args: list[str]) -> tuple[int, str, str]:
    return 0, "", ""


def investigator(
    tmp_path: Path,
    stream: FakeStream,
    git: Callable[[list[str]], tuple[int, str, str]] = ok_git,
) -> Investigator:
    return Investigator(
        env={"PATH": "/bin"},
        model="sonnet",
        repo=tmp_path,
        tracked={"e2e/support/lobby.ts"},
        traces=tmp_path / "traces",
        git=git,
        context_for=lambda case: CTX,
        run=stream,
        prompt="system",
    )


def outcome(
    *events: Event, code: int | None = 0, stopped: str | None = None
) -> StreamOutcome:
    return StreamOutcome(code, list(events), stopped, "")


# --- the arguments ---------------------------------------------------------------


def test_the_agent_gets_only_our_tools_and_every_limit(tmp_path: Path) -> None:
    args = agent_args("system", tmp_path / "mcp.json", "sonnet")
    assert args[0] == "-p"
    assert "--bare" not in args
    assert "--strict-mcp-config" in args and "--verbose" in args
    assert args[args.index("--tools") + 1] == ""
    assert args[args.index("--allowedTools") + 1] == ",".join(ALLOWED_TOOLS)
    assert args[args.index("--max-turns") + 1] == str(MAX_TURNS)
    assert args[args.index("--max-budget-usd") + 1] == "0.30"
    assert args[args.index("--output-format") + 1] == "stream-json"
    assert all(t.startswith("mcp__triage__") for t in ALLOWED_TOOLS)


def test_the_mcp_config_starts_our_server_with_this_python(tmp_path: Path) -> None:
    server = mcp_config(tmp_path / "c.json", tmp_path)["mcpServers"]["triage"]  # type: ignore[index]
    assert server["command"] == sys.executable
    assert server["args"][0].endswith("mcp_server.py")


# --- outcomes --------------------------------------------------------------------


def test_an_answer_becomes_an_agent_record_with_a_trace(tmp_path: Path) -> None:
    stream = FakeStream(outcome(INIT, TOOL_CALL, TOOL_RESULT, result()))
    record = investigator(tmp_path, stream)(CASE)

    assert record.source == "agent"
    assert record.triage.category is Category.THRESHOLD
    assert record.usage is not None and record.usage.cost_usd == 0.09
    _, stdin, _ = stream.calls[0]
    assert stdin.startswith("<job>")

    trace = read_trace(
        (tmp_path / "traces" / agent.AGENT_VERSION / f"{CASE.case_id}.jsonl")
        .read_text(encoding="utf-8")
        .splitlines()
    )
    assert trace[0]["type"] == "triage_trace"
    assert trace[0]["limits"]["max_turns"] == MAX_TURNS  # type: ignore[index]
    assert trace[-1] == {
        "type": "triage_outcome",
        "source": "agent",
        "category": "threshold",
        "fallback_reason": None,
        "stopped_by": None,
        "exit_code": 0,
    }
    # The init event is cut to what explains the run; the machine's details are not.
    init = trace[1]
    assert "cwd" not in init and "session_id" not in init
    assert init["tools"] == INIT["tools"]


@pytest.mark.parametrize(
    ("final", "reason"),
    [
        (result("error_max_turns", None), "invalid: subtype=error_max_turns"),
        (result("error_max_budget_usd", None), "invalid: subtype=error_max_budget_usd"),
        (result(structured={**ANSWER, "category": "gremlins"}), "invalid answer"),
    ],
)
def test_no_usable_answer_falls_back_to_rules(
    tmp_path: Path, final: Event, reason: str
) -> None:
    record = investigator(tmp_path, FakeStream(outcome(TOOL_CALL, final)))(CASE)
    assert record.source == "rules"
    assert record.fallback_reason is not None and reason in record.fallback_reason


def test_a_run_we_stopped_falls_back_and_says_which_limit(tmp_path: Path) -> None:
    stopped = outcome(TOOL_CALL, code=None, stopped="time limit reached (120s)")
    record = investigator(tmp_path, FakeStream(stopped))(CASE)
    assert record.source == "rules"
    assert record.fallback_reason == "time limit reached (120s)"
    # With no result event, all that is known is what the stream showed: every token
    # processed (1000 in, 10 out), recorded as input because it cannot be split.
    assert record.usage is not None and record.usage.input_tokens == 1010


def test_the_limit_and_a_fatal_error_propagate(tmp_path: Path) -> None:
    limit = result("error", None, api_error_status=429)
    with pytest.raises(UsageLimitError):
        investigator(tmp_path, FakeStream(outcome(limit)))(CASE)
    fatal = result("error", None, api_error_status=401)
    with pytest.raises(ClaudeCallError):
        investigator(tmp_path, FakeStream(outcome(fatal)))(CASE)


def test_a_missing_commit_falls_back_without_spending_anything(tmp_path: Path) -> None:
    def missing(args: list[str]) -> tuple[int, str, str]:
        return 1, "", "not found"

    stream = FakeStream(outcome(result()))
    record = investigator(tmp_path, stream, missing)(CASE)
    assert record.source == "rules"
    assert "not available" in (record.fallback_reason or "")
    assert stream.calls == []


def test_ensure_commit_fetches_only_when_the_commit_is_missing() -> None:
    calls: list[list[str]] = []
    present = iter([1, 0])

    def git(args: list[str]) -> tuple[int, str, str]:
        calls.append(args)
        return (next(present) if args[0] == "cat-file" else 0), "", ""

    assert ensure_commit(git, "abc")
    assert [c[0] for c in calls] == ["cat-file", "fetch", "cat-file"]


# --- the token watch -------------------------------------------------------------


def test_the_token_watch_counts_each_message_once_and_halts_past_the_cap() -> None:
    watch = TokenWatch(cap=2500)
    # One message, two content blocks: the same usage arrives twice.
    assert watch(assistant("a", tokens=1000)) is None
    assert watch(assistant("a", tokens=1000)) is None
    assert watch.total == 1010
    assert watch(assistant("b", tokens=1000)) is None
    reason = watch(assistant("c", tokens=1000))
    assert reason is not None and "token cap" in reason
    assert watch({"type": "user"}) is None


# --- the stream reader, against a real process -----------------------------------

_EMIT_THEN_HANG = """
import json, sys, time
sys.stdin.read()
print(json.dumps({"type": "system", "subtype": "init"}), flush=True)
print("not json", flush=True)
time.sleep(30)
"""

_EMIT_AND_EXIT = """
import json, sys
sys.stdin.read()
for n in range(3):
    print(json.dumps({"type": "assistant", "message": {"id": str(n),
          "usage": {"input_tokens": 400}}}), flush=True)
print(json.dumps({"type": "result", "subtype": "success"}), flush=True)
"""


def _stream(tmp_path: Path, code: str, limit: float, cap: int) -> StreamOutcome:
    work = tmp_path / "work"
    work.mkdir()
    return run_streaming(
        ["-c", code],
        os.environ,
        "the case",
        work,
        limit,
        TokenWatch(cap),
        sys.executable,
    )


def test_the_time_limit_kills_a_run_that_hangs(tmp_path: Path) -> None:
    got = _stream(tmp_path, _EMIT_THEN_HANG, limit=3, cap=10_000)
    assert got.stopped == "time limit reached (3s)"
    assert got.exit_code is None
    assert [e["type"] for e in got.events] == ["system"]


def test_the_token_cap_kills_a_run_mid_stream(tmp_path: Path) -> None:
    got = _stream(tmp_path, _EMIT_AND_EXIT, limit=30, cap=1000)
    assert got.stopped is not None and "token cap" in got.stopped
    assert len(got.events) == 3


def test_a_run_inside_its_limits_ends_on_its_own(tmp_path: Path) -> None:
    got = _stream(tmp_path, _EMIT_AND_EXIT, limit=30, cap=10_000)
    assert got.stopped is None
    assert got.exit_code == 0
    assert got.events[-1]["type"] == "result"


def test_events_are_json_lines_in_the_trace(tmp_path: Path) -> None:
    stream = FakeStream(outcome(TOOL_CALL, result()))
    inv = investigator(tmp_path, stream)
    inv(CASE)
    for line in inv.trace_path(CASE.case_id).read_text(encoding="utf-8").splitlines():
        json.loads(line)
