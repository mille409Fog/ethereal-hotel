"""The only way this package starts a `claude` process.

Model access goes through headless Claude Code (`claude -p`) on the maintainer's
Claude Pro subscription; ADR 0001 explains why it is not the API. That makes each
`claude` process a place money could leak, so starting one is guarded in three layers:

1. `child_env` builds the subprocess's environment from an allowlist. A key in the
   parent environment that nobody listed never reaches `claude`.
2. `preflight` asks `claude auth status`, under that same environment, which
   credential it would use. This is the only layer that sees what the environment
   cannot show: an `apiKeyHelper` in a settings file, or a stored Console login.
3. `find_billing_risks` (billing_guard.py) judges both, and any risk is a refusal.

The fourth layer is outside the code: "Extra usage" is off on the account, so even a
run that got past all three would stop at the plan's limits instead of being billed.

`--bare` must never be passed to `claude`. Bare mode does not read
`CLAUDE_CODE_OAUTH_TOKEN`, so in CI it would fall through to whatever key it found.

The second half is the model call itself, `ask`: one prompt in, schema-checked JSON and
its `Usage` out, with retries for what is transient and a hard stop for what is not.
`failure_kind` is the rule between the two. When the subscription's limit is reached
the run stops and says so; nothing here knows any other way to reach a model.
"""

import json
import re
import shutil
import subprocess
import tempfile
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Final, Literal

from ci_triage.billing_guard import BillingRisk, find_billing_risks
from ci_triage.models import JsonObject, Usage

# What a `claude` subprocess needs to find itself, its configuration and its login, on
# Windows and on Linux CI. Matched case-insensitively because Windows environment
# names are. Anything not listed is dropped, so a variable added to the parent
# environment tomorrow is excluded by default rather than inherited.
CHILD_ENV_ALLOWLIST: Final = frozenset(
    {
        # Locating executables and the OS.
        "PATH",
        "PATHEXT",
        "SYSTEMROOT",
        "SYSTEMDRIVE",
        "WINDIR",
        "COMSPEC",
        # Locating the user's home, config and temp directories.
        "HOME",
        "USERPROFILE",
        "HOMEDRIVE",
        "HOMEPATH",
        "APPDATA",
        "LOCALAPPDATA",
        "XDG_CONFIG_HOME",
        "TEMP",
        "TMP",
        "TMPDIR",
        "LANG",
        "LC_ALL",
        # Claude Code's own: where its config lives, the subscription token CI uses,
        # and the Git Bash it needs on Windows.
        "CLAUDE_CONFIG_DIR",
        "CLAUDE_CODE_OAUTH_TOKEN",
        "CLAUDE_CODE_GIT_BASH_PATH",
    }
)

AUTH_STATUS_TIMEOUT_SECONDS: Final = 30

# Runs `claude <args>` under an environment and returns (exit code, stdout). Injected
# so tests can stand in for the real CLI without one installed.
Runner = Callable[[list[str], Mapping[str, str]], tuple[int, str]]


class BillingRiskError(RuntimeError):
    """Raised instead of starting `claude` when any billing risk was found."""

    def __init__(self, risks: list[BillingRisk]) -> None:
        self.risks = tuple(risks)
        lines = [f"  - [{risk.source}] {risk.name}: {risk.reason}" for risk in risks]
        super().__init__(
            "Refusing to start claude: it could be billed outside the subscription.\n"
            + "\n".join(lines)
        )


def child_env(parent: Mapping[str, str]) -> dict[str, str]:
    """The environment a `claude` subprocess receives: `parent` cut to the allowlist."""
    return {
        name: value
        for name, value in parent.items()
        if name.upper() in CHILD_ENV_ALLOWLIST
    }


def find_claude(env: Mapping[str, str]) -> str:
    """The `claude` executable on the PATH in `env`, the environment it will run in."""
    path = next((v for k, v in env.items() if k.upper() == "PATH"), None)
    executable = shutil.which("claude", path=path)
    if executable is None:
        raise FileNotFoundError("claude is not on the PATH")
    return executable


def run_claude(args: list[str], env: Mapping[str, str]) -> tuple[int, str]:
    """The real `Runner`: find `claude` on the PATH in `env`, run it, capture stdout."""
    completed = subprocess.run(
        [find_claude(env), *args],
        env=dict(env),
        capture_output=True,
        text=True,
        timeout=AUTH_STATUS_TIMEOUT_SECONDS,
        check=False,
    )
    return completed.returncode, completed.stdout


def read_auth_status(
    env: Mapping[str, str], run: Runner = run_claude
) -> Mapping[str, object] | None:
    """Parse `claude auth status` run under `env`, or None if anything went wrong.

    None is the fail-closed answer: the guard treats an unreadable status as a risk. A
    missing CLI, a timeout, a non-zero exit (which the CLI uses for "not logged in"),
    output that is not JSON, and JSON that is not an object all land here.
    """
    try:
        code, stdout = run(["auth", "status"], env)
    except (OSError, subprocess.SubprocessError):
        return None
    if code != 0:
        return None
    try:
        parsed: object = json.loads(stdout)
    except ValueError:
        return None
    return parsed if isinstance(parsed, dict) else None


def preflight(
    parent_env: Mapping[str, str], run: Runner = run_claude
) -> dict[str, str]:
    """Vet everything that decides who pays; return the environment to run `claude` in.

    Raises BillingRiskError if `find_billing_risks` reports anything. Callers must
    start `claude` with exactly the returned mapping. Passing `os.environ` instead
    would undo the allowlist.
    """
    env = child_env(parent_env)
    risks = find_billing_risks(parent_env, read_auth_status(env, run))
    if risks:
        raise BillingRiskError(risks)
    return env


# --- the model call --------------------------------------------------------------

# The brief's budget for a whole triage. One call that takes longer has failed.
PROMPT_TIMEOUT_SECONDS: Final = 120
MAX_ATTEMPTS: Final = 3
# Doubles per retry: 2s, then 4s. Claude Code already retries API throttling itself,
# so these cover the process: a timeout, or a crash before it printed a result.
BACKOFF_SECONDS: Final = 2.0
# Structured output comes back through an internal tool call, which costs a turn: a
# one-word answer measured num_turns 2 (2026-10-15). The cap leaves one turn of slack
# and is the only thing between a confused run and an open-ended one.
MAX_TURNS: Final = 3

# What the argument list carries. The case itself goes on stdin, which has no
# command-line length limit on Windows.
TASK: Final = "Triage the failed CI job described on stdin."

# Claude Code's wording when the plan's limit is reached: "You've hit your session
# limit · resets 3:45pm", and the weekly and per-model variants.
_LIMIT_TEXT = re.compile(r"hit your \w+ limit|usage limit", re.IGNORECASE)

Outcome = Literal["ok", "retry", "limit", "invalid", "fatal"]


@dataclass(frozen=True)
class CallResult:
    """What one `claude -p` process left behind."""

    # None when the process timed out, so there is no exit code to report.
    exit_code: int | None
    stdout: str

    def envelope(self) -> JsonObject | None:
        """The `--output-format json` result object, or None if stdout is not one."""
        try:
            parsed: object = json.loads(self.stdout)
        except ValueError:
            return None
        return parsed if isinstance(parsed, dict) else None


def failure_kind(result: CallResult) -> Outcome:
    """Decide what happens after one call: use it, retry it, or stop.

    - ok:      a successful run that returned structured output.
    - retry:   transient. A timeout, a process that died before printing its result,
               a server error, or an error mid-run.
    - limit:   the subscription's limit. Never retried and never routed elsewhere: the
               run stops and says so (brief, §Cost ceiling). Claude Code has already
               retried ordinary throttling, so a 429 that reaches us is final.
    - invalid: the model ran but gave no usable answer: out of turns, or it could not
               produce output matching the schema. The caller falls back to rules.
    - fatal:   our side is broken (auth, a bad request). Retrying would repeat it.

    A successful run is judged before any error text is read, because `result` is
    the model's own words, and a triage may well mention a "usage limit".
    """
    if result.exit_code is None:
        return "retry"
    envelope = result.envelope()
    if envelope is None:
        return "retry"
    subtype = envelope.get("subtype")
    if subtype == "success" and envelope.get("is_error") is False:
        return (
            "ok" if isinstance(envelope.get("structured_output"), dict) else "invalid"
        )

    status = envelope.get("api_error_status")
    text = envelope.get("result")
    if status == 429 or (isinstance(text, str) and _LIMIT_TEXT.search(text)):
        return "limit"
    if status in (401, 403):
        return "fatal"
    if isinstance(status, int) and not isinstance(status, bool) and status >= 500:
        return "retry"
    if subtype in (
        "error_max_turns",
        "error_max_budget_usd",
        "error_max_structured_output_retries",
    ):
        return "invalid"
    if subtype == "error_during_execution":
        return "retry"
    return "fatal"


class UsageLimitError(RuntimeError):
    """The subscription's limit was reached. Stop; try again after it resets."""


class ClaudeCallError(RuntimeError):
    """A call that produced no usable answer, after any retries it was due."""

    def __init__(self, kind: Outcome, detail: str, usage: Usage | None) -> None:
        self.kind = kind
        self.usage = usage
        super().__init__(f"{kind}: {detail}")


@dataclass(frozen=True)
class Answer:
    structured: JsonObject
    usage: Usage


# Runs `claude <args>` under an environment with `stdin` as input and a timeout, and
# returns (exit code, stdout). Raises subprocess.TimeoutExpired on a timeout.
PromptRunner = Callable[[list[str], Mapping[str, str], str, float], tuple[int, str]]
Sleep = Callable[[float], None]


def run_prompt(
    args: list[str], env: Mapping[str, str], stdin: str, timeout: float
) -> tuple[int, str]:
    """The real `PromptRunner`. Runs in a fresh empty directory, always.

    Without `--bare` (which is banned, see above) `claude -p` loads the hooks,
    `.mcp.json` and `CLAUDE.md` of the directory it starts in. Started in this
    repository it would read `CLAUDE.md` §Traps, which is close to the answer key, and
    run whatever the project configures. An empty directory gives it nothing.
    """
    with tempfile.TemporaryDirectory(prefix="ci-triage-") as cwd:
        completed = subprocess.run(
            [find_claude(env), *args],
            env=dict(env),
            cwd=cwd,
            input=stdin,
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=timeout,
            check=False,
        )
    return completed.returncode, completed.stdout


def prompt_args(system_prompt: str, schema: JsonObject, model: str) -> list[str]:
    """The flags for one triage call. Each one closes a door; none may be dropped."""
    return [
        "-p",
        TASK,
        "--output-format",
        "json",
        "--json-schema",
        json.dumps(schema),
        # Replaces Claude Code's own coding-agent prompt rather than adding to it.
        "--system-prompt",
        system_prompt,
        # No built-in tools: this is a single call, not an agent (ADR 0001).
        "--tools",
        "",
        # No MCP servers but ones we name, and we name none.
        "--strict-mcp-config",
        "--no-session-persistence",
        "--model",
        model,
        "--max-turns",
        str(MAX_TURNS),
    ]


def _int_field(data: Mapping[str, object], key: str) -> int:
    value = data.get(key)
    return value if isinstance(value, int) and not isinstance(value, bool) else 0


def usage_of(envelope: JsonObject) -> Usage:
    """What one call's envelope says it spent. Missing fields count as zero."""
    usage = envelope.get("usage")
    tokens: Mapping[str, object] = usage if isinstance(usage, dict) else {}
    models = envelope.get("modelUsage")
    cost = envelope.get("total_cost_usd")
    return Usage(
        model=next(iter(models), "unknown") if isinstance(models, dict) else "unknown",
        input_tokens=_int_field(tokens, "input_tokens"),
        cache_creation_input_tokens=_int_field(tokens, "cache_creation_input_tokens"),
        cache_read_input_tokens=_int_field(tokens, "cache_read_input_tokens"),
        output_tokens=_int_field(tokens, "output_tokens"),
        cost_usd=float(cost) if isinstance(cost, int | float) else 0.0,
        duration_ms=_int_field(envelope, "duration_ms"),
        num_turns=_int_field(envelope, "num_turns"),
        attempts=1,
    )


def _add(total: Usage | None, more: Usage) -> Usage:
    if total is None:
        return more
    return Usage(
        model=more.model if more.model != "unknown" else total.model,
        input_tokens=total.input_tokens + more.input_tokens,
        cache_creation_input_tokens=total.cache_creation_input_tokens
        + more.cache_creation_input_tokens,
        cache_read_input_tokens=total.cache_read_input_tokens
        + more.cache_read_input_tokens,
        output_tokens=total.output_tokens + more.output_tokens,
        cost_usd=total.cost_usd + more.cost_usd,
        duration_ms=total.duration_ms + more.duration_ms,
        num_turns=total.num_turns + more.num_turns,
        attempts=total.attempts + more.attempts,
    )


def _detail(result: CallResult) -> str:
    envelope = result.envelope()
    if result.exit_code is None:
        return f"timed out after {PROMPT_TIMEOUT_SECONDS}s"
    if envelope is None:
        return f"exit {result.exit_code}, no JSON result on stdout"
    text = envelope.get("result")
    said = text[:300] if isinstance(text, str) else ""
    subtype, status = envelope.get("subtype"), envelope.get("api_error_status")
    return f"subtype={subtype} status={status} {said}".strip()


def ask(
    system_prompt: str,
    user_prompt: str,
    schema: JsonObject,
    *,
    env: Mapping[str, str],
    model: str,
    run: PromptRunner = run_prompt,
    sleep: Sleep = time.sleep,
) -> Answer:
    """One model call: the answer as JSON matching `schema`, and what it spent.

    `env` must be what `preflight` returned. Raises UsageLimitError at the plan's
    limit and ClaudeCallError for anything else that left no usable answer. Usage is
    summed over every attempt, failed ones included, because they spent quota too.
    """
    args = prompt_args(system_prompt, schema, model)
    spent: Usage | None = None
    last = CallResult(None, "")
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            code, stdout = run(args, env, user_prompt, PROMPT_TIMEOUT_SECONDS)
            last = CallResult(code, stdout)
        except subprocess.TimeoutExpired:
            last = CallResult(None, "")
        envelope = last.envelope()
        spent = _add(
            spent,
            usage_of(envelope) if envelope is not None else usage_of({}),
        )

        kind = failure_kind(last)
        if kind == "ok" and envelope is not None:
            structured = envelope["structured_output"]
            assert isinstance(structured, dict)  # failure_kind checked it
            return Answer(structured, spent)
        if kind == "limit":
            raise UsageLimitError(
                "The Claude subscription's usage limit was reached; nothing was "
                f"retried or rerouted. Run again after it resets. ({_detail(last)})"
            )
        if kind in ("invalid", "fatal"):
            raise ClaudeCallError(kind, _detail(last), spent)
        if attempt < MAX_ATTEMPTS:
            sleep(BACKOFF_SECONDS * 2 ** (attempt - 1))
    raise ClaudeCallError(
        "retry", f"gave up after {MAX_ATTEMPTS} attempts: {_detail(last)}", spent
    )
