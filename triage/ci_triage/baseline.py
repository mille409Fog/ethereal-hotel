"""The baseline: triage with rules and no model. The score every later stage must beat.

Two halves, scored separately against the brief's two metrics:

- `classify_by_rules` answers *what kind* of failure (category accuracy, ≥ 85%).
- `suggest_files` answers *where the fix goes* (fix-file hit rate, ≥ 60%). It is
  deliberately naive: any repository file the excerpt names. That is the honest floor
  for "can you point at the file without understanding anything".

Rules may be written by reading the `tune` cases in the golden set, never the
`holdout` ones. The holdout score is the one reported, and it only means something if
nobody fitted the rules to it.
"""

import re
from collections.abc import Callable, Collection
from typing import Final

from ci_triage.models import Category, FailedJob

# --- signals ------------------------------------------------------------------------
# Each pattern names a cause, not a symptom. Two traps shaped them: nearly every log
# ends "exit code 1", and passing Vitest runs print the errors their tests expect, so
# neither "exit code" nor a bare "Error:" means anything on its own.

# The runner or the network failed, not the code.
_INFRASTRUCTURE = re.compile(
    r"runner has received a shutdown signal|No space left on device"
    r"|getaddrinfo|\bENOTFOUND\b|\bECONNRESET\b|\bETIMEDOUT\b"
    r"|503 Service Unavailable|lost communication with the server",
    re.IGNORECASE,
)
# The résumé gate compares a PDF rendered on another platform. Every failure of it
# in this repository's history was the platform, not the résumé.
_RESUME_STEP = re.compile(r"résumé PDF", re.IGNORECASE)

# An advisory or an unresolvable tree. `[1-9]` because `npm ci` prints
# "found 0 vulnerabilities" on every successful install.
_DEPENDENCY = re.compile(
    r"# npm audit report|Severity: (?:high|critical)"
    r"|\b[1-9]\d* (?:high|critical) severity vulnerabilit"
    r"|\bERESOLVE\b|Could not resolve dependency"
    r"|Dependabot encountered an error"
)
# Angular's budget message names the budget. An upgrade shows up as the *initial*
# bundle exploding; the repo's own growth shows up in `total scripts`.
_INITIAL_BUNDLE = re.compile(r"bundle initial exceeded maximum budget")

# A gate with a number in it tripped: a size budget, a coverage floor, a Lighthouse
# score, or the Aubade lobby's time budget on slow CI runners.
_THRESHOLD = re.compile(
    r"exceeded maximum budget|does not meet (?:global )?threshold"
    r"|minScore assertion|categories\.\w+ failure"
    r"|Unlocking the lobby"
)

# Our own code is wrong: a compiler, type checker or assertion says so.
_REGRESSION = re.compile(
    r"\berror TS\d+|\bSyntaxError\b|\bTypeError: |\bAssertionError\b"
    r"|^FAILED .+::|^E\s{3}"
    r"|\berror\s+\S+\s+@typescript-eslint|\bruff\b.*\berror\b",
    re.MULTILINE,
)

DEFAULT: Final = Category.THRESHOLD


def _haystack(case: FailedJob) -> str:
    return "\n".join((case.excerpt.text, *case.excerpt.error_lines))


def _on_dependabot(case: FailedJob) -> bool:
    return case.branch.startswith("dependabot/")


Rule = tuple[Callable[[FailedJob, str], bool], Category]

# Order is part of the logic: the first rule that matches decides.
RULES: Final[tuple[Rule, ...]] = (
    # Infrastructure first: when the runner died, nothing else in the log is the cause.
    (lambda c, text: bool(_INFRASTRUCTURE.search(text)), Category.ENVIRONMENT),
    (
        lambda c, text: any(_RESUME_STEP.search(step) for step in c.failed_steps),
        Category.ENVIRONMENT,
    ),
    (
        lambda c, text: c.workflow == "Supply chain" or bool(_DEPENDENCY.search(text)),
        Category.DEPENDENCY,
    ),
    # Before the threshold rule: on an upgrade branch, an exploded initial bundle is the
    # upgrade's doing even though a budget is what reported it.
    (
        lambda c, text: _on_dependabot(c) and bool(_INITIAL_BUNDLE.search(text)),
        Category.DEPENDENCY,
    ),
    (lambda c, text: bool(_THRESHOLD.search(text)), Category.THRESHOLD),
    (lambda c, text: bool(_REGRESSION.search(text)), Category.REGRESSION),
    # An upgrade branch failing for a reason none of the rules above recognise: the
    # failure arrived with the bump. Dependabot branches that inherited a known failure
    # from the main branch were caught by the threshold rule first.
    (lambda c, text: _on_dependabot(c), Category.DEPENDENCY),
)


def classify_by_rules(case: FailedJob) -> Category:
    """Return the category of a failed job, using only fixed rules.

    Everything on `case` is fair input: the job and workflow names, the failed step
    names, the branch, and the excerpt (`text` and the `##[error]` lines). Must return
    a Category for every input, an empty excerpt included, and must never raise.

    Falls back to `DEFAULT`, the commonest category in the tune split: with no signal
    at all, the best guess is the base rate.
    """
    text = _haystack(case)
    for matches, category in RULES:
        if matches(case, text):
            return category
    return DEFAULT


# A path as it appears in a log: optional runner checkout prefix, then directories
# and a file with an extension. Line and column suffixes (`:102:7`) are not captured.
_PATH = re.compile(r"(?:[\w.@-]+/)+[\w.@-]+\.[A-Za-z0-9]+")
_RUNNER_CHECKOUT = re.compile(r"^.*?/ethereal-hotel/ethereal-hotel/")


def suggest_files(case: FailedJob, repo_files: Collection[str]) -> tuple[str, ...]:
    """Repository files named anywhere in the excerpt, sorted.

    `repo_files` is the set of tracked paths (`git ls-files`), which is what turns
    "anything that looks like a path" into "a file the fix could actually touch".
    """
    named = set()
    for match in _PATH.finditer(case.excerpt.text):
        path = _RUNNER_CHECKOUT.sub("", match.group(0)).removeprefix("./")
        if path in repo_files:
            named.add(path)
    return tuple(sorted(named))
