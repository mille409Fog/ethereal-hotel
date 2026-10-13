"""The rule baseline's contract. Its *quality* is judged by `npm run triage:eval`.

These tests are a floor, not the score. They check that the classifier answers every
input without raising, and that the textbook case of each category lands where the
brief's definitions put it. Every fixture is synthetic, written from the definitions,
so nothing here leaks a held-out case into the rules.
"""

import pytest
from fakes import make_case

from ci_triage.baseline import classify_by_rules, suggest_files
from ci_triage.models import Category, FailedJob

# --- classify_by_rules: total and deterministic ------------------------------------

ODD_INPUTS = [
    make_case(),
    make_case(job="", workflow="", failed_steps=()),
    make_case(text="\n\n\n", error_lines=("",)),
    make_case(text="✘ ⚠ 🤖 ünïcödé " * 50),
    make_case(text="x" * 200_000),
    make_case(error_lines=("Process completed with exit code 1.",)),
]


@pytest.mark.parametrize("case", ODD_INPUTS)
def test_every_input_gets_a_category_and_nothing_raises(case: FailedJob) -> None:
    assert isinstance(classify_by_rules(case), Category)


@pytest.mark.parametrize("case", ODD_INPUTS)
def test_the_same_case_always_gets_the_same_answer(case: FailedJob) -> None:
    assert classify_by_rules(case) == classify_by_rules(case)


# --- classify_by_rules: the textbook case of each category -------------------------

TEXTBOOK = [
    pytest.param(
        make_case(
            workflow="Supply chain",
            job="Advisories (npm audit, pip-audit)",
            failed_steps=("npm audit (fails at high and above)",),
            text="# npm audit report\nSeverity: high\n2 high severity vulnerabilities",
            error_lines=("Process completed with exit code 1.",),
        ),
        Category.DEPENDENCY,
        id="npm-audit-advisory",
    ),
    pytest.param(
        make_case(
            text="npm ERR! code ERESOLVE\nnpm ERR! ERESOLVE could not resolve",
            error_lines=("Process completed with exit code 1.",),
        ),
        Category.DEPENDENCY,
        id="unresolvable-dependency-tree",
    ),
    pytest.param(
        make_case(
            job="Frontend (lint, test, build)",
            failed_steps=("Run frontend tests (fails below coverage thresholds)",),
            text="ERROR: Coverage for lines (88.1%) does not meet global "
            "threshold (90%)",
            error_lines=("Process completed with exit code 1.",),
        ),
        Category.THRESHOLD,
        id="coverage-gate",
    ),
    pytest.param(
        make_case(
            job="Budgets (Lighthouse — performance, a11y, best practices)",
            failed_steps=("Run Lighthouse CI",),
            text="✘ categories.performance failure for minScore assertion\n"
            "expected: >=0.9\nfound: 0.84",
            error_lines=("Process completed with exit code 1.",),
        ),
        Category.THRESHOLD,
        id="lighthouse-score",
    ),
    pytest.param(
        make_case(
            text="##[error]The runner has received a shutdown signal.",
            error_lines=("The runner has received a shutdown signal.",),
        ),
        Category.ENVIRONMENT,
        id="runner-shutdown",
    ),
    pytest.param(
        make_case(
            text="Error: getaddrinfo ENOTFOUND registry.npmjs.org",
            error_lines=("Process completed with exit code 1.",),
        ),
        Category.ENVIRONMENT,
        id="network-outage",
    ),
    pytest.param(
        make_case(
            job="Frontend (lint, test, build)",
            failed_steps=("Build application",),
            text="src/app/x.ts:4:7 - error TS2322: Type 'string' is not assignable "
            "to type 'number'.",
            error_lines=("Process completed with exit code 1.",),
        ),
        Category.REGRESSION,
        id="type-error-in-our-code",
    ),
]


@pytest.mark.parametrize(("case", "expected"), TEXTBOOK)
def test_the_textbook_case_of_each_category(
    case: FailedJob, expected: Category
) -> None:
    assert classify_by_rules(case) == expected


# --- suggest_files -----------------------------------------------------------------

REPO = {"e2e/aubade.spec.ts", "e2e/support/lobby.ts", "angular.json"}


def test_files_named_in_the_excerpt_are_suggested_when_tracked() -> None:
    case = make_case(
        text="1) [chromium] › e2e/aubade.spec.ts:54:7 › renders the lobby\n"
        "at /home/runner/work/ethereal-hotel/ethereal-hotel/e2e/support/lobby.ts:12:3"
    )
    assert suggest_files(case, REPO) == ("e2e/aubade.spec.ts", "e2e/support/lobby.ts")


def test_paths_that_are_not_tracked_files_are_ignored() -> None:
    case = make_case(
        text="node_modules/@vitest/runner/dist/chunk.js:1:1 and test-results/a/b.png"
    )
    assert suggest_files(case, REPO) == ()


def test_nothing_named_means_nothing_suggested() -> None:
    assert suggest_files(make_case(text="exit code 1"), REPO) == ()
