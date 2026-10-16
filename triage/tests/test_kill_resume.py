"""Exit criterion: a run killed partway resumes correctly.

Not simulated with an exception: a real process is started, killed from outside
partway through a model call (SIGKILL on Linux, TerminateProcess on Windows, so it gets
no chance to clean up), and a second process is started on the same state directory.
"""

import json
import subprocess
import sys
import time
from pathlib import Path

from ci_triage.pipeline import Checkpoints

HELPER = Path(__file__).resolve().parent / "crash_pipeline.py"
STARTUP_SECONDS = 60


def journal_lines(path: Path) -> list[str]:
    return path.read_text(encoding="utf-8").splitlines()


def test_a_killed_run_resumes_at_the_step_it_was_killed_in(tmp_path: Path) -> None:
    state, journal = tmp_path / "state", tmp_path / "journal.txt"
    ready = journal.with_suffix(".ready")
    store = Checkpoints(state / "700" / "71")

    victim = subprocess.Popen(
        [sys.executable, str(HELPER), str(state), str(journal), "hang"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        deadline = time.monotonic() + STARTUP_SECONDS
        while not ready.exists():
            assert victim.poll() is None, "the run exited before reaching classify"
            assert time.monotonic() < deadline, "the run never reached classify"
            time.sleep(0.05)
    finally:
        victim.kill()
        victim.wait()

    # Killed inside classify: the steps before it were saved, classify was not, and
    # nothing half-written was left behind.
    assert store.done() == ["fetch", "context"]
    assert list(store.directory.glob("*.tmp")) == []
    before = journal_lines(journal)
    assert before[-1] == "classify"

    survivor = subprocess.run(
        [sys.executable, str(HELPER), str(state), str(journal), "finish"],
        capture_output=True,
        text=True,
        timeout=STARTUP_SECONDS,
        check=True,
    )

    assert json.loads(survivor.stdout) == {
        "status": "done",
        "reused": ["fetch", "context"],
    }
    after = journal_lines(journal)[len(before) :]
    # The second process re-read the run (cheap, and how it learns the job list),
    # then went straight to the step that had been killed.
    assert after == [
        "gh run view 700 --json",
        "gh run view 700 --json",
        "classify",
        "investigate",
    ]
    whole = journal_lines(journal)
    assert sum(line.startswith("gh run view --job") for line in whole) == 1
    assert store.done() == ["fetch", "context", "classify", "investigate", "report"]
