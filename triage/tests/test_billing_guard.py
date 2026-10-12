"""The billing guard must never pass a billable run, and must not refuse a safe one.

The first property is the one that costs money, so it is tested exhaustively rather
than by example: every billing variable in every casing with every kind of value, and
every shape of broken auth status. The second property gets enough tests that "refuse
everything" cannot pass this file, which would otherwise be the easiest way to pass it.
"""

import itertools
from collections.abc import Callable, Mapping
from types import MappingProxyType

import pytest

from ci_triage.billing_guard import (
    BENIGN_PROVIDER_SWITCHES,
    BILLING_ENV_VARS,
    SUBSCRIPTION_AUTH_METHODS,
    BillingRisk,
    find_billing_risks,
)


def _alternating(name: str) -> str:
    return "".join(c.lower() if i % 2 else c.upper() for i, c in enumerate(name))


# Windows environment names are case-insensitive, so `anthropic_api_key` set in
# PowerShell is the same variable to Claude Code as the upper-case spelling.
CASINGS: list[Callable[[str], str]] = [str.upper, str.lower, _alternating]

# Presence is the test, never the value. None of these may read as "switched off".
VALUES = ["", " ", "0", "false", "sk-ant-api03-not-a-real-key"]

SAFE_ENV: Mapping[str, str] = MappingProxyType(
    {
        "PATH": r"C:\Windows\system32;C:\Users\someone\.local\bin",
        "USERPROFILE": r"C:\Users\someone",
        "CLAUDE_CODE_OAUTH_TOKEN": "sk-ant-oat01-not-a-real-token",
        "CLAUDE_CODE_USE_POWERSHELL_TOOL": "1",
        "ANTHROPIC_MODEL": "sonnet",
    }
)
SAFE_STATUS: Mapping[str, object] = MappingProxyType(
    {"loggedIn": True, "authMethod": "claude.ai"}
)


def found(risks: list[BillingRisk]) -> list[tuple[str, str]]:
    return [(risk.source, risk.name) for risk in risks]


# --- what must pass --------------------------------------------------------------


@pytest.mark.parametrize("method", sorted(SUBSCRIPTION_AUTH_METHODS))
def test_a_subscription_login_with_a_clean_environment_is_safe(method: str) -> None:
    status = MappingProxyType({"loggedIn": True, "authMethod": method})
    assert find_billing_risks(SAFE_ENV, status) == []


def test_an_empty_environment_is_safe() -> None:
    assert find_billing_risks({}, SAFE_STATUS) == []


@pytest.mark.parametrize(
    ("switch", "casing", "value"),
    list(itertools.product(sorted(BENIGN_PROVIDER_SWITCHES), CASINGS, VALUES)),
)
def test_benign_members_of_the_provider_prefix_are_not_risks(
    switch: str, casing: Callable[[str], str], value: str
) -> None:
    assert find_billing_risks({casing(switch): value}, SAFE_STATUS) == []


@pytest.mark.parametrize(
    "name",
    [
        # Billing names are matched whole, not as substrings. None of these reaches
        # Claude Code.
        "ANTHROPIC_API_KEY_BACKUP",
        "MY_ANTHROPIC_API_KEY",
        "OPENAI_API_KEY",
        # Neighbours of the provider prefix that do not start with it.
        "CLAUDE_CODE_USE",
        "CLAUDE_CODE_USER",
        "XCLAUDE_CODE_USE_BEDROCK",
        # Claude Code's own variables that do not move billing.
        "ANTHROPIC_MODEL",
        "ANTHROPIC_BETAS",
        "CLAUDE_CODE_OAUTH_TOKEN",
        "CLAUDE_CONFIG_DIR",
    ],
)
def test_near_misses_are_not_risks(name: str) -> None:
    assert find_billing_risks({name: "1"}, SAFE_STATUS) == []


# --- what must be refused: the environment ---------------------------------------


@pytest.mark.parametrize(
    ("name", "casing", "value"),
    list(itertools.product(sorted(BILLING_ENV_VARS), CASINGS, VALUES)),
)
def test_every_billing_variable_is_refused_in_any_casing_with_any_value(
    name: str, casing: Callable[[str], str], value: str
) -> None:
    spelled = casing(name)
    env = {**SAFE_ENV, spelled: value}
    assert found(find_billing_risks(env, SAFE_STATUS)) == [("env", spelled)]


@pytest.mark.parametrize(
    ("switch", "casing"),
    list(
        itertools.product(
            [
                "CLAUDE_CODE_USE_BEDROCK",
                "CLAUDE_CODE_USE_VERTEX",
                "CLAUDE_CODE_USE_FOUNDRY",
                "CLAUDE_CODE_USE_MANTLE",
                "CLAUDE_CODE_USE_ANTHROPIC_AWS",
                # Not shipped by Claude Code. Refused because the guard fails closed.
                "CLAUDE_CODE_USE_SOME_FUTURE_CLOUD",
                "CLAUDE_CODE_USE_",
            ],
            CASINGS,
        )
    ),
)
def test_every_provider_switch_is_refused_including_future_ones(
    switch: str, casing: Callable[[str], str]
) -> None:
    spelled = casing(switch)
    assert found(find_billing_risks({spelled: "1"}, SAFE_STATUS)) == [("env", spelled)]


def test_the_same_variable_in_two_casings_is_reported_twice() -> None:
    # A plain dict can hold both; a Windows process environment would merge them.
    # Either way the guard reports what it was given, as it was spelled.
    env = {"ANTHROPIC_API_KEY": "a", "anthropic_api_key": "b"}
    assert found(find_billing_risks(env, SAFE_STATUS)) == [
        ("env", "ANTHROPIC_API_KEY"),
        ("env", "anthropic_api_key"),
    ]


# --- what must be refused: the auth status ---------------------------------------


def test_an_unreadable_auth_status_is_refused() -> None:
    assert found(find_billing_risks(SAFE_ENV, None)) == [("auth", "authMethod")]


@pytest.mark.parametrize(
    "method",
    [
        # The other values Claude Code documents.
        "none",
        "api_key",
        "api_key_helper",
        "third_party",
        # Values it does not document. Unknown means refused.
        "console",
        "profile",
        "",
        # Near-misses of the allowed values. The match is exact, never normalised.
        "Claude.ai",
        "CLAUDE.AI",
        " claude.ai",
        "claude.ai ",
        "claude_ai",
        "OAUTH_TOKEN",
        "oauth-token",
    ],
)
def test_any_auth_method_but_a_subscription_is_refused(method: str) -> None:
    status = {"loggedIn": True, "authMethod": method}
    assert found(find_billing_risks(SAFE_ENV, status)) == [("auth", "authMethod")]


@pytest.mark.parametrize(
    "status",
    [
        {},
        {"loggedIn": True},
        {"authMethod": None},
        {"authMethod": 1},
        {"authMethod": True},
        {"authMethod": ["claude.ai"]},
        {"authMethod": {"claude.ai": True}},
        {"authmethod": "claude.ai"},
        {"auth_method": "claude.ai"},
    ],
)
def test_a_malformed_auth_status_is_refused(status: Mapping[str, object]) -> None:
    assert found(find_billing_risks(SAFE_ENV, status)) == [("auth", "authMethod")]


# --- reporting -------------------------------------------------------------------


def test_every_risk_is_reported_not_just_the_first() -> None:
    env = {
        "CLAUDE_CODE_USE_VERTEX": "1",
        "ANTHROPIC_BASE_URL": "https://gateway.example",
        "ANTHROPIC_API_KEY": "sk",
        "PATH": "/usr/bin",
    }
    assert found(find_billing_risks(env, None)) == [
        ("env", "ANTHROPIC_API_KEY"),
        ("env", "ANTHROPIC_BASE_URL"),
        ("env", "CLAUDE_CODE_USE_VERTEX"),
        ("auth", "authMethod"),
    ]


def test_order_does_not_depend_on_the_order_of_the_environment() -> None:
    names = ["CLAUDE_CODE_USE_BEDROCK", "ANTHROPIC_PROFILE", "AWS_BEARER_TOKEN_BEDROCK"]
    forwards = find_billing_risks(dict.fromkeys(names, "1"), SAFE_STATUS)
    backwards = find_billing_risks(dict.fromkeys(reversed(names), "1"), SAFE_STATUS)
    assert found(forwards) == found(backwards) == [("env", n) for n in sorted(names)]


def test_every_risk_carries_a_reason_for_the_human_reading_the_refusal() -> None:
    risks = find_billing_risks({"ANTHROPIC_API_KEY": "sk"}, None)
    assert len(risks) == 2
    assert all(isinstance(r.reason, str) and r.reason.strip() for r in risks)


def test_inputs_are_read_only_mappings_and_are_left_alone() -> None:
    # MappingProxyType has no write methods, so an implementation that mutates its
    # arguments, or that assumes it was handed a dict, fails here.
    env = MappingProxyType({"ANTHROPIC_API_KEY": "sk", "PATH": "/usr/bin"})
    status = MappingProxyType({"authMethod": "claude.ai"})
    assert found(find_billing_risks(env, status)) == [("env", "ANTHROPIC_API_KEY")]


# --- the tables themselves -------------------------------------------------------
# The tests above take the tables as given, so deleting an entry would quietly delete
# its tests too. These pin the parts that must only ever change on purpose.


def test_the_credentials_that_outrank_the_subscription_are_all_listed() -> None:
    # Claude Code's documented precedence: everything above the /login subscription
    # that an environment variable can select. Provider switches are the prefix's job.
    assert {
        "ANTHROPIC_AUTH_TOKEN",
        "ANTHROPIC_API_KEY",
        "ANTHROPIC_PROFILE",
        "ANTHROPIC_FEDERATION_RULE_ID",
        "ANTHROPIC_ORGANIZATION_ID",
        "ANTHROPIC_BASE_URL",
        "AWS_BEARER_TOKEN_BEDROCK",
    } <= BILLING_ENV_VARS


def test_only_the_two_subscription_methods_are_allowed() -> None:
    assert frozenset({"claude.ai", "oauth_token"}) == SUBSCRIPTION_AUTH_METHODS


def test_only_the_two_tool_switches_are_exempt_from_the_provider_prefix() -> None:
    assert (
        frozenset(
            {"CLAUDE_CODE_USE_POWERSHELL_TOOL", "CLAUDE_CODE_USE_NATIVE_FILE_SEARCH"}
        )
        == BENIGN_PROVIDER_SWITCHES
    )
