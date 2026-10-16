"""Stage 5: one triage, from a failed run to a record, resumable after a crash.

    run id ─ check_run ─ failed jobs ─┬─ case ─ fetch → context → classify
                                      │              → investigate → report
                                      ├─ case ─ …
                                      └─ case ─ …   (WORKERS at once, MODEL_SLOTS calls)

**Every step's output is a checkpoint** (ADR 0008). It is written atomically the moment
the step ends, to `<state>/<run_id>/<job_id>/<step>.json`, and a step whose checkpoint
exists is never run again. So a process killed anywhere resumes at the first step it
had not finished, and the two steps that spend quota (classify, investigate) are each
paid for once per case, however many times the run is restarted. The investigation is
the one step that cannot resume partway: its loop belongs to Claude Code, whose
session dies with the process. It restarts from its first turn, and classify's answer,
already saved, is not lost.

A checkpoint that cannot be read is never treated as missing. Silently redoing the
step would hide a bug or a tampered file; the case fails and names the file instead.

**Concurrency** (ADR 0009). A run's failed jobs are triaged side by side, but at most
MODEL_SLOTS `claude` processes run at once, and the first case to hit the
subscription's limit (or a fatal setup error) stops the gate for all of them: no
model call starts after that, cases already running finish and save, and the rest
report `stopped`, ready to resume from their checkpoints.

**The answer is chosen in a fixed order**: the investigation's, else the single
call's, else the rules'. The record says which, and the notes say why.
"""

import threading
from collections.abc import Callable, Iterator, Sequence
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Final, Literal, TypeVar

from ci_triage.claude_cli import BillingRiskError, ClaudeCallError, UsageLimitError
from ci_triage.corpus import read_json, write_json
from ci_triage.fetch import FAILED_CONCLUSIONS
from ci_triage.github import Gh, GhError, Job, Run, is_transient, jobs_of, run_info
from ci_triage.history import GitHubHistory, earlier_failures, job_history
from ci_triage.intake import NothingToTriage, check_run
from ci_triage.models import FailedJob, JsonObject, TriageRecord
from ci_triage.tools import CaseContext
from ci_triage.trim import trim

STEPS: Final = ("fetch", "context", "classify", "investigate", "report")
# Bumped when a checkpoint's shape changes, so a state directory written by older
# code is refused by name rather than half-understood.
STATE_SCHEMA: Final = 1

# Cases in progress at once, and `claude` processes among them. Two model processes
# is the most a single Pro login should be asked to run side by side; the extra
# workers only overlap the `gh` fetches, which are cheap.
WORKERS: Final = 4
MODEL_SLOTS: Final = 2

T = TypeVar("T")


# --- checkpoints -----------------------------------------------------------------


class CorruptCheckpointError(RuntimeError):
    """A checkpoint exists and cannot be trusted. Never taken to mean "not done"."""


class Checkpoints:
    """One case's saved steps: `<directory>/<step>.json`, each written atomically."""

    def __init__(self, directory: Path) -> None:
        self.directory = directory

    def path_for(self, step: str) -> Path:
        return self.directory / f"{step}.json"

    def done(self) -> list[str]:
        return [step for step in STEPS if self.path_for(step).exists()]

    def get(self, step: str) -> JsonObject | None:
        path = self.path_for(step)
        if not path.exists():
            return None
        try:
            saved = read_json(path)
        except (OSError, ValueError) as error:
            raise self._corrupt(path, f"unreadable ({error})") from error
        if saved.get("schema") != STATE_SCHEMA or saved.get("step") != step:
            raise self._corrupt(
                path,
                f"expected schema {STATE_SCHEMA} for step {step!r}, found schema "
                f"{saved.get('schema')!r} for step {saved.get('step')!r}",
            )
        output = saved.get("output")
        if not isinstance(output, dict):
            raise self._corrupt(path, "no output object")
        return output

    def put(self, step: str, output: JsonObject) -> None:
        write_json(
            self.path_for(step),
            {"schema": STATE_SCHEMA, "step": step, "output": output},
        )

    @staticmethod
    def _corrupt(path: Path, why: str) -> CorruptCheckpointError:
        return CorruptCheckpointError(
            f"checkpoint {path} is {why}. Delete it to redo that step."
        )


def _step(
    store: Checkpoints,
    name: str,
    parse: Callable[[JsonObject], T],
    dump: Callable[[T], JsonObject],
    make: Callable[[], T],
    reused: list[str],
) -> T:
    """Return the step's saved output if there is one, else run it and save it."""
    saved = store.get(name)
    if saved is not None:
        try:
            value = parse(saved)
        except ValueError as invalid:
            raise CorruptCheckpointError(
                f"checkpoint {store.path_for(name)} does not hold a valid {name} "
                f"output ({invalid}). Delete it to redo that step."
            ) from invalid
        reused.append(name)
        return value
    value = make()
    store.put(name, dump(value))
    return value


# --- the gate on model calls -----------------------------------------------------


class StoppedError(RuntimeError):
    """The gate was stopped by another case before this one could call the model."""


# What stops every case, not just the one that met it: the plan's limit, and a setup
# that is broken for every call (the CLI rejecting a flag, a credential the guard
# refused). Retrying any of them in another case would fail the same way.
_STOPS_ALL = (UsageLimitError, BillingRiskError)


class ModelGate:
    """At most `slots` model calls at once, and a stop that every case obeys."""

    def __init__(self, slots: int = MODEL_SLOTS) -> None:
        self._slots = threading.BoundedSemaphore(slots)
        self._lock = threading.Lock()
        self._reason: str | None = None

    @property
    def stopped(self) -> str | None:
        with self._lock:
            return self._reason

    def stop(self, reason: str) -> None:
        with self._lock:
            self._reason = self._reason or reason

    @contextmanager
    def slot(self) -> Iterator[None]:
        """Hold one slot for one model call. The stop is recorded *before* the slot
        is released, so no other case can slip a call in between."""
        with self._slots:
            if self.stopped:
                raise StoppedError(self.stopped)
            try:
                yield
            except _STOPS_ALL as stop:
                self.stop(str(stop))
                raise
            except ClaudeCallError as failure:
                if failure.kind == "fatal":
                    self.stop(str(failure))
                raise


# --- one case --------------------------------------------------------------------


@dataclass(frozen=True)
class Deps:
    """What the pipeline calls out to. The CLI wires the real ones; tests, fakes.

    `classify` and `investigate` are the Stage 3 and Stage 4 strategies, each already
    bound to its environment and model. Both may raise UsageLimitError,
    BillingRiskError, or a fatal ClaudeCallError; anything else they return as a
    record, falling back to rules themselves.
    """

    gh: Gh
    corpus: Callable[[], Sequence[FailedJob]]
    classify: Callable[[FailedJob], TriageRecord]
    investigate: Callable[[FailedJob, CaseContext], TriageRecord]


@dataclass(frozen=True)
class Verdict:
    """The report step's output: the record chosen, and why it was that one."""

    record: TriageRecord
    notes: tuple[str, ...]

    def to_json(self) -> JsonObject:
        return {"record": self.record.to_json(), "notes": list(self.notes)}

    @classmethod
    def from_json(cls, data: JsonObject) -> "Verdict":
        record, notes = data.get("record"), data.get("notes")
        if not isinstance(record, dict):
            raise ValueError("record: expected an object")
        if not isinstance(notes, list) or not all(isinstance(n, str) for n in notes):
            raise ValueError("notes: expected a list of strings")
        return cls(TriageRecord.from_json(record), tuple(notes))


def choose(classified: TriageRecord, investigated: TriageRecord) -> Verdict:
    """The investigation's answer, else the single call's, else the rules'."""
    if investigated.source == "agent":
        return Verdict(investigated, ())
    missing = f"The investigation gave no answer ({investigated.fallback_reason})"
    if classified.source == "model":
        return Verdict(classified, (f"{missing}; the single call's answer stands.",))
    return Verdict(
        investigated,
        (
            f"{missing}, and neither did the single call "
            f"({classified.fallback_reason}); the rule baseline answered.",
        ),
    )


Status = Literal["done", "rejected", "stopped", "failed"]


@dataclass(frozen=True)
class CaseOutcome:
    """What happened to one failed job. Only `done` carries a verdict."""

    job: Job
    status: Status
    detail: str
    verdict: Verdict | None
    # Steps whose output came from a checkpoint rather than being run again.
    reused: tuple[str, ...]


def _failed_log(gh: Gh, job_id: int) -> str:
    """The failed steps' log. Unlike `github.failed_log`, a transient failure raises:
    an empty log here would be read as "nothing to triage", and that is not what a
    rate limit means."""
    try:
        return gh(["run", "view", "--job", str(job_id), "--log-failed"])
    except GhError as error:
        if is_transient(error):
            raise
        return ""


def _fetch(run: Run, job: Job, gh: Gh) -> FailedJob:
    log = _failed_log(gh, job.job_id)
    if not log.strip():
        raise NothingToTriage(
            f"job {job.job_id} has no failed-step log (expired, or it never started)"
        )
    return FailedJob(
        run_id=run.run_id,
        job_id=job.job_id,
        workflow=run.workflow,
        job=job.name,
        failed_steps=job.failed_steps,
        branch=run.branch,
        event=run.event,
        head_sha=run.head_sha,
        created_at=run.created_at,
        excerpt=trim(log),
    )


def _context(case: FailedJob, deps: Deps) -> CaseContext:
    return CaseContext(
        sha=case.head_sha,
        workflow=case.workflow,
        job=case.job,
        branch=case.branch,
        created_at=case.created_at,
        history=job_history(case, GitHubHistory(deps.gh)),
        earlier=earlier_failures(case, deps.corpus()),
    )


def _record_json(record: TriageRecord) -> JsonObject:
    return record.to_json()


def triage_job(
    run: Run, job: Job, deps: Deps, gate: ModelGate, state: Path
) -> CaseOutcome:
    """Every step of one case, each skipped if its checkpoint exists."""
    store = Checkpoints(state / str(run.run_id) / str(job.job_id))
    reused: list[str] = []

    def outcome(status: Status, detail: str, verdict: Verdict | None) -> CaseOutcome:
        return CaseOutcome(job, status, detail, verdict, tuple(reused))

    try:
        case = _step(
            store,
            "fetch",
            FailedJob.from_json,
            FailedJob.to_json,
            lambda: _fetch(run, job, deps.gh),
            reused,
        )
        ctx = _step(
            store,
            "context",
            CaseContext.from_json,
            CaseContext.to_json,
            lambda: _context(case, deps),
            reused,
        )

        def classify() -> TriageRecord:
            with gate.slot():
                return deps.classify(case)

        def investigate() -> TriageRecord:
            with gate.slot():
                return deps.investigate(case, ctx)

        classified = _step(
            store, "classify", TriageRecord.from_json, _record_json, classify, reused
        )
        investigated = _step(
            store,
            "investigate",
            TriageRecord.from_json,
            _record_json,
            investigate,
            reused,
        )
        verdict = _step(
            store,
            "report",
            Verdict.from_json,
            Verdict.to_json,
            lambda: choose(classified, investigated),
            reused,
        )
    except NothingToTriage as reason:
        return outcome("rejected", str(reason), None)
    except (UsageLimitError, StoppedError) as stop:
        return outcome("stopped", str(stop), None)
    except (BillingRiskError, ClaudeCallError, GhError, CorruptCheckpointError) as err:
        return outcome("failed", str(err), None)
    return outcome("done", "", verdict)


# --- one run ---------------------------------------------------------------------


@dataclass(frozen=True)
class RunReport:
    run: Run
    cases: tuple[CaseOutcome, ...]
    # Why the gate was stopped, if it was.
    stopped: str | None

    @property
    def resumable(self) -> bool:
        """Something is left that running the same command again would finish."""
        return any(case.status in ("stopped", "failed") for case in self.cases)


def triage_run(
    run_id: int,
    deps: Deps,
    state: Path,
    workers: int = WORKERS,
    slots: int = MODEL_SLOTS,
) -> RunReport:
    """Triage every failed job of one run. Raises NothingToTriage if there are none."""
    run = run_info(deps.gh, run_id)
    check_run(run)
    failed = [j for j in jobs_of(deps.gh, run_id) if j.conclusion in FAILED_CONCLUSIONS]
    if not failed:
        raise NothingToTriage(f"run {run_id} failed, but no job in it did")
    gate = ModelGate(slots)
    with ThreadPoolExecutor(max_workers=workers, thread_name_prefix="triage") as pool:
        cases = tuple(
            pool.map(lambda job: triage_job(run, job, deps, gate, state), failed)
        )
    return RunReport(run, cases, gate.stopped)


# --- the report ------------------------------------------------------------------


def _one_line(text: str) -> str:
    return " ".join(text.split())


def render_summary(report: RunReport) -> str:
    """Markdown for the run's job summary. Nothing here leaves the run (brief)."""
    run = report.run
    lines = [
        f"## CI triage: run {run.run_id}",
        "",
        f"{run.workflow} on `{run.branch}` at `{run.head_sha[:10]}`",
        "",
    ]
    for case in report.cases:
        title = f"### {case.job.name}"
        if case.verdict is None:
            lines += [title, "", f"**{case.status}**: {_one_line(case.detail)}", ""]
            continue
        record = case.verdict.record
        triage = record.triage
        lines += [
            f"{title}: `{triage.category.value}`",
            "",
            f"{triage.confidence.value} confidence, answered by {record.source} "
            f"({record.prompt_version})",
            "",
            _one_line(triage.hypothesis),
            "",
        ]
        if triage.evidence:
            lines += ["**Evidence**", ""]
            lines += [f"- {_one_line(item)}" for item in triage.evidence]
            lines.append("")
        if triage.suggested_files:
            files = ", ".join(f"`{path}`" for path in triage.suggested_files)
            lines += [
                f"**The fix probably touches** {files}: "
                f"{_one_line(triage.fix_rationale)}",
                "",
            ]
        lines += [f"_{note}_" for note in case.verdict.notes]
        if case.reused:
            lines.append(
                f"_Resumed: {', '.join(case.reused)} reused from checkpoints._"
            )
        lines.append("")
    if report.stopped:
        lines += [f"**Stopped:** {_one_line(report.stopped)}", ""]
    if report.resumable:
        lines += [
            "Unfinished cases resume from their checkpoints when this is run again.",
            "",
        ]
    return "\n".join(lines)
