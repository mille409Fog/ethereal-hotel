"""The plumbing around the billing guard: what reaches `claude`, and what stops it.

Most of these replace `find_billing_risks` with a stand-in, so they test the wiring
independently of the guard's own rules. The `end to end` section uses the real guard.
"""

import json
import subprocess
from collections.abc import Mapping

import pytest

import cli
from ci_triage import claude_cli
from ci_triage.billing_guard import BILLING_ENV_VARS, BillingRisk
from ci_triage.claude_cli import (
    CHILD_ENV_ALLOWLIST,
    BillingRiskError,
    child_env,
    preflight,
    read_auth_status,
)

SUBSCRIPTION = json.dumps({"loggedIn": True, "authMethod": "claude.ai"})


class FakeClaude:
    """Stands in for the `claude` CLI and records every call made to it."""

    def __init__(self, code: int = 0, stdout: str = SUBSCRIPTION) -> None:
        self.code = code
        self.stdout = stdout
        self.calls: list[tuple[list[str], dict[str, str]]] = []

    def __call__(self, args: list[str], env: Mapping[str, str]) -> tuple[int, str]:
        self.calls.append((args, dict(env)))
        return self.code, self.stdout


def raising(error: BaseException) -> claude_cli.Runner:
    def run(args: list[str], env: Mapping[str, str]) -> tuple[int, str]:
        raise error

    return run


# --- child_env -------------------------------------------------------------------


def test_child_env_keeps_only_the_allowlist_in_any_casing() -> None:
    parent = {"PATH": "/bin", "Path": "/also", "home": "/h", "EDITOR": "vim"}
    assert child_env(parent) == {"PATH": "/bin", "Path": "/also", "home": "/h"}


def test_no_billing_variable_can_reach_claude_in_any_casing() -> None:
    parent: dict[str, str] = {}
    for name in BILLING_ENV_VARS:
        parent[name] = parent[name.lower()] = "x"
    parent["CLAUDE_CODE_USE_BEDROCK"] = "1"
    assert child_env(parent) == {}


def test_the_allowlist_and_the_billing_list_share_nothing() -> None:
    assert not CHILD_ENV_ALLOWLIST & BILLING_ENV_VARS
    assert not any(n.startswith("CLAUDE_CODE_USE_") for n in CHILD_ENV_ALLOWLIST)


# --- read_auth_status ------------------------------------------------------------


def test_auth_status_is_parsed_from_the_cli() -> None:
    fake = FakeClaude()
    assert read_auth_status({"PATH": "/bin"}, fake) == {
        "loggedIn": True,
        "authMethod": "claude.ai",
    }
    assert fake.calls == [(["auth", "status"], {"PATH": "/bin"})]


@pytest.mark.parametrize(
    ("code", "stdout"),
    [
        (1, SUBSCRIPTION),  # a non-zero exit is "not logged in", whatever it printed
        (0, ""),
        (0, "Logged in as someone"),
        (0, "{not json"),
        (0, "[]"),
        (0, '"claude.ai"'),
        (0, "null"),
    ],
)
def test_anything_but_a_clean_json_object_reads_as_unknown(
    code: int, stdout: str
) -> None:
    assert read_auth_status({}, FakeClaude(code, stdout)) is None


@pytest.mark.parametrize(
    "error",
    [
        FileNotFoundError("claude is not on the PATH"),
        PermissionError("denied"),
        subprocess.TimeoutExpired(["claude"], 30),
    ],
)
def test_a_cli_that_cannot_be_run_reads_as_unknown(error: BaseException) -> None:
    assert read_auth_status({}, raising(error)) is None


# --- preflight, with the guard stubbed -------------------------------------------


def test_preflight_vets_the_parent_env_and_reads_status_under_the_child_env(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: list[tuple[dict[str, str], object]] = []

    def guard(
        env: Mapping[str, str], status: Mapping[str, object] | None
    ) -> list[BillingRisk]:
        seen.append((dict(env), status))
        return []

    monkeypatch.setattr(claude_cli, "find_billing_risks", guard)
    parent = {"PATH": "/bin", "EDITOR": "vim"}
    fake = FakeClaude()

    assert preflight(parent, fake) == {"PATH": "/bin"}
    assert seen == [(parent, {"loggedIn": True, "authMethod": "claude.ai"})]
    assert fake.calls == [(["auth", "status"], {"PATH": "/bin"})]


def test_preflight_refuses_with_every_risk_the_guard_found(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    risks = [BillingRisk("env", "A", "a"), BillingRisk("auth", "authMethod", "b")]
    monkeypatch.setattr(claude_cli, "find_billing_risks", lambda env, status: risks)

    with pytest.raises(BillingRiskError) as refusal:
        preflight({}, FakeClaude())

    assert refusal.value.risks == tuple(risks)
    assert "[env] A" in str(refusal.value)
    assert "[auth] authMethod" in str(refusal.value)


def test_a_guard_that_crashes_stops_the_run_rather_than_waving_it_through(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def broken(env: Mapping[str, str], status: object) -> list[BillingRisk]:
        raise KeyError("bug")

    monkeypatch.setattr(claude_cli, "find_billing_risks", broken)
    with pytest.raises(KeyError):
        preflight({}, FakeClaude())


# --- preflight, end to end with the real guard -----------------------------------


def test_a_subscription_login_passes_preflight() -> None:
    assert preflight({"PATH": "/bin"}, FakeClaude()) == {"PATH": "/bin"}


def test_an_api_key_claude_would_never_see_is_still_refused() -> None:
    with pytest.raises(BillingRiskError) as refusal:
        preflight({"PATH": "/bin", "ANTHROPIC_API_KEY": "sk"}, FakeClaude())
    assert [r.name for r in refusal.value.risks] == ["ANTHROPIC_API_KEY"]


def test_a_missing_cli_is_refused() -> None:
    with pytest.raises(BillingRiskError) as refusal:
        preflight({"PATH": "/bin"}, raising(FileNotFoundError("claude")))
    assert [r.source for r in refusal.value.risks] == ["auth"]


def test_an_api_key_helper_in_a_settings_file_is_refused() -> None:
    # The environment is clean; only `claude auth status` can see a helper in a
    # settings file.
    status = json.dumps({"loggedIn": True, "authMethod": "api_key_helper"})
    with pytest.raises(BillingRiskError):
        preflight({"PATH": "/bin"}, FakeClaude(stdout=status))


# --- the doctor command ----------------------------------------------------------


def test_doctor_exits_zero_when_safe(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(cli, "preflight", lambda env: {})
    assert cli.main(["doctor"]) == 0
    assert capsys.readouterr().out.startswith("OK")


def test_doctor_exits_one_and_names_the_risk_when_refused(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    def refuse(env: Mapping[str, str]) -> dict[str, str]:
        raise BillingRiskError([BillingRisk("env", "ANTHROPIC_API_KEY", "per-token")])

    monkeypatch.setattr(cli, "preflight", refuse)
    assert cli.main(["doctor"]) == 1
    assert "ANTHROPIC_API_KEY" in capsys.readouterr().err


@pytest.mark.parametrize("argv", [[], ["doctr"], ["doctor", "extra"]])
def test_doctor_rejects_anything_else(argv: list[str]) -> None:
    assert cli.main(argv) == 2
