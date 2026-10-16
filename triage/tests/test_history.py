"""Gathering the agent's facts: nothing after the failure, and no labels."""

import json
from pathlib import Path

from fakes import FakeGh, jobs_json, jobs_key, make_case, run_json, runs_on_key

from ci_triage.github import GhError
from ci_triage.history import (
    REFERENCE_BRANCHES,
    GitHubHistory,
    case_context,
    earlier_failures,
    job_history,
)

CASE = make_case(
    run_id=50,
    job_id=500,
    created_at="2026-10-05T00:00:00Z",
    job="End-to-end",
    branch="dependabot/npm/x",
)


def gh_script() -> dict[tuple[str, ...], str | Exception]:
    dev = [
        run_json(48, "2026-10-04T00:00:00Z", sha="s48", branch="development-alpha"),
        run_json(47, "2026-10-03T00:00:00Z", sha="s47", branch="development-alpha"),
        # After the failure: must never appear.
        run_json(51, "2026-10-06T00:00:00Z", sha="s51", branch="development-alpha"),
    ]
    return {
        runs_on_key(branch="dependabot/npm/x"): GhError("dynamic workflow"),
        runs_on_key(branch="development-alpha"): json.dumps(dev),
        runs_on_key(branch="main"): "[]",
        # The job was renamed with a matrix suffix in run 47.
        jobs_key(48): jobs_json((480, "End-to-end", "failure")),
        jobs_key(47): jobs_json((470, "End-to-end (22.x)", "success")),
    }


def test_history_stops_before_the_failure_and_matches_renamed_jobs() -> None:
    history = job_history(CASE, GitHubHistory(FakeGh(gh_script())))
    assert list(history) == ["dependabot/npm/x", *REFERENCE_BRANCHES]
    dev = history["development-alpha"]
    assert [r.sha for r in dev] == ["s48", "s47"]
    assert dev[0].job_conclusion == "failure"
    assert dev[0].failed_steps == ("End-to-end step",)
    assert dev[1].job_conclusion == "success"
    # A workflow gh cannot list is an empty history, not a crash.
    assert history["dependabot/npm/x"] == ()


def test_each_listing_and_job_query_is_made_once() -> None:
    gh = FakeGh(gh_script())
    source = GitHubHistory(gh)
    job_history(CASE, source)
    job_history(CASE, source)
    assert len(gh.calls) == len(set(gh.calls))


def test_earlier_failures_are_earlier_same_job_and_unlabelled() -> None:
    corpus = [
        make_case(run_id=1, created_at="2026-10-01T00:00:00Z", job="End-to-end (22.x)"),
        make_case(run_id=2, created_at="2026-10-02T00:00:00Z", job="End-to-end"),
        make_case(run_id=3, created_at="2026-10-03T00:00:00Z", job="Lint"),
        make_case(run_id=9, created_at="2026-10-09T00:00:00Z", job="End-to-end"),
        CASE,
    ]
    found = earlier_failures(CASE, corpus)
    assert [f.case_id for f in found] == ["2-10", "1-10"]
    assert not hasattr(found[0], "category")


def test_a_cached_context_needs_no_github(tmp_path: Path) -> None:
    calls: list[str] = []

    def source() -> GitHubHistory:
        calls.append("gh")
        return GitHubHistory(FakeGh(gh_script()))

    first = case_context(CASE, [], tmp_path, source)
    second = case_context(CASE, [], tmp_path, source)
    assert first == second
    assert calls == ["gh"]
    assert (tmp_path / f"{CASE.case_id}.json").exists()
