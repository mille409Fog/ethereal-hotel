"""Gather what the agent's tools will need from GitHub, before the agent starts.

A workflow step, not a tool. The agent never calls GitHub: everything it may ask
about the job's history is fetched here, once, and saved to `data/history/`, so the
investigation runs offline and an evaluation replays the same facts every time. A
re-run reuses the saved file and makes no requests.

Two rules keep the past from leaking the future:

- history stops **before** the failing run, so the run that fixed it never appears;
- earlier failures carry their error lines and **no label**. A deployed triage would
  remember its own past answers, but this golden set repeats a few root causes so
  often that labels would let the agent copy rather than investigate (maintainer's
  decision, 2026-10-15).
"""

from collections.abc import Callable, Iterable
from pathlib import Path
from typing import Final

from ci_triage.corpus import read_json, write_json
from ci_triage.github import (
    Gh,
    GhError,
    Job,
    Run,
    base_job_name,
    jobs_of,
    runs_on,
    same_job,
)
from ci_triage.models import FailedJob
from ci_triage.tools import MAX_FAILURES, CaseContext, EarlierFailure, HistoryRun

# The branches whose history is gathered besides the case's own: where development
# happens, and where it lands.
REFERENCE_BRANCHES: Final = ("development-alpha", "main")
RUNS_PER_BRANCH: Final = 10


class GitHubHistory:
    """`gh` lookups for many cases, each listing and job query made at most once."""

    def __init__(self, gh: Gh) -> None:
        self.gh = gh
        self._runs: dict[tuple[str, str], list[Run]] = {}
        self._jobs: dict[int, list[Job]] = {}

    def runs(self, workflow: str, branch: str) -> list[Run]:
        key = (workflow, branch)
        if key not in self._runs:
            try:
                self._runs[key] = runs_on(self.gh, workflow, branch)
            except GhError:
                # Dependabot's dynamic workflows cannot be listed by name.
                self._runs[key] = []
        return self._runs[key]

    def jobs(self, run_id: int) -> list[Job]:
        if run_id not in self._jobs:
            self._jobs[run_id] = jobs_of(self.gh, run_id)
        return self._jobs[run_id]


def job_history(
    case: FailedJob, source: GitHubHistory
) -> dict[str, tuple[HistoryRun, ...]]:
    branches = list(dict.fromkeys((case.branch, *REFERENCE_BRANCHES)))
    history: dict[str, tuple[HistoryRun, ...]] = {}
    for branch in branches:
        before = [
            run
            for run in source.runs(case.workflow, branch)
            if run.created_at < case.created_at
        ]
        before.sort(key=lambda r: r.created_at, reverse=True)
        runs = []
        for run in before[:RUNS_PER_BRANCH]:
            job = same_job(source.jobs(run.run_id), case.job)
            runs.append(
                HistoryRun(
                    created_at=run.created_at,
                    sha=run.head_sha,
                    event=run.event,
                    run_conclusion=run.conclusion,
                    job_conclusion=job.conclusion if job else "",
                    failed_steps=job.failed_steps if job else (),
                )
            )
        history[branch] = tuple(runs)
    return history


def earlier_failures(
    case: FailedJob, corpus: Iterable[FailedJob]
) -> tuple[EarlierFailure, ...]:
    """Failures of the same job before this one, newest first. Never a label.

    Only as many as the tool can ever show: the cache is committed, and storing the
    rest would grow the repository with lines no investigation could read.
    """
    base = base_job_name(case.job)
    earlier = [
        other
        for other in corpus
        if other.created_at < case.created_at
        and other.case_id != case.case_id
        and base_job_name(other.job) == base
    ]
    earlier.sort(key=lambda c: c.created_at, reverse=True)
    return tuple(
        EarlierFailure(
            case_id=other.case_id,
            created_at=other.created_at,
            branch=other.branch,
            sha=other.head_sha,
            failed_steps=other.failed_steps,
            error_lines=other.excerpt.error_lines,
        )
        for other in earlier[:MAX_FAILURES]
    )


def case_context(
    case: FailedJob,
    corpus: Iterable[FailedJob],
    cache: Path,
    source: Callable[[], GitHubHistory],
) -> CaseContext:
    """The context for one case, from `cache/<case_id>.json` when it is there.

    `source` is only called on a cache miss, so a fully cached evaluation never
    needs `gh` at all.
    """
    path = cache / f"{case.case_id}.json"
    if path.exists():
        return CaseContext.from_json(read_json(path))
    ctx = CaseContext(
        sha=case.head_sha,
        workflow=case.workflow,
        job=case.job,
        branch=case.branch,
        created_at=case.created_at,
        history=job_history(case, source()),
        earlier=earlier_failures(case, corpus),
    )
    write_json(path, ctx.to_json())
    return ctx
