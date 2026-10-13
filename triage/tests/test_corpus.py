"""The corpus store: stable bytes, atomic writes, and rotation by run."""

import os
from pathlib import Path

import pytest
from fakes import make_case

from ci_triage.corpus import Corpus, read_json, write_json


def test_write_json_is_stable_sorted_and_lf(tmp_path: Path) -> None:
    path = tmp_path / "x.json"
    write_json(path, {"b": 1, "a": "é"})
    first = path.read_bytes()
    write_json(path, {"a": "é", "b": 1})
    assert path.read_bytes() == first
    assert first == '{\n  "a": "é",\n  "b": 1\n}\n'.encode()


def test_a_failed_write_leaves_the_old_file_and_no_temp_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    path = tmp_path / "x.json"
    write_json(path, {"version": 1})

    def explode(src: str, dst: Path) -> None:
        raise OSError("disk full")

    monkeypatch.setattr(os, "replace", explode)
    with pytest.raises(OSError):
        write_json(path, {"version": 2})
    assert read_json(path) == {"version": 1}
    assert [p.name for p in tmp_path.iterdir()] == ["x.json"]


def test_save_then_load_returns_cases_oldest_first(tmp_path: Path) -> None:
    corpus = Corpus(tmp_path)
    newer = make_case(run_id=2, created_at="2026-10-02T00:00:00Z")
    older = make_case(run_id=1, created_at="2026-10-01T00:00:00Z")
    corpus.save(newer)
    corpus.save(older)
    assert corpus.load() == [older, newer]
    assert corpus.has(older.case_id)


def test_saving_the_same_case_twice_changes_nothing(tmp_path: Path) -> None:
    corpus = Corpus(tmp_path)
    case = make_case()
    corpus.save(case)
    before = corpus.path_for(case.case_id).read_bytes()
    corpus.save(case)
    assert corpus.path_for(case.case_id).read_bytes() == before


def test_rotation_keeps_the_newest_runs_with_all_their_jobs(tmp_path: Path) -> None:
    corpus = Corpus(tmp_path)
    for run_id in range(1, 6):
        stamp = f"2026-10-0{run_id}T00:00:00Z"
        corpus.save(make_case(run_id=run_id, job_id=1, created_at=stamp))
        corpus.save(make_case(run_id=run_id, job_id=2, created_at=stamp))

    dropped = corpus.rotate(keep_runs=3)

    assert sorted(dropped) == ["1-1", "1-2", "2-1", "2-2"]
    assert sorted({c.run_id for c in corpus.load()}) == [3, 4, 5]
    assert len(corpus.load()) == 6
    assert corpus.rotate(keep_runs=3) == []  # idempotent
