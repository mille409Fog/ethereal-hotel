"""Stage 3: triage one failed job with a single model call, and fall back to rules.

    FailedJob → render_case → ask (claude -p, JSON schema) → Triage.from_json → record
                                         ↘ no usable answer → the Stage 2 rules

A workflow step, not an agent: one call, no tools, a fixed path (ADR 0001, ADR 0006).
The record says which of the two answered, so a score can never quietly mix them.

Records are cached on disk by prompt version and case, so scoring again costs no quota,
and a run stopped by the usage limit resumes where it stopped.
"""

from collections.abc import Callable, Collection, Iterable
from pathlib import Path
from typing import Final

from ci_triage.baseline import classify_by_rules, suggest_files
from ci_triage.claude_cli import Answer, ClaudeCallError
from ci_triage.corpus import read_json, write_json
from ci_triage.models import (
    Category,
    Confidence,
    FailedJob,
    JsonObject,
    Triage,
    TriageRecord,
    Usage,
)
from ci_triage.tools import Git

PROMPTS: Final = Path(__file__).resolve().parent.parent / "prompts"
# v2 states the maintainer's convention for missed time limits (RESULTS.md, Stage 3).
PROMPT_VERSION: Final = "classify.v2"
MODEL: Final = "sonnet"

MAX_EVIDENCE: Final = 5
MAX_FILES: Final = 5

# Kept out of the file list the model reads: the triage corpus itself (hundreds of
# lines that are never a fix), and binaries nobody fixes a CI failure by editing.
_UNLISTED_PREFIXES: Final = ("triage/data/",)
_UNLISTED_SUFFIXES: Final = (
    ".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico",
    ".woff", ".woff2", ".ttf", ".otf",
)  # fmt: skip

# (system prompt, user prompt, schema) → Answer. `claude_cli.ask` with its environment
# and model bound; a fake in tests.
Ask = Callable[[str, str, JsonObject], Answer]


def triage_schema() -> JsonObject:
    """The JSON Schema the CLI holds the answer to. Built from the enums, so a new
    category cannot be added to the code and forgotten here."""
    text: JsonObject = {"type": "string", "minLength": 1}
    return {
        "type": "object",
        "properties": {
            "category": {"type": "string", "enum": [c.value for c in Category]},
            "hypothesis": text,
            "evidence": {"type": "array", "items": text, "maxItems": MAX_EVIDENCE},
            "suggested_files": {
                "type": "array",
                "items": text,
                "maxItems": MAX_FILES,
            },
            "fix_rationale": text,
            "confidence": {"type": "string", "enum": [c.value for c in Confidence]},
        },
        "required": [
            "category",
            "hypothesis",
            "evidence",
            "suggested_files",
            "fix_rationale",
            "confidence",
        ],
        "additionalProperties": False,
    }


def listed_files(tracked: Iterable[str]) -> list[str]:
    """The repository files the model may suggest, sorted."""
    return sorted(
        path
        for path in tracked
        if not path.startswith(_UNLISTED_PREFIXES)
        and not path.lower().endswith(_UNLISTED_SUFFIXES)
    )


def files_at(git: Git, sha: str) -> list[str] | None:
    """The repository's files at one commit, or None if the commit is not available.

    The model's file list must be the tree **at the failing commit**. Through Stage 3
    it was today's tree, which named files the later fix created
    (`e2e/support/lobby.ts`, added after every golden case), so the model could read
    where the fix would go instead of inferring it (RESULTS.md, Stage 4).
    """
    code, out, _ = git(["ls-tree", "-r", "--name-only", sha])
    return out.splitlines() if code == 0 else None


def system_prompt(version: str, tracked: Iterable[str]) -> str:
    """The versioned prompt file with the file list filled in.

    Commits close together have nearly the same tree, so consecutive cases share most
    of this prefix, and the API serves what they share from cache.
    """
    template = (PROMPTS / f"{version}.md").read_text(encoding="utf-8")
    return template.replace("{repo_files}", "\n".join(listed_files(tracked)))


def render_case(case: FailedJob) -> str:
    """The user message: one case, inside <job> so the prompt can call it data."""
    errors = list(dict.fromkeys(case.excerpt.error_lines))  # dedupe, keep order
    return "\n".join(
        [
            "<job>",
            f"workflow: {case.workflow}",
            f"job: {case.job}",
            f"failed steps: {', '.join(case.failed_steps) or '(none recorded)'}",
            f"branch: {case.branch}",
            f"event: {case.event}",
            f"log lines: {case.excerpt.source_lines}"
            + (" (excerpt trimmed)" if case.excerpt.truncated else ""),
            "",
            "error annotations:",
            *(f"- {line}" for line in errors),
            *(["- (none)"] if not errors else []),
            "",
            "log excerpt:",
            case.excerpt.text,
            "</job>",
        ]
    )


def by_rules(case: FailedJob, tracked: Collection[str]) -> Triage:
    """The Stage 2 baseline dressed as a Triage, for when the model gave nothing."""
    return Triage(
        category=classify_by_rules(case),
        hypothesis="No model answer; category from the rule baseline.",
        evidence=(),
        suggested_files=suggest_files(case, tracked),
        fix_rationale="Repository files the log names (rule baseline).",
        confidence=Confidence.LOW,
    )


def fallback(
    case: FailedJob, tracked: Collection[str], reason: str, usage: Usage | None
) -> TriageRecord:
    return TriageRecord(
        case_id=case.case_id,
        prompt_version=PROMPT_VERSION,
        source="rules",
        triage=by_rules(case, tracked),
        usage=usage,
        fallback_reason=reason,
    )


def triage_case(
    case: FailedJob, ask: Ask, prompt: str, tracked: Collection[str]
) -> TriageRecord:
    """Triage one case. Falls back to rules when the model's answer is unusable.

    UsageLimitError, and a ClaudeCallError of kind `fatal`, propagate: the first
    means stop for now, the second means our setup is broken, and neither is a fact
    about this case that a fallback could paper over.
    """
    try:
        answer = ask(prompt, render_case(case), triage_schema())
    except ClaudeCallError as failure:
        if failure.kind == "fatal":
            raise
        return fallback(case, tracked, str(failure), failure.usage)
    try:
        triage = Triage.from_json(answer.structured)
    except ValueError as invalid:
        return fallback(case, tracked, f"invalid answer: {invalid}", answer.usage)
    return TriageRecord(
        case_id=case.case_id,
        prompt_version=PROMPT_VERSION,
        source="model",
        triage=triage,
        usage=answer.usage,
        fallback_reason=None,
    )


class RecordStore:
    """One JSON file per triaged case, under a directory per prompt version."""

    def __init__(self, root: Path, prompt_version: str = PROMPT_VERSION) -> None:
        self.directory = root / prompt_version

    def path_for(self, case_id: str) -> Path:
        return self.directory / f"{case_id}.json"

    def get(self, case_id: str) -> TriageRecord | None:
        path = self.path_for(case_id)
        return TriageRecord.from_json(read_json(path)) if path.exists() else None

    def save(self, record: TriageRecord) -> None:
        write_json(self.path_for(record.case_id), record.to_json())


class FirstCallFailedError(RuntimeError):
    """The first fresh call of a run fell back. Stopped before spending more quota."""


def triage_all(
    cases: Iterable[FailedJob],
    triage_one: Callable[[FailedJob], TriageRecord],
    store: RecordStore,
    on_record: Callable[[TriageRecord, bool], None] = lambda record, cached: None,
) -> list[TriageRecord]:
    """Triage every case, reusing stored records and saving each new one at once.

    `triage_one` is the strategy: a single call (`triage_case`) or an investigation
    (`agent.investigate`). The caching, resuming and canary are the same for both.

    Saving per case is what makes a run stopped by the usage limit resumable. And if
    the first fresh call of a run falls back, the run stops: a problem common to
    every call (a rejected flag, a prompt the schema cannot satisfy) would otherwise
    spend quota on every case to learn the same thing.
    """
    records: list[TriageRecord] = []
    fresh = 0
    for case in cases:
        cached = store.get(case.case_id)
        if cached is not None:
            records.append(cached)
            on_record(cached, True)
            continue
        record = triage_one(case)
        store.save(record)
        records.append(record)
        on_record(record, False)
        fresh += 1
        if fresh == 1 and record.source == "rules":
            raise FirstCallFailedError(
                f"the first call fell back to rules ({record.fallback_reason}); "
                "stopping before the rest spend quota on the same failure"
            )
    return records
