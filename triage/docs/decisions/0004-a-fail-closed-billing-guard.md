# 0004 — A fail-closed billing guard in front of every `claude` process

**Status:** accepted, 2026-10-12. Implemented in `ci_triage/billing_guard.py` and
`ci_triage/claude_cli.py`.

## Context

The project may not create a single charge (brief §Cost ceiling). Claude Code picks its
credential by precedence. In order, it tries cloud-provider switches,
`ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, an `apiKeyHelper` script,
`CLAUDE_CODE_OAUTH_TOKEN` (a subscription token), Anthropic profiles and federation, and
finally the `/login` subscription. In `-p` mode an `ANTHROPIC_API_KEY` is used without
asking. So one stray variable in a shell profile or a CI secret would bill per token,
silently.

## Options

- **Trust the environment.** Nothing stops a stray key.
- **A denylist of known billing variables.** It catches today's names and misses any
  provider Claude Code ships later.
- **Layers that each fail closed.** Chosen.

## Decision

Four layers. Any one of them is enough to stop a billed run.

1. **Allowlisted child environment.** `claude` receives only the variables in
   `CHILD_ENV_ALLOWLIST`. A variable nobody listed never reaches it.
2. **The parent environment is refused anyway.** `find_billing_risks` vets the whole
   parent environment, not just the allowlisted child. A billing variable is refused
   even though layer 1 would have dropped it, because the brief says one must not exist
   anywhere, and because the doctor should tell you it is there.
3. **Ask Claude Code which credential it would use.** `claude auth status`, run under
   the child environment, reports an `authMethod`. Only `claude.ai` and `oauth_token`
   pass, matched exactly. This is the only layer that sees an `apiKeyHelper` in a
   settings file or a stored Console login.
4. **The account itself.** "Extra usage" is off, so even a run that got past all three
   stops at the plan's limits instead of being billed.

The rules inside layers 2 and 3:

- **Presence, not value.** `ANTHROPIC_API_KEY=""` or `=0` is refused.
- **Case-insensitive names**, because Windows environment names are.
- **The provider prefix is refused by default.** `CLAUDE_CODE_USE_*` covers Bedrock,
  Vertex, Foundry, Mantle and Claude Platform on AWS today, and probably whatever comes
  next. Two members of that family are not providers
  (`CLAUDE_CODE_USE_POWERSHELL_TOOL`, `CLAUDE_CODE_USE_NATIVE_FILE_SEARCH`), so they are
  exempt by name. A blanket prefix rule would refuse this Windows machine, and a list
  of today's providers would miss tomorrow's.
- **Unknown means refused**: an unreadable auth status, a missing field, a non-string,
  an undocumented method, a near-miss spelling.
- **Report everything**, sorted, so the refusal lists every problem at once.

## Consequences

- The tests are mostly generated combinations: every billing variable in three casings
  with five kinds of value, and every documented and malformed auth status. They also
  check that a clean subscription login _passes_, because "refuse everything" would
  otherwise satisfy a suite that only tested refusals.
- `npm run triage:doctor` runs the guard against the current machine. It refuses until
  the `claude` CLI is installed and logged in, which is the correct answer.
- `--bare` must never be passed to `claude`. Bare mode does not read
  `CLAUDE_CODE_OAUTH_TOKEN`, so in CI it would fall through to any key it could find.
- The names come from Claude Code's docs as of 2026-10-12. A new credential _variable_
  outside the provider prefix would pass layer 2, but layer 1 would still drop it and
  layer 3 would still report its `authMethod`. When Claude Code's authentication docs
  change, re-read them against `BILLING_ENV_VARS`.
- **Residual risk:** a settings file's `env` block reaches `claude` without passing
  through our environment. Layer 3 covers credentials set that way, because
  `auth status` reads the same settings, and layer 4 covers everything.
