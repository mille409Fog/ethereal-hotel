"""The scorecard's arithmetic, so a reported number means what it says."""

from collections.abc import Collection

from fakes import make_case

from ci_triage.evaluate import evaluate, render, render_spend
from ci_triage.models import (
    Category,
    Confidence,
    FailedJob,
    FixEvidence,
    GoldenCase,
    Source,
    Split,
    Triage,
    TriageRecord,
    Usage,
)


def golden(
    run_id: int, category: Category, split: Split, fix_files: tuple[str, ...] = ()
) -> GoldenCase:
    return GoldenCase(
        case=make_case(run_id=run_id, text=f"case {run_id}"),
        evidence=FixEvidence(
            fix_run_id=1 if fix_files else None,
            fix_sha=None,
            fix_files=fix_files,
            same_sha_rerun=False,
        ),
        category=category,
        note="",
        split=split,
    )


def test_accuracy_and_fix_hits_are_counted_per_split() -> None:
    cases = [
        golden(1, Category.THRESHOLD, "tune", ("a.ts",)),
        golden(2, Category.FLAKY, "tune"),
        golden(3, Category.THRESHOLD, "holdout", ("b.ts",)),
        golden(4, Category.DEPENDENCY, "holdout", ("c.ts",)),
    ]

    def classify(case: FailedJob) -> Category:
        return Category.THRESHOLD

    def suggest(case: FailedJob, repo: Collection[str]) -> tuple[str, ...]:
        return ("a.ts", "c.ts")

    card = evaluate(cases, classify, suggest, {"a.ts", "b.ts", "c.ts"})

    tune, holdout = card.splits["tune"], card.splits["holdout"]
    assert (tune.cases, tune.correct, tune.accuracy) == (2, 1, 0.5)
    assert (tune.fix_eligible, tune.fix_hits) == (1, 1)
    assert (holdout.cases, holdout.correct) == (2, 1)
    assert (holdout.fix_eligible, holdout.fix_hits) == (2, 1)
    assert card.confusion[(Category.FLAKY, Category.THRESHOLD)] == 1
    assert sorted(m[0] for m in card.misses) == ["2-10", "4-10"]


def test_an_empty_split_reports_n_a_rather_than_dividing_by_zero() -> None:
    card = evaluate([], lambda c: Category.FLAKY, lambda c, r: (), set())
    assert card.splits["holdout"].accuracy is None
    assert "n/a" in render(card)


def test_spend_counts_fallbacks_and_sums_every_call() -> None:
    def record(case_id: str, source: Source, usage: Usage | None) -> TriageRecord:
        return TriageRecord(
            case_id=case_id,
            prompt_version="v",
            source=source,
            triage=Triage(
                category=Category.THRESHOLD,
                hypothesis="h",
                evidence=(),
                suggested_files=(),
                fix_rationale="r",
                confidence=Confidence.LOW,
            ),
            usage=usage,
            fallback_reason=None if source == "model" else "invalid: schema",
        )

    def spent(cost: float, ms: int, attempts: int = 1) -> Usage:
        return Usage("claude-sonnet-5-5", 10, 0, 1000, 100, cost, ms, 2, attempts)

    text = render_spend(
        [
            record("1-1", "model", spent(0.01, 4000)),
            record("2-2", "model", spent(0.03, 8000, attempts=2)),
            record("3-3", "rules", None),
        ]
    )
    assert "Cases: 3 (2 answered by the model, 1 fell back to rules)" in text
    assert "3-3: invalid: schema" in text
    assert "Calls: 3 process(es)" in text
    assert "$0.0400 total, $0.0200 per case" in text
    assert "max 8.0s" in text


def test_spend_with_no_usage_still_reports_the_cases() -> None:
    assert render_spend([]).startswith("Cases: 0")
