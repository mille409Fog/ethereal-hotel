"""Test doubles shared by the Stage 2 tests: a scripted `gh`, and case builders."""

import json
from collections.abc import Mapping

from ci_triage.github import GhError
from ci_triage.models import Excerpt, FailedJob


class FakeGh:
    """Answers `gh` calls from a script keyed by the argument list; records each call.

    An unscripted call fails the test loudly rather than returning something empty,
    so a test cannot pass by accident on a request it never meant to make.
    """

    def __init__(self, script: Mapping[tuple[str, ...], str | Exception]) -> None:
        self.script = dict(script)
        self.calls: list[tuple[str, ...]] = []

    def __call__(self, args: list[str]) -> str:
        key = tuple(args)
        self.calls.append(key)
        if key not in self.script:
            raise AssertionError(f"unscripted gh call: {key}")
        answer = self.script[key]
        if isinstance(answer, Exception):
            raise answer
        return answer


RUN_FIELDS = "databaseId,workflowName,headBranch,event,headSha,createdAt,conclusion"


def run_json(
    run_id: int,
    created_at: str,
    sha: str = "sha",
    conclusion: str = "failure",
    workflow: str = "Code Quality",
    branch: str = "main",
) -> dict[str, object]:
    return {
        "databaseId": run_id,
        "workflowName": workflow,
        "headBranch": branch,
        "event": "push",
        "headSha": sha,
        "createdAt": created_at,
        "conclusion": conclusion,
    }


def jobs_json(*jobs: tuple[int, str, str]) -> str:
    return json.dumps(
        {
            "jobs": [
                {
                    "databaseId": job_id,
                    "name": name,
                    "conclusion": conclusion,
                    "steps": [
                        {"name": "Set up job", "conclusion": "success"},
                        {"name": f"{name} step", "conclusion": conclusion},
                    ],
                }
                for job_id, name, conclusion in jobs
            ]
        }
    )


def failed_runs_key(limit: int = 200) -> tuple[str, ...]:
    return (
        "run", "list", "--status", "failure", "--limit", str(limit),
        "--json", RUN_FIELDS,
    )  # fmt: skip


def runs_on_key(
    workflow: str = "Code Quality", branch: str = "main"
) -> tuple[str, ...]:
    return (
        "run", "list", "--workflow", workflow, "--branch", branch,
        "--limit", "200", "--json", RUN_FIELDS,
    )  # fmt: skip


def jobs_key(run_id: int) -> tuple[str, ...]:
    return ("run", "view", str(run_id), "--json", "jobs")


def log_key(job_id: int) -> tuple[str, ...]:
    return ("run", "view", "--job", str(job_id), "--log-failed")


def compare_key(base: str, head: str) -> tuple[str, ...]:
    return (
        "api",
        f"repos/{{owner}}/{{repo}}/compare/{base}...{head}",
        "--jq",
        "[.files[].filename]",
    )


def make_case(
    run_id: int = 1,
    job_id: int = 10,
    created_at: str = "2026-10-01T00:00:00Z",
    job: str = "End-to-end",
    workflow: str = "Code Quality",
    branch: str = "main",
    sha: str = "sha",
    text: str = "",
    error_lines: tuple[str, ...] = (),
    failed_steps: tuple[str, ...] = ("Run end-to-end suite",),
) -> FailedJob:
    return FailedJob(
        run_id=run_id,
        job_id=job_id,
        workflow=workflow,
        job=job,
        failed_steps=failed_steps,
        branch=branch,
        event="push",
        head_sha=sha,
        created_at=created_at,
        excerpt=Excerpt(
            text=text, error_lines=error_lines, source_lines=1, truncated=False
        ),
    )


__all__ = ["FakeGh", "GhError", "make_case"]
