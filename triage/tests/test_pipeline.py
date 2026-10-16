"""Stage 5: checkpoints, resuming, failure modes, and concurrency under the limits.

The model and GitHub are fakes throughout. What is under test is the orchestration:
which steps run, which are reused, and what stops what.
"""

import json
import threading
import time
from collections.abc import Callable, Sequence
from pathlib import Path

import pytest
from fakes import (
    RUN_FIELDS,
    FakeGh,
    jobs_json,
    jobs_key,
    log_key,
    make_case,
    run_json,
)

from ci_triage.claude_cli import ClaudeCallError, UsageLimitError
from ci_triage.github import GH_BACKOFF_SECONDS, GhError, retrying
from ci_triage.intake import NothingToTriage
from ci_triage.models import Category, Confidence, FailedJob, Triage, TriageRecord
from ci_triage.pipeline import (
    STATE_SCHEMA,
    STEPS,
    Checkpoints,
    Deps,
    RunReport,
    choose,
    render_summary,
    triage_run,
)
from ci_triage.tools import CaseContext

RUN_ID = 500
BRANCH = "development-alpha"
LOG = "##[error]Timed out waiting for the lobby\nTimeout 20000ms exceeded\n"

# Runs `fetch` → FailedJob etc. GitHub's view of the run, and its history listings.
RUN_KEY = ("run", "view", str(RUN_ID), "--json", RUN_FIELDS)
NO_HISTORY = "[]"


def history_keys() -> dict[tuple[str, ...], str | Exception]:
    return {
        (
            "run", "list", "--workflow", "Code Quality", "--branch", branch,
            "--limit", "200", "--json", RUN_FIELDS,
        ): NO_HISTORY
        for branch in (BRANCH, "main")
    }  # fmt: skip


def github(
    job_ids: Sequence[int] = (11,),
    log: str | Exception = LOG,
    conclusion: str = "failure",
    workflow: str = "Code Quality",
) -> FakeGh:
    run = run_json(
        RUN_ID,
        "2026-10-16T00:00:00Z",
        sha="abc1234567",
        conclusion=conclusion,
        workflow=workflow,
        branch=BRANCH,
    )
    script: dict[tuple[str, ...], str | Exception] = {
        RUN_KEY: json.dumps(run),
        jobs_key(RUN_ID): jobs_json(
            *((job_id, f"Job {job_id}", "failure") for job_id in job_ids)
        ),
        **history_keys(),
    }
    for job_id in job_ids:
        script[log_key(job_id)] = log
    return FakeGh(script)


def triage(category: Category = Category.THRESHOLD) -> Triage:
    return Triage(
        category=category,
        hypothesis="The lobby missed its budget.",
        evidence=("Timeout 20000ms exceeded",),
        suggested_files=("e2e/support/lobby.ts",),
        fix_rationale="The budget lives there.",
        confidence=Confidence.HIGH,
    )


def record(case: FailedJob, source: str, reason: str | None = None) -> TriageRecord:
    return TriageRecord.from_json(
        {
            "case_id": case.case_id,
            "prompt_version": {"agent": "investigate.v1"}.get(source, "classify.v2"),
            "source": source,
            "triage": triage().to_json(),
            "usage": None,
            "fallback_reason": reason,
        }
    )


class FakeModel:
    """Both strategies. Counts calls, and can be told to fail or to take its time."""

    def __init__(
        self,
        classify: Callable[[FailedJob], TriageRecord] | None = None,
        investigate: Callable[[FailedJob], TriageRecord] | None = None,
        delay: float = 0.0,
    ) -> None:
        self._classify = classify or (lambda case: record(case, "model"))
        self._investigate = investigate or (lambda case: record(case, "agent"))
        self.delay = delay
        self.calls: list[str] = []
        self.in_flight = 0
        self.max_in_flight = 0
        self._lock = threading.Lock()

    def _enter(self, what: str) -> None:
        with self._lock:
            self.calls.append(what)
            self.in_flight += 1
            self.max_in_flight = max(self.max_in_flight, self.in_flight)

    def _leave(self) -> None:
        with self._lock:
            self.in_flight -= 1

    def classify(self, case: FailedJob) -> TriageRecord:
        self._enter(f"classify {case.job_id}")
        try:
            time.sleep(self.delay)
            return self._classify(case)
        finally:
            self._leave()

    def investigate(self, case: FailedJob, ctx: CaseContext) -> TriageRecord:
        assert ctx.sha == case.head_sha
        self._enter(f"investigate {case.job_id}")
        try:
            time.sleep(self.delay)
            return self._investigate(case)
        finally:
            self._leave()


def deps(gh: Callable[[list[str]], str], model: FakeModel) -> Deps:
    return Deps(
        gh=gh, corpus=lambda: [], classify=model.classify, investigate=model.investigate
    )


def store(state: Path, job_id: int = 11) -> Checkpoints:
    return Checkpoints(state / str(RUN_ID) / str(job_id))


def refuse(case: FailedJob) -> TriageRecord:
    raise AssertionError(f"the model was called for {case.case_id}")


# --- the happy path, and resuming it --------------------------------------------


def test_a_run_checkpoints_every_step_and_reports_the_agents_answer(
    tmp_path: Path,
) -> None:
    model = FakeModel()
    report = triage_run(RUN_ID, deps(github(), model), tmp_path)

    (case,) = report.cases
    assert case.status == "done"
    assert case.verdict is not None
    assert case.verdict.record.source == "agent"
    assert case.reused == ()
    assert store(tmp_path).done() == list(STEPS)
    assert model.calls == ["classify 11", "investigate 11"]
    assert not report.resumable


def test_a_finished_case_is_never_redone(tmp_path: Path) -> None:
    triage_run(RUN_ID, deps(github(), FakeModel()), tmp_path)

    # No log, no history and no model this time: every step must come from disk.
    full = github().script
    again = FakeGh({key: full[key] for key in (RUN_KEY, jobs_key(RUN_ID))})
    report = triage_run(
        RUN_ID, deps(again, FakeModel(classify=refuse, investigate=refuse)), tmp_path
    )

    (case,) = report.cases
    assert case.status == "done"
    assert case.reused == STEPS
    assert len(again.calls) == 2


def test_a_run_stopped_by_the_limit_resumes_without_paying_twice(
    tmp_path: Path,
) -> None:
    def limited(case: FailedJob) -> TriageRecord:
        raise UsageLimitError("You've hit your session limit")

    first = triage_run(RUN_ID, deps(github(), FakeModel(investigate=limited)), tmp_path)
    assert first.cases[0].status == "stopped"
    assert first.resumable
    assert "session limit" in (first.stopped or "")
    assert store(tmp_path).done() == ["fetch", "context", "classify"]

    model = FakeModel(classify=refuse)
    gh = github()
    second = triage_run(RUN_ID, deps(gh, model), tmp_path)

    assert second.cases[0].status == "done"
    assert second.cases[0].reused == ("fetch", "context", "classify")
    assert model.calls == ["investigate 11"]
    assert log_key(11) not in gh.calls


# --- choosing the answer ---------------------------------------------------------


def test_the_investigation_wins_when_it_answered() -> None:
    case = github_case()
    verdict = choose(record(case, "model"), record(case, "agent"))
    assert verdict.record.source == "agent"
    assert verdict.notes == ()


def test_the_single_call_stands_in_when_the_investigation_gave_nothing() -> None:
    case = github_case()
    verdict = choose(
        record(case, "model"), record(case, "rules", "time limit reached (120s)")
    )
    assert verdict.record.source == "model"
    assert verdict.record.prompt_version == "classify.v2"
    assert "time limit reached" in verdict.notes[0]
    assert "single call's answer stands" in verdict.notes[0]


def test_the_rules_answer_only_when_neither_model_did() -> None:
    case = github_case()
    verdict = choose(
        record(case, "rules", "invalid answer: category"),
        record(case, "rules", "token cap reached"),
    )
    assert verdict.record.source == "rules"
    assert "token cap reached" in verdict.notes[0]
    assert "invalid answer" in verdict.notes[0]


def github_case() -> FailedJob:
    return make_case(run_id=RUN_ID, job_id=11)


# --- malformed state and missing input -------------------------------------------


def write_raw(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


@pytest.mark.parametrize(
    ("contents", "message"),
    [
        ('{"schema": 1, "step": "classify", "out', "unreadable"),
        ("[]", "unreadable"),
        (
            json.dumps({"schema": 0, "step": "classify", "output": {}}),
            "expected schema 1",
        ),
        (
            json.dumps({"schema": STATE_SCHEMA, "step": "fetch", "output": {}}),
            "for step 'fetch'",
        ),
        (
            json.dumps({"schema": STATE_SCHEMA, "step": "classify", "output": []}),
            "no output object",
        ),
        (
            json.dumps(
                {
                    "schema": STATE_SCHEMA,
                    "step": "classify",
                    "output": {"case_id": "x", "source": "oracle"},
                }
            ),
            "does not hold a valid classify output",
        ),
    ],
)
def test_a_bad_checkpoint_fails_the_case_and_is_never_taken_as_not_done(
    tmp_path: Path, contents: str, message: str
) -> None:
    # A first run that stops after the fetch and context steps…
    triage_run(RUN_ID, deps(github(), FakeModel(classify=limit_hit)), tmp_path)
    # …then a classify checkpoint that cannot be trusted.
    write_raw(store(tmp_path).path_for("classify"), contents)

    model = FakeModel(classify=refuse, investigate=refuse)
    report = triage_run(RUN_ID, deps(github(), model), tmp_path)

    (case,) = report.cases
    assert case.status == "failed"
    assert message in case.detail
    assert "Delete it to redo that step" in case.detail
    assert model.calls == []


def limit_hit(case: FailedJob) -> TriageRecord:
    raise UsageLimitError("usage limit")


def test_a_job_with_no_log_is_rejected_before_any_model_call(tmp_path: Path) -> None:
    model = FakeModel(classify=refuse, investigate=refuse)
    for log in ("", "   \n", GhError("gh run view: HTTP 404: Not Found")):
        report = triage_run(RUN_ID, deps(github(log=log), model), tmp_path)
        (case,) = report.cases
        assert case.status == "rejected"
        assert "no failed-step log" in case.detail
        assert not report.resumable
    assert store(tmp_path).done() == []


@pytest.mark.parametrize(
    ("gh", "message"),
    [
        (github(conclusion="success"), "did not fail"),
        (github(conclusion=""), "still running"),
        (github(workflow="Deploy"), "only Code Quality"),
        (github(job_ids=()), "no job in it did"),
    ],
)
def test_runs_with_nothing_to_triage_stop_before_any_case(
    tmp_path: Path, gh: FakeGh, message: str
) -> None:
    with pytest.raises(NothingToTriage, match=message):
        triage_run(RUN_ID, deps(gh, FakeModel(refuse, refuse)), tmp_path)
    assert not (tmp_path / str(RUN_ID)).exists()


# --- GitHub failing --------------------------------------------------------------


def test_transient_gh_errors_are_retried_with_backoff() -> None:
    answers: list[str | Exception] = [
        GhError("gh run view: HTTP 502: Bad Gateway"),
        GhError("gh api: API rate limit exceeded for installation"),
        "ok",
    ]
    slept: list[float] = []

    def flaky(args: list[str]) -> str:
        answer = answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer

    assert retrying(flaky, slept.append)(["run", "view"]) == "ok"
    assert slept == list(GH_BACKOFF_SECONDS[:2])


def test_permanent_gh_errors_are_not_retried() -> None:
    slept: list[float] = []
    gh = FakeGh({("run", "view"): GhError("gh run view: HTTP 404: Not Found")})
    with pytest.raises(GhError, match="404"):
        retrying(gh, slept.append)(["run", "view"])
    assert len(gh.calls) == 1
    assert slept == []


def test_a_gh_outage_fails_the_case_and_a_later_run_resumes_it(tmp_path: Path) -> None:
    slept: list[float] = []
    outage = github(log=GhError("gh run view: HTTP 503: Service Unavailable"))
    first = triage_run(
        RUN_ID,
        deps(retrying(outage, slept.append), FakeModel(refuse, refuse)),
        tmp_path,
    )

    (case,) = first.cases
    assert case.status == "failed"
    assert "503" in case.detail
    assert first.resumable
    assert slept == list(GH_BACKOFF_SECONDS)
    assert outage.calls.count(log_key(11)) == len(GH_BACKOFF_SECONDS) + 1

    second = triage_run(RUN_ID, deps(github(), FakeModel()), tmp_path)
    assert second.cases[0].status == "done"


# --- concurrency and the limits ---------------------------------------------------


def test_cases_run_side_by_side_but_never_more_model_calls_than_slots(
    tmp_path: Path,
) -> None:
    jobs = (11, 12, 13, 14, 15)
    model = FakeModel(delay=0.05)
    report = triage_run(
        RUN_ID, deps(github(job_ids=jobs), model), tmp_path, workers=5, slots=2
    )

    assert [c.status for c in report.cases] == ["done"] * 5
    assert [c.job.job_id for c in report.cases] == list(jobs)  # in job order
    assert model.max_in_flight == 2  # concurrent, and capped
    assert len(model.calls) == 10


def test_the_limit_stops_every_case_and_no_call_starts_after_it(
    tmp_path: Path,
) -> None:
    hit = threading.Event()
    late: list[str] = []

    def answer(source: str) -> Callable[[FailedJob], TriageRecord]:
        def call(case: FailedJob) -> TriageRecord:
            if hit.is_set():
                late.append(case.case_id)
            if len(model.calls) == 2:
                hit.set()
                raise UsageLimitError("You've hit your session limit")
            return record(case, source)

        return call

    model = FakeModel(classify=answer("model"), investigate=answer("agent"))
    report = triage_run(
        RUN_ID,
        deps(github(job_ids=(11, 12, 13, 14)), model),
        tmp_path,
        workers=4,
        slots=1,
    )

    assert late == []
    assert len(model.calls) == 2
    assert {c.status for c in report.cases} == {"stopped"}
    assert "session limit" in (report.stopped or "")
    assert report.resumable


def test_a_fatal_setup_error_stops_the_other_cases_too(tmp_path: Path) -> None:
    def broken(case: FailedJob) -> TriageRecord:
        raise ClaudeCallError("fatal", "subtype=error status=401", None)

    model = FakeModel(classify=broken)
    report = triage_run(
        RUN_ID, deps(github(job_ids=(11, 12, 13)), model), tmp_path, slots=1
    )

    statuses = sorted(c.status for c in report.cases)
    assert statuses == ["failed", "stopped", "stopped"]
    assert len(model.calls) == 1


# --- the summary -----------------------------------------------------------------


def test_the_summary_shows_the_answer_and_what_was_resumed(tmp_path: Path) -> None:
    triage_run(RUN_ID, deps(github(), FakeModel(investigate=limit_hit)), tmp_path)
    report = triage_run(RUN_ID, deps(github(), FakeModel(classify=refuse)), tmp_path)

    text = render_summary(report)
    assert f"## CI triage: run {RUN_ID}" in text
    assert "### Job 11: `threshold`" in text
    assert "high confidence, answered by agent (investigate.v1)" in text
    assert "`e2e/support/lobby.ts`" in text
    assert "_Resumed: fetch, context, classify reused from checkpoints._" in text
    assert "Stopped" not in text


def test_the_summary_says_what_is_left_to_resume(tmp_path: Path) -> None:
    report: RunReport = triage_run(
        RUN_ID, deps(github(), FakeModel(classify=limit_hit)), tmp_path
    )
    text = render_summary(report)
    assert "**stopped**: usage limit" in text
    assert "**Stopped:** usage limit" in text
    assert "resume from their checkpoints" in text
