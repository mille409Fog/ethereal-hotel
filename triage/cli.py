"""Command-line entry point for the `npm run triage:*` scripts.

    doctor   would a `claude` run be billed only to the subscription?   (no model call)
    fetch    add new failed runs to the corpus, rotate it to 50 runs   (gh, read-only)
    label    find each new case's fix in history, add it to labels.json (gh, read-only)
    freeze   copy confirmed labels into the golden set, once
    eval     score the rule baseline against the golden set

None of these calls a model. Nothing here runs unless someone types it: the project is
off by default (ADR 0005).

Run as a file rather than with `python -m` so that triage/ lands on sys.path without
the npm script setting PYTHONPATH, which has no portable spelling across shells.
Named `cli` rather than `main` because mypy checks this tree together with backend/,
and backend/main.py already owns that module name.
"""

import os
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path

from ci_triage.baseline import classify_by_rules, suggest_files
from ci_triage.claude_cli import BillingRiskError, preflight
from ci_triage.corpus import Corpus
from ci_triage.evaluate import evaluate, render
from ci_triage.fetch import fetch
from ci_triage.github import run_gh
from ci_triage.labels import AlreadyFrozenError, cached_jobs, freeze, load_golden
from ci_triage.labels import update_labels as add_labels

TRIAGE_ROOT = Path(__file__).resolve().parent
DATA = TRIAGE_ROOT / "data"
CORPUS = DATA / "corpus"
LABELS = DATA / "labels.json"
GOLDEN = DATA / "golden"

USAGE = "usage: cli.py {doctor|fetch|label|freeze|eval}"


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


def eval_cmd() -> int:
    golden = load_golden(GOLDEN) if GOLDEN.exists() else []
    if not golden:
        print("No golden set yet: run label, confirm categories, then freeze.")
        return 1
    tracked = subprocess.run(
        ["git", "ls-files"],
        cwd=TRIAGE_ROOT.parent,
        capture_output=True,
        text=True,
        check=True,
    ).stdout.splitlines()
    print(render(evaluate(golden, classify_by_rules, suggest_files, set(tracked))))
    return 0


COMMANDS: dict[str, Callable[[], int]] = {
    "doctor": doctor,
    "fetch": fetch_cmd,
    "label": label_cmd,
    "freeze": freeze_cmd,
    "eval": eval_cmd,
}


def main(argv: list[str]) -> int:
    if len(argv) != 1 or argv[0] not in COMMANDS:
        print(USAGE, file=sys.stderr)
        return 2
    return COMMANDS[argv[0]]()


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
