"""The typed objects that pass between pipeline steps, and their JSON form.

    fetch → FailedJob (carrying an Excerpt) → classify → TriageRecord (a Triage + Usage)
                      ↘ labels: FixEvidence + Judgment → GoldenCase

One case is one failed *job*, not one failed run. A run where the end-to-end and the
Lighthouse jobs both failed is two cases, because the two usually fail for different
reasons. The corpus keeps them together by run, so its cap of 50 counts runs.

Plain dataclasses and hand-written `from_json`, not pydantic: the package has no
third-party runtime dependencies (ADR 0002), and every field is checked on the way in,
because these files are read back from disk and a hand-edited label is still input.
"""

from dataclasses import asdict, dataclass
from enum import StrEnum
from typing import Literal, TypeVar

JsonObject = dict[str, object]


class Category(StrEnum):
    """What kind of failure it was. The brief defines each one."""

    FLAKY = "flaky"
    REGRESSION = "regression"
    ENVIRONMENT = "environment"
    THRESHOLD = "threshold"
    DEPENDENCY = "dependency"


@dataclass(frozen=True)
class Excerpt:
    """The part of a failed job's log worth reading. trim.py has the rules."""

    text: str
    # GitHub's own `##[error]` annotations, cleaned. Usually the most informative
    # lines in the log, so they are also kept apart from `text`.
    error_lines: tuple[str, ...]
    # How many lines the raw log had, and whether the excerpt dropped any of them.
    source_lines: int
    truncated: bool

    @classmethod
    def from_json(cls, data: JsonObject) -> "Excerpt":
        return cls(
            text=_str(data, "text"),
            error_lines=_str_tuple(data, "error_lines"),
            source_lines=_int(data, "source_lines"),
            truncated=_bool(data, "truncated"),
        )


@dataclass(frozen=True)
class FailedJob:
    """One case: a job that failed in one run, with its trimmed log."""

    run_id: int
    job_id: int
    workflow: str
    job: str
    failed_steps: tuple[str, ...]
    branch: str
    event: str
    head_sha: str
    created_at: str  # ISO 8601 UTC, as GitHub reports it
    excerpt: Excerpt

    @property
    def case_id(self) -> str:
        return f"{self.run_id}-{self.job_id}"

    def to_json(self) -> JsonObject:
        return asdict(self)

    @classmethod
    def from_json(cls, data: JsonObject) -> "FailedJob":
        excerpt = data.get("excerpt")
        if not isinstance(excerpt, dict):
            raise ValueError("excerpt: expected an object")
        return cls(
            run_id=_int(data, "run_id"),
            job_id=_int(data, "job_id"),
            workflow=_str(data, "workflow"),
            job=_str(data, "job"),
            failed_steps=_str_tuple(data, "failed_steps"),
            branch=_str(data, "branch"),
            event=_str(data, "event"),
            head_sha=_str(data, "head_sha"),
            created_at=_str(data, "created_at"),
            excerpt=Excerpt.from_json(excerpt),
        )


@dataclass(frozen=True)
class FixEvidence:
    """What history says fixed a case. Found mechanically by labels.py."""

    # The first later run of the same workflow on the same branch in which this job
    # passed, or None when nothing ever did (common on Dependabot branches that were
    # closed rather than fixed).
    fix_run_id: int | None
    fix_sha: str | None
    # Files changed between the failing commit and the passing one. Empty when there
    # was no fix, or when the fix was a re-run of the very same commit.
    fix_files: tuple[str, ...]
    # The same commit failed and then passed: the strongest evidence of flakiness
    # history can give.
    same_sha_rerun: bool

    @classmethod
    def from_json(cls, data: JsonObject) -> "FixEvidence":
        return cls(
            fix_run_id=_optional_int(data, "fix_run_id"),
            fix_sha=_optional_str(data, "fix_sha"),
            fix_files=_str_tuple(data, "fix_files"),
            same_sha_rerun=_bool(data, "same_sha_rerun"),
        )


Split = Literal["tune", "holdout"]


@dataclass(frozen=True)
class GoldenCase:
    """A frozen, labelled case: the answer key the system is scored against."""

    case: FailedJob
    evidence: FixEvidence
    category: Category
    note: str
    # `tune` cases may be read while writing rules and prompts. `holdout` cases may not:
    # they are what the score is reported on.
    split: Split

    def to_json(self) -> JsonObject:
        return {
            "case": self.case.to_json(),
            "evidence": asdict(self.evidence),
            "category": self.category.value,
            "note": self.note,
            "split": self.split,
        }

    @classmethod
    def from_json(cls, data: JsonObject) -> "GoldenCase":
        case = data.get("case")
        evidence = data.get("evidence")
        if not isinstance(case, dict) or not isinstance(evidence, dict):
            raise ValueError("case and evidence: expected objects")
        split = _str(data, "split")
        if split not in ("tune", "holdout"):
            raise ValueError(f"split: expected tune or holdout, got {split!r}")
        return cls(
            case=FailedJob.from_json(case),
            evidence=FixEvidence.from_json(evidence),
            category=Category(_str(data, "category")),
            note=_str(data, "note"),
            split="tune" if split == "tune" else "holdout",
        )


class Confidence(StrEnum):
    """How sure the triage is. Words, not a number: a model's 0.83 is not calibrated,
    and three levels are all Stage 6 needs to decide what to escalate."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


@dataclass(frozen=True)
class Triage:
    """The answer to one case: the brief's triage record, minus where it came from."""

    category: Category
    hypothesis: str
    # The log lines (or other facts) the hypothesis rests on, quoted.
    evidence: tuple[str, ...]
    # Repository paths the fix probably touches, most likely first.
    suggested_files: tuple[str, ...]
    fix_rationale: str
    confidence: Confidence

    def to_json(self) -> JsonObject:
        return {
            "category": self.category.value,
            "hypothesis": self.hypothesis,
            "evidence": list(self.evidence),
            "suggested_files": list(self.suggested_files),
            "fix_rationale": self.fix_rationale,
            "confidence": self.confidence.value,
        }

    @classmethod
    def from_json(cls, data: JsonObject) -> "Triage":
        """Validate a model's answer. The CLI already checked it against the schema;
        this is the second check, against our types, and it raises ValueError on
        anything the first one let through."""
        return cls(
            category=_enum(Category, data, "category"),
            hypothesis=_str(data, "hypothesis"),
            evidence=_str_tuple(data, "evidence"),
            suggested_files=_str_tuple(data, "suggested_files"),
            fix_rationale=_str(data, "fix_rationale"),
            confidence=_enum(Confidence, data, "confidence"),
        )


@dataclass(frozen=True)
class Usage:
    """What one model call spent, as `claude -p --output-format json` reports it.

    `cost_usd` is Claude Code's client-side estimate at API list prices. On the
    subscription nothing is billed, so it is notional: a proxy for quota, not money.
    """

    model: str
    input_tokens: int
    cache_creation_input_tokens: int
    cache_read_input_tokens: int
    output_tokens: int
    cost_usd: float
    duration_ms: int
    num_turns: int
    # How many `claude` processes it took, retries included.
    attempts: int

    def to_json(self) -> JsonObject:
        return asdict(self)

    @classmethod
    def from_json(cls, data: JsonObject) -> "Usage":
        cost = data.get("cost_usd")
        if not isinstance(cost, int | float) or isinstance(cost, bool):
            raise ValueError(f"cost_usd: expected a number, got {cost!r}")
        return cls(
            model=_str(data, "model"),
            input_tokens=_int(data, "input_tokens"),
            cache_creation_input_tokens=_int(data, "cache_creation_input_tokens"),
            cache_read_input_tokens=_int(data, "cache_read_input_tokens"),
            output_tokens=_int(data, "output_tokens"),
            cost_usd=float(cost),
            duration_ms=_int(data, "duration_ms"),
            num_turns=_int(data, "num_turns"),
            attempts=_int(data, "attempts"),
        )


# model: one call (Stage 3). agent: an investigation with tools (Stage 4). rules: the
# Stage 2 baseline, standing in because neither gave a usable answer.
Source = Literal["model", "agent", "rules"]
SOURCES: tuple[Source, ...] = ("model", "agent", "rules")
_SOURCE_BY_NAME: dict[str, Source] = {source: source for source in SOURCES}


@dataclass(frozen=True)
class TriageRecord:
    """One case triaged: the answer, who gave it, and what it cost.

    `source` is "rules" when the model's answer could not be used and the Stage 2
    baseline stood in; `fallback_reason` then says why. A fallback still spent
    whatever the failed calls cost, so `usage` is kept when there was any.
    """

    case_id: str
    prompt_version: str
    source: Source
    triage: Triage
    usage: Usage | None
    fallback_reason: str | None

    def to_json(self) -> JsonObject:
        return {
            "case_id": self.case_id,
            "prompt_version": self.prompt_version,
            "source": self.source,
            "triage": self.triage.to_json(),
            "usage": None if self.usage is None else self.usage.to_json(),
            "fallback_reason": self.fallback_reason,
        }

    @classmethod
    def from_json(cls, data: JsonObject) -> "TriageRecord":
        triage = data.get("triage")
        usage = data.get("usage")
        if not isinstance(triage, dict):
            raise ValueError("triage: expected an object")
        if usage is not None and not isinstance(usage, dict):
            raise ValueError("usage: expected an object or null")
        raw = _str(data, "source")
        source = _SOURCE_BY_NAME.get(raw)
        if source is None:
            raise ValueError(
                f"source: expected one of {', '.join(SOURCES)}, got {raw!r}"
            )
        return cls(
            case_id=_str(data, "case_id"),
            prompt_version=_str(data, "prompt_version"),
            source=source,
            triage=Triage.from_json(triage),
            usage=None if usage is None else Usage.from_json(usage),
            fallback_reason=_optional_str(data, "fallback_reason"),
        )


# --- field readers: every one raises ValueError naming the field ------------------


E = TypeVar("E", bound=StrEnum)


def _enum(kind: type[E], data: JsonObject, key: str) -> E:
    value = _str(data, key)
    try:
        return kind(value)
    except ValueError:
        allowed = ", ".join(member.value for member in kind)
        raise ValueError(f"{key}: expected one of {allowed}, got {value!r}") from None


def _str(data: JsonObject, key: str) -> str:
    value = data.get(key)
    if not isinstance(value, str):
        raise ValueError(f"{key}: expected a string, got {value!r}")
    return value


def _int(data: JsonObject, key: str) -> int:
    value = data.get(key)
    # bool is a subclass of int, and `true` is not a run id.
    if not isinstance(value, int) or isinstance(value, bool):
        raise ValueError(f"{key}: expected an integer, got {value!r}")
    return value


def _bool(data: JsonObject, key: str) -> bool:
    value = data.get(key)
    if not isinstance(value, bool):
        raise ValueError(f"{key}: expected true or false, got {value!r}")
    return value


def _optional_int(data: JsonObject, key: str) -> int | None:
    return None if data.get(key) is None else _int(data, key)


def _optional_str(data: JsonObject, key: str) -> str | None:
    return None if data.get(key) is None else _str(data, key)


def _str_tuple(data: JsonObject, key: str) -> tuple[str, ...]:
    value = data.get(key)
    if not isinstance(value, list | tuple) or not all(
        isinstance(v, str) for v in value
    ):
        raise ValueError(f"{key}: expected a list of strings, got {value!r}")
    return tuple(value)
