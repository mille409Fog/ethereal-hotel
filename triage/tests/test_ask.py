"""The model call: what each outcome of a `claude -p` process leads to.

The envelopes here copy the shape of a real `--output-format json` result, recorded
on 2026-10-15 (Claude Code 2.1.300). The error envelopes are built from the same
fields; a real usage-limit result cannot be recorded without spending a limit.
"""

import json
import subprocess
from collections.abc import Mapping

import pytest

from ci_triage.claude_cli import (
    MAX_ATTEMPTS,
    MAX_TURNS,
    Answer,
    CallResult,
    ClaudeCallError,
    UsageLimitError,
    ask,
    failure_kind,
    prompt_args,
)


def envelope(
    subtype: str = "success",
    is_error: bool = False,
    structured: object = None,
    status: int | None = None,
    result: str = "",
    cost: float = 0.01,
) -> str:
    data: dict[str, object] = {
        "type": "result",
        "subtype": subtype,
        "is_error": is_error,
        "api_error_status": status,
        "result": result,
        "num_turns": 2,
        "duration_ms": 1500,
        "total_cost_usd": cost,
        "usage": {
            "input_tokens": 10,
            "cache_creation_input_tokens": 100,
            "cache_read_input_tokens": 1000,
            "output_tokens": 50,
        },
        "modelUsage": {"claude-sonnet-5-5": {"costUSD": cost}},
    }
    if structured is not None:
        data["structured_output"] = structured
    return json.dumps(data)


OK = envelope(structured={"answer": "ok"})


# --- failure_kind ----------------------------------------------------------------


@pytest.mark.parametrize(
    ("result", "kind"),
    [
        (CallResult(0, OK), "ok"),
        # A success with nothing structured in it gave us no answer to use.
        (CallResult(0, envelope()), "invalid"),
        (CallResult(0, envelope(structured=["not", "an", "object"])), "invalid"),
        # Timeouts and crashes are transient.
        (CallResult(None, ""), "retry"),
        (CallResult(1, ""), "retry"),
        (CallResult(1, "Segmentation fault"), "retry"),
        (CallResult(0, "[]"), "retry"),
        # The limit, by status or by Claude Code's wording.
        (CallResult(1, envelope("error", True, status=429)), "limit"),
        (
            CallResult(
                1, envelope("error", True, result="You've hit your session limit")
            ),
            "limit",
        ),
        (
            CallResult(
                1, envelope("error", True, result="You've hit your Sonnet limit")
            ),
            "limit",
        ),
        # Our setup is broken.
        (CallResult(1, envelope("error", True, status=401)), "fatal"),
        (CallResult(1, envelope("error", True, status=403)), "fatal"),
        (CallResult(1, envelope("error", True, status=400)), "fatal"),
        # Their side, transiently.
        (CallResult(1, envelope("error", True, status=500)), "retry"),
        (CallResult(1, envelope("error", True, status=529)), "retry"),
        (CallResult(1, envelope("error_during_execution", True)), "retry"),
        # The model ran and could not answer.
        (CallResult(1, envelope("error_max_turns", True)), "invalid"),
        (CallResult(1, envelope("error_max_budget_usd", True)), "invalid"),
        (
            CallResult(1, envelope("error_max_structured_output_retries", True)),
            "invalid",
        ),
        # Anything unrecognised stops rather than loops.
        (CallResult(1, envelope("something_new", True)), "fatal"),
    ],
)
def test_failure_kind(result: CallResult, kind: str) -> None:
    assert failure_kind(result) == kind


def test_a_successful_answer_that_mentions_a_limit_is_still_a_success() -> None:
    said = envelope(structured={"hypothesis": "hit your session limit"}, result="x")
    assert failure_kind(CallResult(0, said)) == "ok"


def test_a_true_status_is_not_a_status_code() -> None:
    # bool is an int in Python; `true` must not read as an error status >= 500.
    raw = json.loads(envelope("weird", True))
    raw["api_error_status"] = True
    assert failure_kind(CallResult(1, json.dumps(raw))) == "fatal"


# --- the arguments ---------------------------------------------------------------


def test_every_call_is_locked_down() -> None:
    args = prompt_args("system", {"type": "object"}, "sonnet")
    assert args[:2] == ["-p", args[1]]
    pairs = dict(zip(args[2::2], args[3::2], strict=False))
    assert pairs["--output-format"] == "json"
    assert pairs["--tools"] == ""
    assert pairs["--system-prompt"] == "system"
    assert pairs["--model"] == "sonnet"
    assert pairs["--max-turns"] == str(MAX_TURNS)
    assert json.loads(pairs["--json-schema"]) == {"type": "object"}
    assert "--strict-mcp-config" in args
    assert "--no-session-persistence" in args
    assert "--bare" not in args


def test_structured_output_needs_more_than_one_turn() -> None:
    # Measured: a structured answer is delivered by a tool call and takes two turns.
    assert MAX_TURNS >= 2


# --- ask -------------------------------------------------------------------------


class ScriptedClaude:
    """Plays back one outcome per call: a (code, stdout) pair or an exception."""

    def __init__(self, *outcomes: tuple[int, str] | BaseException) -> None:
        self.outcomes = list(outcomes)
        self.calls: list[tuple[list[str], dict[str, str], str, float]] = []

    def __call__(
        self, args: list[str], env: Mapping[str, str], stdin: str, timeout: float
    ) -> tuple[int, str]:
        self.calls.append((args, dict(env), stdin, timeout))
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome


def call(claude: ScriptedClaude, slept: list[float] | None = None) -> Answer:
    naps = slept if slept is not None else []
    return ask(
        "system",
        "the case",
        {"type": "object"},
        env={"PATH": "/bin"},
        model="sonnet",
        run=claude,
        sleep=naps.append,
    )


def test_a_clean_answer_comes_back_with_its_usage() -> None:
    claude = ScriptedClaude((0, OK))
    answer = call(claude)
    assert answer.structured == {"answer": "ok"}
    usage = answer.usage
    assert (usage.model, usage.attempts, usage.cost_usd) == (
        "claude-sonnet-5-5",
        1,
        0.01,
    )
    assert (usage.cache_read_input_tokens, usage.output_tokens) == (1000, 50)
    _, env, stdin, _ = claude.calls[0]
    assert env == {"PATH": "/bin"}
    assert stdin == "the case"


def test_transient_failures_are_retried_with_doubling_backoff() -> None:
    timeout = subprocess.TimeoutExpired(["claude"], 120)
    claude = ScriptedClaude(
        timeout, (1, ""), (0, envelope(structured={"a": 1}, cost=0.02))
    )
    slept: list[float] = []
    answer = call(claude, slept)
    assert answer.structured == {"a": 1}
    assert slept == [2.0, 4.0]
    # Every attempt is counted, and the failed ones spent nothing measurable.
    assert answer.usage.attempts == 3
    assert answer.usage.cost_usd == 0.02


def test_retries_give_up_after_the_last_attempt() -> None:
    claude = ScriptedClaude(*[(1, "")] * MAX_ATTEMPTS)
    with pytest.raises(ClaudeCallError) as failure:
        call(claude)
    assert failure.value.kind == "retry"
    assert len(claude.calls) == MAX_ATTEMPTS


def test_the_limit_stops_at_once_and_is_never_retried() -> None:
    claude = ScriptedClaude((1, envelope("error", True, status=429)), (0, OK))
    slept: list[float] = []
    with pytest.raises(UsageLimitError, match="usage limit was reached"):
        call(claude, slept)
    assert len(claude.calls) == 1
    assert slept == []


@pytest.mark.parametrize(
    ("stdout", "kind"),
    [
        (envelope("error", True, status=401), "fatal"),
        (envelope("error_max_turns", True, cost=0.03), "invalid"),
    ],
)
def test_invalid_and_fatal_are_not_retried(stdout: str, kind: str) -> None:
    claude = ScriptedClaude((1, stdout), (0, OK))
    with pytest.raises(ClaudeCallError) as failure:
        call(claude)
    assert failure.value.kind == kind
    assert len(claude.calls) == 1


def test_an_invalid_answer_still_reports_what_it_spent() -> None:
    claude = ScriptedClaude((1, envelope("error_max_turns", True, cost=0.03)))
    with pytest.raises(ClaudeCallError) as failure:
        call(claude)
    assert failure.value.usage is not None
    assert failure.value.usage.cost_usd == 0.03
