"""Finding fixes in history, keeping judgments safe, and freezing exactly once."""

import json
from pathlib import Path

import pytest
from fakes import (
    FakeGh,
    compare_key,
    jobs_json,
    jobs_key,
    make_case,
    run_json,
    runs_on_key,
)

from ci_triage.corpus import read_json, write_json
from ci_triage.github import GhError
from ci_triage.labels import (
    NO_FIX,
    AlreadyFrozenError,
    cached_jobs,
    find_fix,
    freeze,
    load_golden,
    update_labels,
)
from ci_triage.models import Category, FailedJob

CASE = make_case(run_id=1, job_id=10, created_at="2026-10-01T00:00:00Z", sha="s1")


def history(*runs: tuple[int, str, str, str]) -> FakeGh:
    """Runs after CASE: (run_id, created_at, sha, conclusion of its End-to-end job).

    The listing also contains CASE's own run, as GitHub's would; find_fix must skip it.
    """
    listed = [run_json(CASE.run_id, CASE.created_at, sha=CASE.head_sha)]
    listed += [run_json(r, t, sha=s) for r, t, s, _ in runs]
    script: dict[tuple[str, ...], str | Exception] = {runs_on_key(): json.dumps(listed)}
    for run_id, _, _, conclusion in runs:
        script[jobs_key(run_id)] = jobs_json((run_id * 10, "End-to-end", conclusion))
    return FakeGh(script)


def test_the_fix_is_the_diff_from_the_last_failure_to_the_first_pass() -> None:
    gh = history(
        (2, "2026-10-02T00:00:00Z", "s2", "failure"),
        (3, "2026-10-03T00:00:00Z", "s3", "failure"),
        (4, "2026-10-04T00:00:00Z", "s4", "success"),
        (5, "2026-10-05T00:00:00Z", "s5", "success"),
    )
    gh.script[compare_key("s3", "s4")] = '["e2e/support/lobby.ts"]'
    evidence = find_fix(gh, CASE, cached_jobs(gh))
    assert evidence.fix_run_id == 4
    assert evidence.fix_files == ("e2e/support/lobby.ts",)
    assert not evidence.same_sha_rerun


def test_a_pass_on_the_same_commit_is_a_rerun_with_no_files() -> None:
    gh = history((2, "2026-10-02T00:00:00Z", "s1", "success"))
    evidence = find_fix(gh, CASE, cached_jobs(gh))
    assert evidence.same_sha_rerun
    assert evidence.fix_files == ()
    assert not [c for c in gh.calls if c[0] == "api"]


def test_cancelled_runs_do_not_move_the_last_failing_commit() -> None:
    gh = history(
        (2, "2026-10-02T00:00:00Z", "s2", "cancelled"),
        (3, "2026-10-03T00:00:00Z", "s3", "success"),
    )
    gh.script[compare_key("s1", "s3")] = '["a.py"]'
    assert find_fix(gh, CASE, cached_jobs(gh)).fix_files == ("a.py",)


def test_no_later_pass_means_no_fix() -> None:
    gh = history((2, "2026-10-02T00:00:00Z", "s2", "failure"))
    assert find_fix(gh, CASE, cached_jobs(gh)) == NO_FIX


def test_a_workflow_that_cannot_be_listed_means_no_fix() -> None:
    gh = FakeGh({runs_on_key(): GhError("could not find any workflows")})
    assert find_fix(gh, CASE, cached_jobs(gh)) == NO_FIX


def test_a_renamed_matrix_job_still_matches() -> None:
    case = make_case(created_at="2026-10-01T00:00:00Z", job="Frontend (22.x)", sha="s1")
    gh = FakeGh(
        {
            runs_on_key(): json.dumps([run_json(2, "2026-10-02T00:00:00Z", sha="s1")]),
            jobs_key(2): jobs_json((20, "Frontend", "success")),
        }
    )
    assert find_fix(gh, case, cached_jobs(gh)).fix_run_id == 2


# --- the labels file and the freeze ------------------------------------------------


def test_update_labels_never_touches_an_existing_judgment(tmp_path: Path) -> None:
    path = tmp_path / "labels.json"
    write_json(path, {CASE.case_id: {"category": "flaky", "note": "mine"}})
    other = make_case(run_id=2, job_id=20, created_at="2026-10-02T00:00:00Z")
    gh = FakeGh({runs_on_key(): "[]"})

    added = update_labels(path, [CASE, other], gh, cached_jobs(gh))

    labels = read_json(path)
    new = labels["2-20"]
    assert added == ["2-20"]
    assert labels[CASE.case_id] == {"category": "flaky", "note": "mine"}
    assert isinstance(new, dict)
    assert new["category"] is None


def confirmed_labels(tmp_path: Path, count: int) -> tuple[Path, list[FailedJob]]:
    cases = [
        make_case(run_id=i, job_id=i, created_at=f"2026-10-{i:02d}T00:00:00Z")
        for i in range(1, count + 1)
    ]
    entries: dict[str, object] = {
        c.case_id: {
            "evidence": {
                "fix_run_id": None,
                "fix_sha": None,
                "fix_files": [],
                "same_sha_rerun": False,
            },
            "proposed": "threshold",
            "note": "n",
            "category": "threshold",
        }
        for c in cases
    }
    path = tmp_path / "labels.json"
    write_json(path, entries)
    return path, cases


def test_freeze_holds_out_the_newest_thirty_percent(tmp_path: Path) -> None:
    path, cases = confirmed_labels(tmp_path, 10)
    freeze(path, cases, tmp_path / "golden")
    golden = load_golden(tmp_path / "golden")
    assert [g.split for g in golden] == ["tune"] * 7 + ["holdout"] * 3
    assert all(g.category is Category.THRESHOLD for g in golden)


def test_freeze_skips_unconfirmed_cases(tmp_path: Path) -> None:
    path, cases = confirmed_labels(tmp_path, 3)
    labels = read_json(path)
    entry = labels[cases[0].case_id]
    assert isinstance(entry, dict)
    entry["category"] = None
    write_json(path, labels)
    assert len(freeze(path, cases, tmp_path / "golden")) == 2


def test_freeze_refuses_to_run_twice(tmp_path: Path) -> None:
    path, cases = confirmed_labels(tmp_path, 3)
    freeze(path, cases, tmp_path / "golden")
    with pytest.raises(AlreadyFrozenError):
        freeze(path, cases, tmp_path / "golden")


def test_freeze_rejects_a_category_that_is_not_one_of_the_five(tmp_path: Path) -> None:
    path, cases = confirmed_labels(tmp_path, 1)
    labels = read_json(path)
    entry = labels[cases[0].case_id]
    assert isinstance(entry, dict)
    entry["category"] = "gremlins"
    write_json(path, labels)
    with pytest.raises(ValueError):
        freeze(path, cases, tmp_path / "golden")
