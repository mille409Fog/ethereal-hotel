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
"""

import json
import shutil
import subprocess
from collections.abc import Callable, Mapping
from typing import Final

from ci_triage.billing_guard import BillingRisk, find_billing_risks

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


def run_claude(args: list[str], env: Mapping[str, str]) -> tuple[int, str]:
    """The real `Runner`: find `claude` on the PATH in `env`, run it, capture stdout."""
    path = next((v for k, v in env.items() if k.upper() == "PATH"), None)
    executable = shutil.which("claude", path=path)
    if executable is None:
        raise FileNotFoundError("claude is not on the PATH")
    completed = subprocess.run(
        [executable, *args],
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
