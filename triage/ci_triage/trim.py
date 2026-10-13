"""Cut a failed job's raw log down to the part a reader, or a model, needs.

Raw failed-step logs measured 31 to 166 KB, and every corpus rotation stays in git
history, so storing them whole would grow the repository on every failure (brief
§Data). Most of a log is setup noise that is identical on every run. The failure is
usually within a few lines of the places GitHub marked with `##[error]`.

The rule:

1. Clean each line: drop `gh`'s `job<TAB>step<TAB>` prefix, the byte-order mark, the
   timestamp and ANSI colour codes, both as real escapes and as the literal `^[[31m`
   text `gh` actually prints.
2. Anchor on every `##[error]` line *and* every line matching a known error signature
   (`STRONG_SIGNALS`). GitHub often annotates only the closing "exit code 1", and
   the cause (an `npm audit` report, a bundle budget) sits far above it. With
   neither, anchor on anything that looks like an error (`ERROR_HINTS`).
3. Keep a window of context around each anchor, merging windows that overlap.
4. If that is still longer than `MAX_LINES`, keep the windows in order until the
   budget runs out, then always keep the last one: the summary a test runner prints
   at the end ("5 failed", "exit code 1") is often the single most useful line.
5. With no anchor at all, keep the tail: a job that dies without saying why dies at
   the end of its log.

Deterministic and pure: the same log always yields the same excerpt, so re-fetching a
case rewrites an identical file (idempotency, Stage 2).
"""

import re
from typing import Final

from ci_triage.models import Excerpt

CONTEXT_BEFORE: Final = 3
CONTEXT_AFTER: Final = 12
MAX_LINES: Final = 160
TAIL_LINES: Final = 60

_TIMESTAMP = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z ?")
_ANSI = re.compile(r"(?:\x1b|\^\[)\[[0-9;]*[A-Za-z]")
_BOM = "\N{ZERO WIDTH NO-BREAK SPACE}"
_ANNOTATION = "##[error]"

# Lines that state a cause, from the tools this repository's CI runs. Always anchors.
# Each one was found in a real failure in the corpus.
STRONG_SIGNALS: Final = re.compile(
    r"(?:\bnpm ERR!|# npm audit report|Severity: (?:high|critical)"
    r"|\d+ vulnerabilit(?:y|ies)\b|exceeded maximum budget"
    r"|does not meet (?:global )?threshold|\bError: |Traceback \(most recent call"
    r"|\berror TS\d+|\bAssertionError\b)",
)

# Used only when nothing above matched. Deliberately narrow: a hint that matches setup
# noise ("0 errors") would anchor the excerpt in the wrong place.
ERROR_HINTS: Final = re.compile(
    r"(?:\berror\b[:\[]|\bFAILED\b|\bfailed\b|exit code [1-9])",
    re.IGNORECASE,
)


def clean_line(raw: str) -> str:
    """One raw `gh run view --log-failed` line, reduced to what the job printed."""
    parts = raw.split("\t", 2)
    line = parts[2] if len(parts) == 3 else raw
    line = line.lstrip(_BOM)
    line = _TIMESTAMP.sub("", line)
    return _ANSI.sub("", line).rstrip()


def trim(raw_log: str) -> Excerpt:
    """Reduce a raw failed-job log to an `Excerpt`."""
    lines = [clean_line(raw) for raw in raw_log.splitlines()]
    error_lines = tuple(
        line.split(_ANNOTATION, 1)[1].strip() for line in lines if _ANNOTATION in line
    )

    anchors = [
        i
        for i, line in enumerate(lines)
        if _ANNOTATION in line or STRONG_SIGNALS.search(line)
    ]
    if not anchors:
        anchors = [i for i, line in enumerate(lines) if ERROR_HINTS.search(line)]

    if not anchors:
        kept = list(range(max(0, len(lines) - TAIL_LINES), len(lines)))
    else:
        kept = _select(_windows(anchors, len(lines)))

    text = "\n".join(_with_gaps(lines, kept))
    return Excerpt(
        text=text,
        error_lines=error_lines,
        source_lines=len(lines),
        truncated=len(kept) < len(lines),
    )


def _windows(anchors: list[int], total: int) -> list[range]:
    """Context windows around each anchor, overlapping ones merged, in order."""
    merged: list[range] = []
    for anchor in anchors:
        start = max(0, anchor - CONTEXT_BEFORE)
        stop = min(total, anchor + CONTEXT_AFTER + 1)
        if merged and start <= merged[-1].stop:
            merged[-1] = range(merged[-1].start, max(stop, merged[-1].stop))
        else:
            merged.append(range(start, stop))
    return merged


def _select(windows: list[range]) -> list[int]:
    """Windows in order within MAX_LINES, always ending with the last one."""
    last = windows[-1]
    budget = MAX_LINES - min(len(last), MAX_LINES)
    kept: list[int] = []
    for window in windows[:-1]:
        if len(window) > budget:
            break
        kept.extend(window)
        budget -= len(window)
    # The last window alone can exceed the cap; keep its end, where summaries are.
    kept.extend(list(last)[-MAX_LINES:])
    return kept


def _with_gaps(lines: list[str], kept: list[int]) -> list[str]:
    """The kept lines, with a marker wherever lines were skipped."""
    out: list[str] = []
    previous = -1
    for index in kept:
        if index != previous + 1:
            out.append(f"[… {index - previous - 1} lines omitted …]")
        out.append(lines[index])
        previous = index
    if kept and previous != len(lines) - 1:
        out.append(f"[… {len(lines) - 1 - previous} lines omitted …]")
    return out
