"""The scorecard's arithmetic, so a reported number means what it says."""

from collections.abc import Collection

from fakes import make_case

from ci_triage.evaluate import evaluate, render
from ci_triage.models import Category, FailedJob, FixEvidence, GoldenCase, Split


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
