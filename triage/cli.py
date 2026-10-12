"""Command-line entry point: `npm run triage:doctor`.

Run as a file rather than with `python -m` so that triage/ lands on sys.path without
the npm script setting PYTHONPATH, which has no portable spelling across shells.
Named `cli` rather than `main` because mypy checks this tree together with backend/,
and backend/main.py already owns that module name.
"""

import os
import sys

from ci_triage.claude_cli import BillingRiskError, preflight

USAGE = "usage: cli.py doctor"


def main(argv: list[str]) -> int:
    if argv != ["doctor"]:
        print(USAGE, file=sys.stderr)
        return 2
    try:
        preflight(os.environ)
    except BillingRiskError as refusal:
        print(refusal, file=sys.stderr)
        return 1
    print("OK: claude would run on the Claude subscription and nothing else.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
