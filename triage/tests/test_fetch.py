"""Fetch end to end over a scripted `gh`: new cases in, old runs out, idempotent."""

import json
from pathlib import Path

from fakes import FakeGh, failed_runs_key, jobs_json, jobs_key, log_key, run_json

from ci_triage.corpus import Corpus
from ci_triage.fetch import fetch

LOG = (
    "job\tstep\t2026-10-01T00:00:00Z setup\n"
    "job\tstep\t2026-10-01T00:00:01Z ##[error]boom"
)


def scripted_gh() -> FakeGh:
    runs = [
        run_json(3, "2026-10-03T00:00:00Z"),
        run_json(2, "2026-10-02T00:00:00Z"),
        run_json(1, "2026-10-01T00:00:00Z"),
    ]
    script: dict[tuple[str, ...], str | Exception] = {
        failed_runs_key(): json.dumps(runs)
    }
    for run_id in (1, 2, 3):
        script[jobs_key(run_id)] = jobs_json(
            (run_id * 10, "E2E", "failure"),
            (run_id * 10 + 1, "Lint", "success"),
            (run_id * 10 + 2, "Lighthouse", "timed_out"),
        )
        script[log_key(run_id * 10)] = LOG
        script[log_key(run_id * 10 + 2)] = LOG
    return FakeGh(script)


def test_fetch_saves_one_case_per_failed_job_and_trims_it(tmp_path: Path) -> None:
    corpus = Corpus(tmp_path)
    report = fetch(scripted_gh(), corpus)
    assert sorted(report.added) == ["1-10", "1-12", "2-20", "2-22", "3-30", "3-32"]
    case = corpus.load()[0]
    assert case.excerpt.error_lines == ("boom",)
    assert case.failed_steps == ("E2E step",)


def test_a_second_fetch_requests_no_logs_and_changes_no_file(tmp_path: Path) -> None:
    corpus = Corpus(tmp_path)
    fetch(scripted_gh(), corpus)
    before = {p.name: p.read_bytes() for p in tmp_path.iterdir()}

    gh = scripted_gh()
    report = fetch(gh, corpus)

    assert report.added == []
    assert sorted(report.skipped_runs) == [1, 2, 3]
    assert not [call for call in gh.calls if "--log-failed" in call]
    assert {p.name: p.read_bytes() for p in tmp_path.iterdir()} == before


def test_fetch_rotates_to_the_newest_runs(tmp_path: Path) -> None:
    corpus = Corpus(tmp_path)
    report = fetch(scripted_gh(), corpus, keep_runs=2)
    assert {c.run_id for c in corpus.load()} == {2, 3}
    assert report.dropped == []  # run 1 is never fetched past the cap
