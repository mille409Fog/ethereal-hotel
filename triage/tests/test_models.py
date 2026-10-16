"""The JSON form of every model: round trips, and loud failure on bad input."""

import pytest
from fakes import make_case

from ci_triage.models import (
    Category,
    Confidence,
    FailedJob,
    FixEvidence,
    GoldenCase,
    JsonObject,
    Triage,
    TriageRecord,
    Usage,
)

TRIAGE = Triage(
    category=Category.DEPENDENCY,
    hypothesis="h",
    evidence=("line",),
    suggested_files=("package-lock.json",),
    fix_rationale="r",
    confidence=Confidence.MEDIUM,
)


@pytest.mark.parametrize(
    "usage",
    [
        None,
        Usage(
            model="m",
            input_tokens=1,
            cache_creation_input_tokens=2,
            cache_read_input_tokens=3,
            output_tokens=4,
            cost_usd=0.5,
            duration_ms=6,
            num_turns=2,
            attempts=1,
        ),
    ],
)
def test_a_triage_record_round_trips_through_json(usage: Usage | None) -> None:
    record = TriageRecord(
        case_id="1-2",
        prompt_version="classify.v1",
        source="model",
        triage=TRIAGE,
        usage=usage,
        fallback_reason=None,
    )
    assert TriageRecord.from_json(record.to_json()) == record


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("category", "cosmic", "category: expected one of flaky"),
        ("confidence", 0.9, "confidence: expected a string"),
        ("confidence", "certain", "confidence: expected one of low, medium, high"),
        ("evidence", "one line", "evidence: expected a list of strings"),
        ("suggested_files", [1], "suggested_files: expected a list of strings"),
    ],
)
def test_a_model_answer_with_a_wrong_field_is_named(
    field: str, value: object, message: str
) -> None:
    data = {**TRIAGE.to_json(), field: value}
    with pytest.raises(ValueError, match=message):
        Triage.from_json(data)


def test_a_record_must_say_who_answered() -> None:
    data: JsonObject = {
        "case_id": "1-2",
        "prompt_version": "v",
        "source": "guess",
        "triage": TRIAGE.to_json(),
        "usage": None,
        "fallback_reason": None,
    }
    with pytest.raises(ValueError, match="source"):
        TriageRecord.from_json(data)


def test_a_failed_job_round_trips_through_json() -> None:
    case = make_case(text="boom", error_lines=("e",))
    assert FailedJob.from_json(case.to_json()) == case


def test_case_id_is_run_and_job() -> None:
    assert make_case(run_id=7, job_id=9).case_id == "7-9"


def test_a_golden_case_round_trips_through_json() -> None:
    golden = GoldenCase(
        case=make_case(),
        evidence=FixEvidence(
            fix_run_id=2, fix_sha="b", fix_files=("a.py",), same_sha_rerun=False
        ),
        category=Category.THRESHOLD,
        note="n",
        split="holdout",
    )
    assert GoldenCase.from_json(golden.to_json()) == golden


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("run_id", "1"),
        ("run_id", True),  # bool is an int to Python, but not a run id
        ("job", None),
        ("failed_steps", "one step"),
        ("failed_steps", [1]),
    ],
)
def test_a_bad_field_is_rejected_by_name(field: str, value: object) -> None:
    data = make_case().to_json()
    data[field] = value
    with pytest.raises(ValueError, match=field):
        FailedJob.from_json(data)


def test_an_unknown_category_or_split_is_rejected() -> None:
    golden = GoldenCase(
        case=make_case(),
        evidence=FixEvidence(None, None, (), False),
        category=Category.FLAKY,
        note="",
        split="tune",
    ).to_json()
    with pytest.raises(ValueError):
        GoldenCase.from_json({**golden, "category": "cosmic-rays"})
    with pytest.raises(ValueError, match="split"):
        GoldenCase.from_json({**golden, "split": "train"})
