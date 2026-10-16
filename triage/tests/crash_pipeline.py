"""A triage run with fakes in its own process, so test_kill_resume.py can kill it.

    python crash_pipeline.py <state> <journal> hang|finish

Every `gh` call and every model call is appended to <journal>, flushed at once, so
the journal survives the kill and shows exactly which work each process did. In
`hang` mode the classify call announces itself (<journal>.ready) and then waits to be
killed; in `finish` mode everything answers.

Not collected by pytest: the name does not start with `test_`.
"""

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fakes import RUN_FIELDS, jobs_json, run_json

from ci_triage.models import FailedJob, TriageRecord
from ci_triage.pipeline import Deps, triage_run
from ci_triage.tools import CaseContext

RUN_ID = 700
JOB_ID = 71


def main(state: Path, journal: Path, mode: str) -> int:
    def note(what: str) -> None:
        with journal.open("a", encoding="utf-8") as handle:
            handle.write(what + "\n")

    def gh(args: list[str]) -> str:
        note("gh " + " ".join(args[:4]))
        if args == ["run", "view", str(RUN_ID), "--json", RUN_FIELDS]:
            return json.dumps(
                run_json(RUN_ID, "2026-10-16T00:00:00Z", sha="c0ffee1234")
            )
        if args == ["run", "view", str(RUN_ID), "--json", "jobs"]:
            return jobs_json((JOB_ID, "End-to-end", "failure"))
        if args[:3] == ["run", "view", "--job"]:
            return "##[error]Timed out waiting for the lobby\n"
        if args[:2] == ["run", "list"]:
            return "[]"
        raise AssertionError(f"unscripted gh call: {args}")

    def answer(case: FailedJob, source: str) -> TriageRecord:
        return TriageRecord.from_json(
            {
                "case_id": case.case_id,
                "prompt_version": "investigate.v1" if source == "agent" else "v2",
                "source": source,
                "triage": {
                    "category": "threshold",
                    "hypothesis": "The lobby missed its budget.",
                    "evidence": [],
                    "suggested_files": [],
                    "fix_rationale": "-",
                    "confidence": "medium",
                },
                "usage": None,
                "fallback_reason": None,
            }
        )

    def classify(case: FailedJob) -> TriageRecord:
        note("classify")
        if mode == "hang":
            journal.with_suffix(".ready").touch()
            time.sleep(600)  # the test kills us long before this ends
        return answer(case, "model")

    def investigate(case: FailedJob, ctx: CaseContext) -> TriageRecord:
        note("investigate")
        return answer(case, "agent")

    report = triage_run(
        RUN_ID, Deps(gh, lambda: [], classify, investigate), state, workers=1
    )
    (case,) = report.cases
    print(json.dumps({"status": case.status, "reused": list(case.reused)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]))
