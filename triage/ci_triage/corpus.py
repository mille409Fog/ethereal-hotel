"""The rolling corpus: the 50 most recent failed runs, one JSON file per failed job.

Committed to the repository (ADR 0003), so every write here is meant to be idempotent.
Fetching the same case twice writes the same bytes, rotating twice deletes nothing the
second time, and a write that dies halfway leaves the old file, never half of a new one.
"""

import json
import os
import tempfile
from pathlib import Path
from typing import Final

from ci_triage.models import FailedJob, JsonObject

RUNS_KEPT: Final = 50


def write_json(path: Path, data: JsonObject | list[object]) -> None:
    """Write `data` to `path` atomically, in a stable byte-for-byte form.

    Sorted keys, two-space indent, LF endings and a trailing newline, so an unchanged
    case rewrites identically and git sees no diff. The temp file sits in the target's
    directory because a rename is only atomic within one filesystem.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(data, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    fd, temp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(text)
        os.replace(temp, path)
    except BaseException:
        Path(temp).unlink(missing_ok=True)
        raise


def read_json(path: Path) -> JsonObject:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"{path}: expected a JSON object")
    return data


class Corpus:
    def __init__(self, directory: Path) -> None:
        self.directory = directory

    def path_for(self, case_id: str) -> Path:
        return self.directory / f"{case_id}.json"

    def has(self, case_id: str) -> bool:
        return self.path_for(case_id).exists()

    def save(self, case: FailedJob) -> None:
        write_json(self.path_for(case.case_id), case.to_json())

    def load(self) -> list[FailedJob]:
        """Every case, oldest first, ties broken by case id so the order is stable."""
        cases = [
            FailedJob.from_json(read_json(path))
            for path in self.directory.glob("*.json")
        ]
        return sorted(cases, key=lambda c: (c.created_at, c.case_id))

    def rotate(self, keep_runs: int = RUNS_KEPT) -> list[str]:
        """Delete every case not in the `keep_runs` most recent runs. Returns their ids.

        Counts runs, not files: a run's failed jobs are kept or dropped together, so
        no run is ever half in the corpus.
        """
        cases = self.load()
        newest_first = sorted({(c.created_at, c.run_id) for c in cases}, reverse=True)
        kept_runs = {run_id for _, run_id in newest_first[:keep_runs]}
        dropped = [c.case_id for c in cases if c.run_id not in kept_runs]
        for case_id in dropped:
            self.path_for(case_id).unlink()
        return dropped
