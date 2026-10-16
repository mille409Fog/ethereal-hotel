"""The boundary: malformed requests are refused by name, and before any work is done."""

import json
from pathlib import Path

import pytest

from ci_triage.github import Run
from ci_triage.intake import (
    MalformedInputError,
    NothingToTriage,
    check_run,
    from_event,
    parse_run_id,
    read_event,
)

REPO = "mille409Fog/ethereal-hotel"


def workflow_run(**overrides: object) -> dict[str, object]:
    run: dict[str, object] = {
        "id": 38077356702,
        "name": "Code Quality",
        "conclusion": "failure",
        "head_repository": {"full_name": REPO},
    }
    run.update(overrides)
    return {"action": "completed", "workflow_run": run}


def test_a_run_id_is_parsed() -> None:
    assert parse_run_id("38077356702") == 38077356702
    assert parse_run_id(" 38077356702\n") == 38077356702


@pytest.mark.parametrize(
    "text",
    [
        "",
        "   ",
        "0",
        "-5",
        "007",
        "12.5",
        "1e9",
        "abc",
        "38077356702; rm -rf /",
        "https://github.com/mille409Fog/ethereal-hotel/actions/runs/38077356702",
        "4ddcd61",
        "1" * 21,
    ],
)
def test_anything_but_a_positive_whole_number_is_malformed(text: str) -> None:
    with pytest.raises(MalformedInputError, match="run id"):
        parse_run_id(text)


def test_a_failed_in_scope_workflow_run_yields_its_id() -> None:
    assert from_event("workflow_run", workflow_run(), REPO) == 38077356702


def test_a_dispatch_yields_the_typed_run_id() -> None:
    event = {"inputs": {"run_id": "38077356702"}}
    assert from_event("workflow_dispatch", event, REPO) == 38077356702


@pytest.mark.parametrize(
    ("name", "payload", "message"),
    [
        ("workflow_run", [], "event payload: expected an object"),
        ("workflow_run", {"action": "completed"}, "workflow_run: expected an object"),
        ("workflow_run", workflow_run(id="38077356702"), "workflow_run.id"),
        ("workflow_run", workflow_run(id=True), "workflow_run.id"),
        ("workflow_run", workflow_run(id=-1), "workflow_run.id"),
        ("workflow_dispatch", {}, "inputs: expected an object"),
        ("workflow_dispatch", {"inputs": {"run_id": 5}}, "inputs.run_id"),
        ("workflow_dispatch", {"inputs": {"run_id": "five"}}, "run id"),
        ("push", workflow_run(), "only workflow_run and workflow_dispatch"),
    ],
)
def test_malformed_events_are_refused_by_name(
    name: str, payload: object, message: str
) -> None:
    with pytest.raises(MalformedInputError, match=message):
        from_event(name, payload, REPO)


@pytest.mark.parametrize(
    ("payload", "message"),
    [
        (workflow_run(conclusion="success"), "did not fail"),
        (workflow_run(conclusion="cancelled"), "did not fail"),
        (workflow_run(conclusion=None), "did not fail"),
        ({**workflow_run(), "action": "requested"}, "has not completed"),
        (workflow_run(name="CI Triage"), "not in scope"),
        (workflow_run(head_repository={"full_name": "someone/fork"}), "forks"),
        (workflow_run(head_repository=None), "forks"),
    ],
)
def test_valid_events_with_nothing_to_do_are_skipped_not_failed(
    payload: object, message: str
) -> None:
    with pytest.raises(NothingToTriage, match=message):
        from_event("workflow_run", payload, REPO)


def test_a_timed_out_run_is_a_failure_too() -> None:
    event = workflow_run(conclusion="timed_out")
    assert from_event("workflow_run", event, REPO) == 38077356702


def test_an_event_file_that_is_not_json_is_malformed(tmp_path: Path) -> None:
    path = tmp_path / "event.json"
    path.write_text('{"workflow_run": {"id": 1', encoding="utf-8")
    with pytest.raises(MalformedInputError, match="event payload"):
        read_event(path, "workflow_run", REPO)


def test_a_missing_event_file_is_malformed(tmp_path: Path) -> None:
    with pytest.raises(MalformedInputError, match="event payload"):
        read_event(tmp_path / "absent.json", "workflow_run", REPO)


def test_an_event_file_is_read(tmp_path: Path) -> None:
    path = tmp_path / "event.json"
    path.write_text(json.dumps(workflow_run()), encoding="utf-8")
    assert read_event(path, "workflow_run", REPO) == 38077356702


def run(workflow: str = "Code Quality", conclusion: str = "failure") -> Run:
    return Run(7, workflow, "main", "push", "sha", "2026-10-16T00:00:00Z", conclusion)


def test_a_typed_run_id_is_checked_against_what_github_says() -> None:
    check_run(run())
    with pytest.raises(NothingToTriage, match="still running"):
        check_run(run(conclusion=""))
    with pytest.raises(NothingToTriage, match="did not fail"):
        check_run(run(conclusion="success"))
    with pytest.raises(NothingToTriage, match="only Code Quality, Supply chain"):
        check_run(run(workflow="Deploy"))
