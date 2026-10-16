"""The boundary: turn what started a triage into a run id, or refuse it with a reason.

Three ways in, all checked here before anything is fetched or any model is called:

    workflow_run       GitHub's event when Code Quality or Supply chain finishes
    workflow_dispatch  someone pressed "Run workflow" and typed a run id
    the command line   `npm run triage:run -- <run_id>`

Two kinds of refusal, kept apart because they mean different things:

- `MalformedInputError`: the request itself is broken (not JSON, no run id, a run id
  that is not a number). Something upstream has a bug; the command exits 2.
- `NothingToTriage`: a well-formed request with nothing to do (the run passed, it is
  another workflow, it came from a fork). That is the normal case for most events and
  exits 0, so a green CI run never turns the triage job red.

Neither is ever "processed" as an empty case. Both stop before any `gh` call.
"""

import json
import re
from pathlib import Path
from typing import Final

from ci_triage.fetch import FAILED_CONCLUSIONS
from ci_triage.github import Run
from ci_triage.models import JsonObject

# The workflows whose failures are in scope (PROJECT_BRIEF.md §In scope), by the name
# GitHub reports. The triage workflow is deliberately absent: it never triages itself.
IN_SCOPE_WORKFLOWS: Final = frozenset({"Code Quality", "Supply chain"})

# GitHub's run ids are positive integers, currently 11 digits. Twenty is generous and
# still rejects a pasted URL, a SHA, or a number padded with zeros.
_RUN_ID = re.compile(r"[1-9][0-9]{0,19}")


class MalformedInputError(ValueError):
    """The request is not one this program understands."""


class NothingToTriage(Exception):  # noqa: N818 - an outcome, not an error
    """A valid request that has nothing to triage. The message says why."""


def parse_run_id(text: str) -> int:
    candidate = text.strip()
    if not _RUN_ID.fullmatch(candidate):
        raise MalformedInputError(
            f"run id: expected a positive whole number, got {text!r}"
        )
    return int(candidate)


def _object(data: object, where: str) -> JsonObject:
    if not isinstance(data, dict):
        raise MalformedInputError(f"{where}: expected an object, got {data!r:.80}")
    return data


def from_event(name: str, payload: object, repository: str) -> int:
    """The run id an Actions event asks about. `repository` is `owner/name`."""
    event = _object(payload, "event payload")
    if name == "workflow_dispatch":
        inputs = _object(event.get("inputs"), "inputs")
        run_id = inputs.get("run_id")
        if not isinstance(run_id, str):
            raise MalformedInputError(f"inputs.run_id: expected text, got {run_id!r}")
        return parse_run_id(run_id)
    if name != "workflow_run":
        raise MalformedInputError(
            f"event {name!r}: only workflow_run and workflow_dispatch start a triage"
        )

    run = _object(event.get("workflow_run"), "workflow_run")
    run_id = run.get("id")
    if not isinstance(run_id, int) or isinstance(run_id, bool) or run_id <= 0:
        raise MalformedInputError(f"workflow_run.id: expected a run id, got {run_id!r}")
    if event.get("action") != "completed":
        raise NothingToTriage(f"run {run_id} has not completed")
    conclusion = run.get("conclusion")
    if conclusion not in FAILED_CONCLUSIONS:
        raise NothingToTriage(f"run {run_id} did not fail (conclusion: {conclusion})")
    if run.get("name") not in IN_SCOPE_WORKFLOWS:
        raise NothingToTriage(f"run {run_id} is {run.get('name')!r}, not in scope")
    head = run.get("head_repository")
    head_name = head.get("full_name") if isinstance(head, dict) else None
    if head_name != repository:
        # The job holds the subscription token, and a fork's log is text its author
        # wrote. The workflow's `if:` refuses these too; this is the second lock.
        raise NothingToTriage(
            f"run {run_id} came from {head_name!r}, not {repository!r}: runs from "
            "forks are not triaged"
        )
    return run_id


def read_event(path: Path, name: str, repository: str) -> int:
    """`from_event` for the payload file Actions writes to $GITHUB_EVENT_PATH."""
    try:
        payload: object = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise MalformedInputError(f"event payload {path}: {error}") from error
    return from_event(name, payload, repository)


def check_run(run: Run) -> None:
    """Refuse a run that is out of scope or did not fail. GitHub's word, not the
    event's: a run id typed by hand carries no claims to check."""
    if run.workflow not in IN_SCOPE_WORKFLOWS:
        raise NothingToTriage(
            f"run {run.run_id} is {run.workflow!r}; only "
            f"{', '.join(sorted(IN_SCOPE_WORKFLOWS))} are triaged"
        )
    if run.conclusion not in FAILED_CONCLUSIONS:
        state = run.conclusion or "still running"
        raise NothingToTriage(f"run {run.run_id} did not fail ({state})")
