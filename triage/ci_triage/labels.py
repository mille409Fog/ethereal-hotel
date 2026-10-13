"""Build the golden set: find each case's fix in history, collect judgments, freeze.

Labelling is split between a mechanical half and a human half, kept in one file,
`triage/data/labels.json`:

- `evidence` is mechanical: the first later run where the same job passed, the files
  changed to get there, and whether it was a re-run of the very same commit. This code
  fills it in and never changes it afterwards.
- `proposed` and `note` are drafted by Claude in a Claude Code session, from reading
  the excerpt and the evidence. They are never produced by the rule classifier being
  scored, which would make the answer key agree with the thing it grades.
- `category` is the maintainer's confirmed answer. Only cases with one are frozen.

`freeze` then copies the confirmed cases into `triage/data/golden/`, assigns the
held-out split by time, and refuses to run a second time: an answer key that changes
makes this week's score incomparable with last week's.
"""

import math
from collections.abc import Callable
from pathlib import Path
from typing import Final

from ci_triage.corpus import read_json, write_json
from ci_triage.github import (
    Gh,
    GhError,
    Job,
    base_job_name,
    changed_files,
    jobs_of,
    runs_on,
)
from ci_triage.models import (
    Category,
    FailedJob,
    FixEvidence,
    GoldenCase,
    JsonObject,
)

# The newest 30% of confirmed cases are held out. Split by time, never at random: many
# failures share a root cause, and a random split would put near-duplicates on both
# sides and inflate the score (brief §Success metrics).
HOLDOUT_FRACTION: Final = 0.3

JobsLookup = Callable[[int], list[Job]]


def cached_jobs(gh: Gh) -> JobsLookup:
    cache: dict[int, list[Job]] = {}

    def lookup(run_id: int) -> list[Job]:
        if run_id not in cache:
            cache[run_id] = jobs_of(gh, run_id)
        return cache[run_id]

    return lookup


def _same_job(jobs: list[Job], name: str) -> Job | None:
    exact = [job for job in jobs if job.name == name]
    if exact:
        return exact[0]
    base = base_job_name(name)
    renamed = [job for job in jobs if base_job_name(job.name) == base]
    return renamed[0] if renamed else None


NO_FIX: Final = FixEvidence(
    fix_run_id=None, fix_sha=None, fix_files=(), same_sha_rerun=False
)


def find_fix(gh: Gh, case: FailedJob, jobs: JobsLookup) -> FixEvidence:
    """The change that turned this job green again, found in later runs.

    Walks later runs of the same workflow and branch, oldest first, to the first one
    where the job passed. The fix is the diff from the *last* run where it still
    failed, not from the case's own commit: a job that stayed red across ten pushes
    would otherwise be "fixed" by all ten, and a 119-file answer key is hit by any
    guess. (That was measured on the first draft of this function.)
    """
    try:
        later = [
            run
            for run in runs_on(gh, case.workflow, case.branch)
            if run.created_at > case.created_at
        ]
    except GhError:
        # Dynamic workflows (Dependabot's own) cannot be listed by name.
        return NO_FIX

    last_failing_sha = case.head_sha
    for run in sorted(later, key=lambda r: r.created_at):
        job = _same_job(jobs(run.run_id), case.job)
        if job is None:
            continue
        if job.conclusion != "success":
            if job.conclusion in ("failure", "timed_out"):
                last_failing_sha = run.head_sha
            continue
        same = run.head_sha == last_failing_sha
        files = () if same else changed_files(gh, last_failing_sha, run.head_sha)
        return FixEvidence(
            fix_run_id=run.run_id,
            fix_sha=run.head_sha,
            fix_files=files,
            same_sha_rerun=same,
        )
    return NO_FIX


def update_labels(
    path: Path, cases: list[FailedJob], gh: Gh, jobs: JobsLookup
) -> list[str]:
    """Add an entry with evidence for every case not yet in the labels file.

    Existing entries are never touched, so a judgment written into the file survives
    every later run of this command. Returns the ids it added.
    """
    labels = read_json(path) if path.exists() else {}
    added = []
    for case in cases:
        if case.case_id in labels:
            continue
        evidence = find_fix(gh, case, jobs)
        labels[case.case_id] = {
            "evidence": {
                "fix_run_id": evidence.fix_run_id,
                "fix_sha": evidence.fix_sha,
                "fix_files": list(evidence.fix_files),
                "same_sha_rerun": evidence.same_sha_rerun,
            },
            "proposed": None,
            "note": "",
            "category": None,
        }
        added.append(case.case_id)
    write_json(path, labels)
    return added


class AlreadyFrozenError(RuntimeError):
    pass


def freeze(labels_path: Path, cases: list[FailedJob], golden_dir: Path) -> list[str]:
    """Write every confirmed case to the golden set, once. Returns the frozen ids."""
    if golden_dir.exists() and any(golden_dir.glob("*.json")):
        raise AlreadyFrozenError(
            f"{golden_dir} already holds a frozen golden set. Delete it on purpose if "
            "the answer key really has to change, and say why in triage/docs/."
        )
    labels = read_json(labels_path)
    by_id = {case.case_id: case for case in cases}

    confirmed: list[tuple[FailedJob, JsonObject]] = []
    for case_id, entry in labels.items():
        if not isinstance(entry, dict) or entry.get("category") is None:
            continue
        if case_id not in by_id:
            continue  # rotated out of the corpus before it was confirmed
        confirmed.append((by_id[case_id], entry))

    confirmed.sort(key=lambda pair: (pair[0].created_at, pair[0].case_id))
    holdout_from = len(confirmed) - math.ceil(len(confirmed) * HOLDOUT_FRACTION)

    frozen = []
    for index, (case, entry) in enumerate(confirmed):
        evidence = entry.get("evidence")
        if not isinstance(evidence, dict):
            raise ValueError(f"{case.case_id}: evidence missing from {labels_path}")
        golden = GoldenCase(
            case=case,
            evidence=FixEvidence.from_json(evidence),
            category=Category(str(entry["category"])),
            note=str(entry.get("note", "")),
            split="holdout" if index >= holdout_from else "tune",
        )
        write_json(golden_dir / f"{case.case_id}.json", golden.to_json())
        frozen.append(case.case_id)
    return frozen


def load_golden(golden_dir: Path) -> list[GoldenCase]:
    cases = [GoldenCase.from_json(read_json(p)) for p in golden_dir.glob("*.json")]
    return sorted(cases, key=lambda g: (g.case.created_at, g.case.case_id))
