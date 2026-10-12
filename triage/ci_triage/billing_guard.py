"""Decide whether a `claude` run could bill anything beyond the Claude Pro subscription.

The project's cost ceiling is $0 beyond that subscription (triage/docs/PROJECT_BRIEF.md
§Cost ceiling), and this module is the line in the code that holds it. Every `claude`
subprocess goes through `claude_cli.preflight`, which refuses to start unless
`find_billing_risks` returns nothing.

It fails closed. Anything the guard cannot positively identify as subscription billing
is a risk: an auth status it could not read, an auth method it has never heard of, a
provider switch Claude Code has not shipped yet. A false refusal costs a re-run; a
false pass costs money, and only the second is unrecoverable.

The names below come from Claude Code's authentication precedence and its
environment-variable reference (https://code.claude.com/docs/en/authentication and
.../env-vars), checked on 2026-10-12. ADR 0004 records the reasoning and the layers
around this one.
"""

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Final, Literal

# Environment variables whose *presence* can route a run away from the subscription.
# Every entry either outranks the subscription login in Claude Code's credential
# precedence or redirects requests to another endpoint. Presence is the test, not the
# value: "0" or "false" mean nothing to a variable that holds a key, and Claude Code
# treats a blank value as unset for some of these and not others.
BILLING_ENV_VARS: Final = frozenset(
    {
        # Anthropic API billing, per token.
        "ANTHROPIC_API_KEY",
        "ANTHROPIC_AUTH_TOKEN",
        # A proxy or gateway in front of the API, billed however that endpoint bills.
        "ANTHROPIC_BASE_URL",
        # Profiles and Workload Identity Federation outrank the subscription login.
        "ANTHROPIC_PROFILE",
        "ANTHROPIC_FEDERATION_RULE_ID",
        "ANTHROPIC_ORGANIZATION_ID",
        # Cloud-provider credentials and endpoints.
        "AWS_BEARER_TOKEN_BEDROCK",
        "ANTHROPIC_AWS_API_KEY",
        "ANTHROPIC_FOUNDRY_API_KEY",
        "ANTHROPIC_FOUNDRY_AUTH_TOKEN",
        "ANTHROPIC_AWS_BASE_URL",
        "ANTHROPIC_BEDROCK_BASE_URL",
        "ANTHROPIC_BEDROCK_MANTLE_BASE_URL",
        "ANTHROPIC_FOUNDRY_BASE_URL",
        "ANTHROPIC_VERTEX_BASE_URL",
    }
)

# `CLAUDE_CODE_USE_<X>` is how Claude Code switches to a cloud provider (BEDROCK,
# VERTEX, FOUNDRY, MANTLE and ANTHROPIC_AWS at the time of writing), and a provider
# added next year will almost certainly arrive under the same prefix. So the prefix is
# refused by default…
PROVIDER_SWITCH_PREFIX: Final = "CLAUDE_CODE_USE_"

# …except for the members of the family that are not providers. These two only choose
# a local tool implementation, and the first is plausibly set on this Windows machine.
BENIGN_PROVIDER_SWITCHES: Final = frozenset(
    {
        "CLAUDE_CODE_USE_POWERSHELL_TOOL",
        "CLAUDE_CODE_USE_NATIVE_FILE_SEARCH",
    }
)

# The `authMethod` values of `claude auth status` that mean the subscription pays.
# `claude.ai` is an interactive /login; `oauth_token` is a `claude setup-token` token,
# which the docs state requires and bills to a subscription. The other documented
# values (`none`, `api_key`, `api_key_helper`, `third_party`) and anything undocumented
# are risks.
SUBSCRIPTION_AUTH_METHODS: Final = frozenset({"claude.ai", "oauth_token"})


@dataclass(frozen=True)
class BillingRisk:
    """One reason a run could be billed outside the subscription.

    `source` says where it was found. `name` is what was found: the environment
    variable exactly as spelled in the mapping, or `"authMethod"` for anything wrong
    with the auth status, including the status being unreadable. `reason` is for a
    human reading the refusal and is never asserted on.
    """

    source: Literal["env", "auth"]
    name: str
    reason: str


def find_billing_risks(
    env: Mapping[str, str],
    auth_status: Mapping[str, object] | None,
) -> list[BillingRisk]:
    """Return every billing risk in `env` and `auth_status`; an empty list means safe.

    `env` is the environment to vet. `preflight` passes the whole parent environment,
    a superset of what the subprocess receives, so a key the subprocess would never see
    is still refused: the brief says one must not be set anywhere. `auth_status` is the
    parsed JSON object printed by `claude auth status` under the subprocess's
    environment, or None when it could not be obtained.
    """
    risks = [
        BillingRisk("env", name, _env_reason(name.upper()))
        for name in sorted(env)
        if _is_billing_variable(name.upper())
    ]

    # An unreadable status, a missing field and a non-string all fall through to the
    # same refusal as an unknown method: the only pass is an exact allowlisted string.
    method = None if auth_status is None else auth_status.get("authMethod")
    if not (isinstance(method, str) and method in SUBSCRIPTION_AUTH_METHODS):
        risks.append(BillingRisk("auth", "authMethod", _auth_reason(auth_status)))
    return risks


def _is_billing_variable(upper_name: str) -> bool:
    if upper_name in BILLING_ENV_VARS:
        return True
    return (
        upper_name.startswith(PROVIDER_SWITCH_PREFIX)
        and upper_name not in BENIGN_PROVIDER_SWITCHES
    )


def _env_reason(upper_name: str) -> str:
    if upper_name.startswith(PROVIDER_SWITCH_PREFIX):
        return "selects a cloud provider, which bills that provider's account"
    return "outranks the subscription login or redirects requests; unset it"


def _auth_reason(auth_status: Mapping[str, object] | None) -> str:
    if auth_status is None:
        return (
            "`claude auth status` could not be read (not installed, not logged in, "
            "or unparseable output), so the credential in use is unknown"
        )
    return (
        f"credential in use is {auth_status.get('authMethod')!r}; only "
        f"{sorted(SUBSCRIPTION_AUTH_METHODS)} bill the subscription"
    )
