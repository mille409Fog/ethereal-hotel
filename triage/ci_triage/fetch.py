"""Bring the corpus up to date with GitHub: add new failures, then rotate to 50 runs.

Idempotent. A run that already has a case on disk is skipped without fetching its log,
so running this twice in a row makes no log requests the second time and changes no
file.
"""

from dataclasses import dataclass, field

from ci_triage.corpus import RUNS_KEPT, Corpus
from ci_triage.github import Gh, failed_log, failed_runs, jobs_of
from ci_triage.models import FailedJob
from ci_triage.trim import trim

# A job that ran out of time failed just as surely as one that failed an assertion.
FAILED_CONCLUSIONS = frozenset({"failure", "timed_out"})


@dataclass
class FetchReport:
    added: list[str] = field(default_factory=list)
    skipped_runs: list[int] = field(default_factory=list)
    dropped: list[str] = field(default_factory=list)


def fetch(gh: Gh, corpus: Corpus, keep_runs: int = RUNS_KEPT) -> FetchReport:
    report = FetchReport()
    existing_runs = {case.run_id for case in corpus.load()}

    for run in failed_runs(gh)[:keep_runs]:
        if run.run_id in existing_runs:
            report.skipped_runs.append(run.run_id)
            continue
        for job in jobs_of(gh, run.run_id):
            if job.conclusion not in FAILED_CONCLUSIONS:
                continue
            case = FailedJob(
                run_id=run.run_id,
                job_id=job.job_id,
                workflow=run.workflow,
                job=job.name,
                failed_steps=job.failed_steps,
                branch=run.branch,
                event=run.event,
                head_sha=run.head_sha,
                created_at=run.created_at,
                excerpt=trim(failed_log(gh, job.job_id)),
            )
            corpus.save(case)
            report.added.append(case.case_id)

    report.dropped = corpus.rotate(keep_runs)
    return report
