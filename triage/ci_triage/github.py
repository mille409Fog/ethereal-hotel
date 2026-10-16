"""Read this repository's CI history through the `gh` CLI. Read-only, and free.

Everything here goes through one injectable `Gh` callable, so tests replay recorded
answers instead of calling GitHub. `gh` authenticates with the maintainer's own login,
which costs nothing, so it does not pass through the billing guard. That guard is for
`claude` processes only.

Nothing in this module writes to GitHub. The Stage 6 approval gate is the only place
that ever will.
"""

import json
import re
import subprocess
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Final

# Runs `gh <args>` and returns stdout. Raises GhError on a non-zero exit.
Gh = Callable[[list[str]], str]

# The most runs one listing asks for. 68 failures in two months, so 200 covers the
# whole history of a branch with room to spare.
LIST_LIMIT: Final = 200
GH_TIMEOUT_SECONDS: Final = 120

# The waits before each retry of a transient `gh` failure. GitHub asks clients that hit
# its secondary rate limit, and get no Retry-After, to wait at least a minute. `gh`
# does not pass response headers through `run view`, so the last wait is that minute.
GH_BACKOFF_SECONDS: Final = (5.0, 30.0, 60.0)
# What `gh` prints for the failures worth waiting out: throttling, GitHub's own server
# errors, and our timeout in `run_gh`. Anything else (a 404, a bad flag, no login)
# fails the same way however long we wait.
_TRANSIENT = re.compile(
    r"HTTP (?:429|5\d\d)|rate limit|timed out|connection reset|unexpected EOF",
    re.IGNORECASE,
)


class GhError(RuntimeError):
    pass


def is_transient(error: GhError) -> bool:
    return _TRANSIENT.search(str(error)) is not None


def retrying(gh: Gh, sleep: Callable[[float], None] = time.sleep) -> Gh:
    """`gh`, retried with backoff when it fails transiently. Anything else raises."""

    def call(args: list[str]) -> str:
        for wait in GH_BACKOFF_SECONDS:
            try:
                return gh(args)
            except GhError as error:
                if not is_transient(error):
                    raise
            sleep(wait)
        return gh(args)

    return call


def run_gh(args: list[str]) -> str:
    """The real `Gh`."""
    try:
        completed = subprocess.run(
            ["gh", *args],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=GH_TIMEOUT_SECONDS,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as error:
        raise GhError(f"gh {' '.join(args)}: {error}") from error
    if completed.returncode != 0:
        raise GhError(f"gh {' '.join(args)}: {completed.stderr.strip()}")
    return completed.stdout


@dataclass(frozen=True)
class Run:
    run_id: int
    workflow: str
    branch: str
    event: str
    head_sha: str
    created_at: str
    conclusion: str


@dataclass(frozen=True)
class Job:
    job_id: int
    name: str
    conclusion: str
    failed_steps: tuple[str, ...]


_RUN_FIELDS = "databaseId,workflowName,headBranch,event,headSha,createdAt,conclusion"


def _parse_run(item: dict[str, object]) -> Run:
    return Run(
        run_id=int(str(item["databaseId"])),
        workflow=str(item["workflowName"]),
        branch=str(item["headBranch"]),
        event=str(item["event"]),
        head_sha=str(item["headSha"]),
        created_at=str(item["createdAt"]),
        conclusion=str(item.get("conclusion") or ""),
    )


def _parse_runs(stdout: str) -> list[Run]:
    return [_parse_run(item) for item in json.loads(stdout)]


def run_info(gh: Gh, run_id: int) -> Run:
    """One run. Its conclusion is "" while it is still in progress."""
    return _parse_run(
        json.loads(gh(["run", "view", str(run_id), "--json", _RUN_FIELDS]))
    )


def failed_runs(gh: Gh, limit: int = LIST_LIMIT) -> list[Run]:
    """Failed runs, newest first."""
    stdout = gh(
        [
            "run",
            "list",
            "--status",
            "failure",
            "--limit",
            str(limit),
            "--json",
            _RUN_FIELDS,
        ]
    )
    return _parse_runs(stdout)


def runs_on(gh: Gh, workflow: str, branch: str) -> list[Run]:
    """Every run of one workflow on one branch, whatever its outcome, newest first."""
    stdout = gh(
        [
            "run",
            "list",
            "--workflow",
            workflow,
            "--branch",
            branch,
            "--limit",
            str(LIST_LIMIT),
            "--json",
            _RUN_FIELDS,
        ]
    )
    return _parse_runs(stdout)


def jobs_of(gh: Gh, run_id: int) -> list[Job]:
    stdout = gh(["run", "view", str(run_id), "--json", "jobs"])
    jobs = json.loads(stdout)["jobs"]
    return [
        Job(
            job_id=int(job["databaseId"]),
            name=str(job["name"]),
            conclusion=str(job.get("conclusion") or ""),
            failed_steps=tuple(
                str(step["name"])
                for step in job.get("steps", [])
                if step.get("conclusion") == "failure"
            ),
        )
        for job in jobs
    ]


def failed_log(gh: Gh, job_id: int) -> str:
    """The failed steps' log for one job. Empty when GitHub has no log for it."""
    try:
        return gh(["run", "view", "--job", str(job_id), "--log-failed"])
    except GhError:
        # Expired logs and jobs that never started both land here. The case is still
        # worth keeping: its metadata alone says something.
        return ""


def changed_files(gh: Gh, base_sha: str, head_sha: str) -> tuple[str, ...]:
    """Files changed between two commits, via GitHub's compare API.

    The API rather than local git, because Dependabot branches are deleted after they
    merge or close and their commits may not exist in any local clone.
    """
    stdout = gh(
        [
            "api",
            f"repos/{{owner}}/{{repo}}/compare/{base_sha}...{head_sha}",
            "--jq",
            "[.files[].filename]",
        ]
    )
    return tuple(sorted(json.loads(stdout)))


# Matrix jobs carry their axis in the name, and the axis has changed over time:
# "Frontend (lint, test, build) (22.x)" became "Frontend (lint, test, build)". Matching
# a fix across that rename needs the name without it.
_MATRIX_SUFFIX = re.compile(r"\s*\((?:\d+(?:\.\d+)*|\d+(?:\.\d+)*\.x)\)$")


def base_job_name(name: str) -> str:
    return _MATRIX_SUFFIX.sub("", name)


def same_job(jobs: list[Job], name: str) -> Job | None:
    """The job called `name` in a run, matching across a matrix-suffix rename."""
    exact = [job for job in jobs if job.name == name]
    if exact:
        return exact[0]
    base = base_job_name(name)
    renamed = [job for job in jobs if base_job_name(job.name) == base]
    return renamed[0] if renamed else None
