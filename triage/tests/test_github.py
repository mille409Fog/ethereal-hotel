"""Parsing `gh` output, and the one fact about job names that history depends on."""

import json

import pytest
from fakes import (
    FakeGh,
    compare_key,
    failed_runs_key,
    jobs_json,
    jobs_key,
    log_key,
    run_json,
)

from ci_triage.github import (
    GhError,
    base_job_name,
    changed_files,
    failed_log,
    failed_runs,
    jobs_of,
)


def test_failed_runs_are_parsed() -> None:
    gh = FakeGh({failed_runs_key(): json.dumps([run_json(5, "2026-10-01T00:00:00Z")])})
    [run] = failed_runs(gh)
    assert (run.run_id, run.workflow, run.conclusion) == (5, "Code Quality", "failure")


def test_jobs_carry_only_their_failed_steps() -> None:
    gh = FakeGh(
        {jobs_key(5): jobs_json((1, "Lint", "failure"), (2, "Test", "success"))}
    )
    lint, test = jobs_of(gh, 5)
    assert lint.failed_steps == ("Lint step",)
    assert test.failed_steps == ()


def test_a_missing_log_is_an_empty_string_not_an_error() -> None:
    gh = FakeGh({log_key(1): GhError("log not found")})
    assert failed_log(gh, 1) == ""


def test_changed_files_come_back_sorted() -> None:
    gh = FakeGh({compare_key("a", "b"): '["z.py", "a.py"]'})
    assert changed_files(gh, "a", "b") == ("a.py", "z.py")


@pytest.mark.parametrize(
    ("name", "base"),
    [
        ("Frontend (lint, test, build) (22.x)", "Frontend (lint, test, build)"),
        ("Backend (lint, types, pytest) (3.11)", "Backend (lint, types, pytest)"),
        ("Frontend (lint, test, build)", "Frontend (lint, test, build)"),
        # The descriptive parenthesis is part of the name, not a matrix axis.
        ("End-to-end (smoke, axe)", "End-to-end (smoke, axe)"),
    ],
)
def test_base_job_name_strips_only_a_matrix_axis(name: str, base: str) -> None:
    assert base_job_name(name) == base
