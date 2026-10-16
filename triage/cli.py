"""Command-line entry point for the `npm run triage:*` scripts.

    doctor   would a `claude` run be billed only to the subscription?   (no model call)
    fetch    add new failed runs to the corpus, rotate it to 50 runs   (gh, read-only)
    label    find each new case's fix in history, add it to labels.json (gh, read-only)
    freeze   copy confirmed labels into the golden set, once
    eval     score the rule baseline against the golden set
    eval --llm [--split holdout|tune|all]
             score the Stage 3 model call (default: holdout). Calls the model
             once per case not already in data/runs/, through the billing guard
    eval --agent [--split holdout|tune|all]
             score the Stage 4 investigation the same way; each new case also
             writes a trace to data/traces/ (gh, read-only, for job history)
    trace <case_id>
             print an investigation's trace as a turn-by-turn walkthrough
    run <run_id> | run --event <path>   [--state <dir>]
             triage every failed job of one run: classify, then investigate, each
             step checkpointed under state/ so a killed run resumes (Stage 5).
             `--event` reads the payload GitHub Actions wrote for the trigger.
             Exits 0 when done or when there is nothing to triage, 1 when something
             is left to resume, 2 when the input itself was malformed

`eval --llm`, `eval --agent` and `run` call a model. Nothing here runs unless someone
types it, or the CI Triage workflow starts `run` while TRIAGE_ENABLED is `true`: the
project is off by default (ADR 0005).

Run as a file rather than with `python -m` so that triage/ lands on sys.path without
the npm script setting PYTHONPATH, which has no portable spelling across shells.
Named `cli` rather than `main` because mypy checks this tree together with backend/,
and backend/main.py already owns that module name.
"""

import functools
import os
import subprocess
import sys
import threading
from collections.abc import Callable, Collection, Mapping
from dataclasses import replace
from pathlib import Path

from ci_triage.agent import AGENT_VERSION, Investigator, ensure_commit
from ci_triage.baseline import classify_by_rules, suggest_files
from ci_triage.classify import (
    MODEL,
    PROMPT_VERSION,
    FirstCallFailedError,
    RecordStore,
    fallback,
    files_at,
    system_prompt,
    triage_all,
    triage_case,
)
from ci_triage.claude_cli import (
    Answer,
    BillingRiskError,
    ClaudeCallError,
    UsageLimitError,
    ask,
    preflight,
)
from ci_triage.corpus import Corpus
from ci_triage.evaluate import evaluate, render, render_spend
from ci_triage.fetch import fetch
from ci_triage.github import GhError, retrying, run_gh
from ci_triage.history import GitHubHistory, case_context
from ci_triage.intake import (
    MalformedInputError,
    NothingToTriage,
    parse_run_id,
    read_event,
)
from ci_triage.labels import AlreadyFrozenError, cached_jobs, freeze, load_golden
from ci_triage.labels import update_labels as add_labels
from ci_triage.models import (
    Category,
    FailedJob,
    GoldenCase,
    JsonObject,
    TriageRecord,
)
from ci_triage.pipeline import Deps, render_summary, triage_run
from ci_triage.tools import CaseContext, Git, real_git
from ci_triage.trace import read_trace, render_trace

TRIAGE_ROOT = Path(__file__).resolve().parent
DATA = TRIAGE_ROOT / "data"
CORPUS = DATA / "corpus"
LABELS = DATA / "labels.json"
GOLDEN = DATA / "golden"
RUNS = DATA / "runs"

REPO = TRIAGE_ROOT.parent
HISTORY = DATA / "history"
TRACES = DATA / "traces"
# Checkpoints of `run`, not evaluation data: gitignored, and carried between attempts
# of the CI job by actions/cache instead (ADR 0008).
STATE = TRIAGE_ROOT / "state"

USAGE = (
    "usage: cli.py {doctor|fetch|label|freeze|eval}\n"
    "       cli.py eval {--llm|--agent} [--split holdout|tune|all]\n"
    "       cli.py trace <case_id>\n"
    "       cli.py run {<run_id>|--event <path>} [--state <dir>]"
)
SPLITS = ("holdout", "tune", "all")


def doctor() -> int:
    try:
        preflight(os.environ)
    except BillingRiskError as refusal:
        print(refusal, file=sys.stderr)
        return 1
    print("OK: claude would run on the Claude subscription and nothing else.")
    return 0


def fetch_cmd() -> int:
    report = fetch(run_gh, Corpus(CORPUS))
    print(
        f"added {len(report.added)} case(s), skipped {len(report.skipped_runs)} run(s) "
        f"already present, rotated out {len(report.dropped)} case(s)."
    )
    return 0


def label_cmd() -> int:
    cases = Corpus(CORPUS).load()
    added = add_labels(LABELS, cases, run_gh, cached_jobs(run_gh))
    print(
        f"added evidence for {len(added)} case(s) to {LABELS.relative_to(TRIAGE_ROOT)}"
    )
    return 0


def freeze_cmd() -> int:
    try:
        frozen = freeze(LABELS, Corpus(CORPUS).load(), GOLDEN)
    except AlreadyFrozenError as refusal:
        print(refusal, file=sys.stderr)
        return 1
    print(f"froze {len(frozen)} confirmed case(s) into the golden set")
    return 0


def tracked_files() -> set[str]:
    return set(
        subprocess.run(
            ["git", "ls-files"],
            cwd=TRIAGE_ROOT.parent,
            capture_output=True,
            text=True,
            check=True,
        ).stdout.splitlines()
    )


def eval_cmd() -> int:
    golden = load_golden(GOLDEN) if GOLDEN.exists() else []
    if not golden:
        print("No golden set yet: run label, confirm categories, then freeze.")
        return 1
    print(render(evaluate(golden, classify_by_rules, suggest_files, tracked_files())))
    return 0


def _progress(record: TriageRecord, cached: bool) -> None:
    if cached:
        how = "cached"
    elif record.usage is None:
        how = "no usage reported"
    else:
        how = f"{record.usage.duration_ms / 1000:.1f}s"
    print(
        f"  {record.case_id}: {record.triage.category.value} [{record.source}, {how}]",
        flush=True,
    )


def _single_call(
    env: Mapping[str, str], tracked: Collection[str], git: Git | None = None
) -> Callable[[FailedJob], TriageRecord]:
    git = git or real_git(str(REPO))

    def call(system: str, user: str, schema: JsonObject) -> Answer:
        return ask(system, user, schema, env=env, model=MODEL)

    def one(case: FailedJob) -> TriageRecord:
        # The file list as of the failure, never today's (see classify.files_at).
        tree = (
            files_at(git, case.head_sha) if ensure_commit(git, case.head_sha) else None
        )
        if tree is None:
            reason = (
                f"commit {case.head_sha[:10]} is not available locally or on origin"
            )
            return fallback(case, tracked, reason, None)
        return triage_case(case, call, system_prompt(PROMPT_VERSION, tree), tracked)

    return one


def _investigator(
    env: Mapping[str, str], tracked: Collection[str]
) -> Callable[[FailedJob], TriageRecord]:
    corpus = Corpus(CORPUS).load()
    source: GitHubHistory | None = None

    def history() -> GitHubHistory:
        nonlocal source
        source = source or GitHubHistory(run_gh)
        return source

    return Investigator(
        env=env,
        model=MODEL,
        repo=REPO,
        tracked=tracked,
        traces=TRACES,
        git=real_git(str(REPO)),
        context_for=lambda case: case_context(case, corpus, HISTORY, history),
    )


def eval_model_cmd(strategy: str, split: str) -> int:
    """Score `llm` (one call per case) or `agent` (an investigation per case)."""
    golden = load_golden(GOLDEN) if GOLDEN.exists() else []
    chosen: list[GoldenCase] = [g for g in golden if split == "all" or g.split == split]
    if not chosen:
        print("No golden cases to score: run label, confirm, then freeze.")
        return 1
    tracked = tracked_files()
    version = AGENT_VERSION if strategy == "agent" else PROMPT_VERSION
    store = RecordStore(RUNS, version)
    fresh = [g for g in chosen if store.get(g.case.case_id) is None]

    # Vet the machine only when a model call is actually coming: re-scoring stored
    # records spends nothing and needs no `claude` at all.
    env: dict[str, str] = {}
    if fresh:
        try:
            env = preflight(os.environ)
        except BillingRiskError as refusal:
            print(refusal, file=sys.stderr)
            return 1
        print(
            f"{len(fresh)} of {len(chosen)} case(s) need a model run "
            f"({MODEL}, {version})."
        )
    build = _investigator if strategy == "agent" else _single_call

    try:
        records = triage_all(
            [g.case for g in chosen], build(env, tracked), store, on_record=_progress
        )
    except UsageLimitError as stop:
        print(f"Stopped: {stop}\nEverything triaged so far is saved.", file=sys.stderr)
        return 1
    except (FirstCallFailedError, ClaudeCallError) as stop:
        print(f"Stopped: {stop}", file=sys.stderr)
        return 1

    by_case = {r.case_id: r for r in records}

    def classify(case: FailedJob) -> Category:
        return by_case[case.case_id].triage.category

    def suggest(case: FailedJob, repo: Collection[str]) -> tuple[str, ...]:
        return by_case[case.case_id].triage.suggested_files

    print()
    print(render(evaluate(chosen, classify, suggest, tracked)))
    print()
    print(render_spend(records))
    return 0


def _serialised(git: Git) -> Git:
    """One `git` at a time. Cases run side by side, and two `git fetch`es into one
    repository can collide on its ref locks."""
    lock = threading.Lock()

    def run(args: list[str]) -> tuple[int, str, str]:
        with lock:
            return git(args)

    return run


def _no_context(case: FailedJob) -> CaseContext:
    raise AssertionError("the pipeline passes each case's context in explicitly")


def _pipeline_deps(env: Mapping[str, str], state: Path) -> Deps:
    tracked = tracked_files()
    git = _serialised(real_git(str(REPO)))
    investigator = Investigator(
        env=env,
        model=MODEL,
        repo=REPO,
        tracked=tracked,
        traces=state / "traces",
        git=git,
        context_for=_no_context,
    )

    def investigate(case: FailedJob, ctx: CaseContext) -> TriageRecord:
        return replace(investigator, context_for=lambda _: ctx)(case)

    return Deps(
        gh=retrying(run_gh),
        corpus=functools.cache(Corpus(CORPUS).load),
        classify=_single_call(env, tracked, git),
        investigate=investigate,
    )


def _publish(text: str) -> None:
    """Print, and in Actions also append to the run's job summary."""
    print(text)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with Path(summary).open("a", encoding="utf-8") as handle:
            handle.write(text + "\n")


def run_cmd(args: list[str]) -> int:
    state = STATE
    if len(args) >= 2 and args[-2] == "--state":
        state, args = Path(args[-1]), args[:-2]
    try:
        if len(args) == 2 and args[0] == "--event":
            run_id = read_event(
                Path(args[1]),
                os.environ.get("GITHUB_EVENT_NAME", ""),
                os.environ.get("GITHUB_REPOSITORY", ""),
            )
        elif len(args) == 1:
            run_id = parse_run_id(args[0])
        else:
            print(USAGE, file=sys.stderr)
            return 2
    except MalformedInputError as malformed:
        print(f"Rejected: {malformed}", file=sys.stderr)
        return 2
    except NothingToTriage as reason:
        _publish(f"Nothing to triage: {reason}")
        return 0

    try:
        env = preflight(os.environ)
    except BillingRiskError as refusal:
        print(refusal, file=sys.stderr)
        return 1
    try:
        report = triage_run(run_id, _pipeline_deps(env, state), state)
    except NothingToTriage as reason:
        _publish(f"Nothing to triage: {reason}")
        return 0
    except GhError as error:
        print(f"Could not read run {run_id} from GitHub: {error}", file=sys.stderr)
        return 1
    _publish(render_summary(report))
    return 1 if report.resumable else 0


def trace_cmd(case_id: str) -> int:
    path = TRACES / AGENT_VERSION / f"{case_id}.jsonl"
    if not path.exists():
        known = sorted(p.stem for p in path.parent.glob("*.jsonl"))
        print(
            f"No trace for {case_id} under {path.parent.relative_to(TRIAGE_ROOT)}."
            + (f" Traced cases: {', '.join(known)}" if known else ""),
            file=sys.stderr,
        )
        return 1
    with path.open(encoding="utf-8") as lines:
        print(render_trace(read_trace(lines)))
    return 0


COMMANDS: dict[str, Callable[[], int]] = {
    "doctor": doctor,
    "fetch": fetch_cmd,
    "label": label_cmd,
    "freeze": freeze_cmd,
    "eval": eval_cmd,
}


def main(argv: list[str]) -> int:
    if argv[:1] == ["eval"] and argv[1:2] in (["--llm"], ["--agent"]):
        strategy, rest = argv[1].removeprefix("--"), argv[2:]
        if not rest:
            return eval_model_cmd(strategy, "holdout")
        if len(rest) == 2 and rest[0] == "--split" and rest[1] in SPLITS:
            return eval_model_cmd(strategy, rest[1])
    elif len(argv) == 2 and argv[0] == "trace":
        return trace_cmd(argv[1])
    elif argv[:1] == ["run"]:
        return run_cmd(argv[1:])
    elif len(argv) == 1 and argv[0] in COMMANDS:
        return COMMANDS[argv[0]]()
    print(USAGE, file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
