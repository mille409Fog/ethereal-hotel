"""Score a triage strategy against the golden set: Stage 2's harness, Stage 7's seed.

It reports the two brief metrics, separately for the `tune` and `holdout` splits,
plus a confusion table, because an accuracy figure alone hides *which* mistakes are
being made. The holdout row is the score. The tune row shows how much of it is fitting.
"""

from collections import Counter
from collections.abc import Callable, Collection
from dataclasses import dataclass, field

from ci_triage.models import Category, FailedJob, GoldenCase, Split, TriageRecord

Classifier = Callable[[FailedJob], Category]
FileSuggester = Callable[[FailedJob, Collection[str]], tuple[str, ...]]


@dataclass
class SplitScore:
    cases: int = 0
    correct: int = 0
    # Only cases whose fix changed files can score a file hit; a re-run fix or a
    # branch that was abandoned has nothing to point at.
    fix_eligible: int = 0
    fix_hits: int = 0

    @property
    def accuracy(self) -> float | None:
        return self.correct / self.cases if self.cases else None

    @property
    def fix_hit_rate(self) -> float | None:
        return self.fix_hits / self.fix_eligible if self.fix_eligible else None


@dataclass
class Scorecard:
    splits: dict[Split, SplitScore] = field(
        default_factory=lambda: {"tune": SplitScore(), "holdout": SplitScore()}
    )
    # (expected, predicted) → count
    confusion: Counter[tuple[Category, Category]] = field(default_factory=Counter)
    misses: list[tuple[str, Category, Category]] = field(default_factory=list)


def evaluate(
    golden: list[GoldenCase],
    classify: Classifier,
    suggest: FileSuggester,
    repo_files: Collection[str],
) -> Scorecard:
    card = Scorecard()
    for item in golden:
        score = card.splits[item.split]
        predicted = classify(item.case)
        score.cases += 1
        card.confusion[(item.category, predicted)] += 1
        if predicted == item.category:
            score.correct += 1
        else:
            card.misses.append((item.case.case_id, item.category, predicted))

        if item.evidence.fix_files:
            score.fix_eligible += 1
            suggested = set(suggest(item.case, repo_files))
            if suggested & set(item.evidence.fix_files):
                score.fix_hits += 1
    return card


def _pct(value: float | None) -> str:
    return "n/a" if value is None else f"{value:.0%}"


def render(card: Scorecard) -> str:
    lines = [
        "| Split | Cases | Category accuracy | Fix-file hit rate |",
        "| --- | --- | --- | --- |",
    ]
    for name, score in card.splits.items():
        lines.append(
            f"| {name} | {score.cases} | {_pct(score.accuracy)} "
            f"({score.correct}/{score.cases}) | {_pct(score.fix_hit_rate)} "
            f"({score.fix_hits}/{score.fix_eligible}) |"
        )

    categories = list(Category)
    lines += [
        "",
        "Confusion (rows: answer key, columns: predicted)",
        "",
        "| | " + " | ".join(c.value for c in categories) + " |",
        "| --- |" + " --- |" * len(categories),
    ]
    for expected in categories:
        row = [str(card.confusion[(expected, got)]) for got in categories]
        lines.append(f"| **{expected.value}** | " + " | ".join(row) + " |")
    return "\n".join(lines)


def render_spend(records: list[TriageRecord]) -> str:
    """What a model-backed run spent: calls, fallbacks, tokens, notional cost, time.

    Cost is Claude Code's estimate at API list prices. Nothing is billed on the
    subscription, so it reads as quota used, not money.
    """
    used = [r.usage for r in records if r.usage is not None]
    fallbacks = [r for r in records if r.source == "rules"]
    lines = [
        f"Cases: {len(records)} ({len(records) - len(fallbacks)} answered by the "
        f"model, {len(fallbacks)} fell back to rules)",
    ]
    for record in fallbacks:
        lines.append(f"  - {record.case_id}: {record.fallback_reason}")
    if not used:
        return "\n".join(lines)
    seconds = sorted(u.duration_ms / 1000 for u in used)
    fresh_input = sum(u.input_tokens + u.cache_creation_input_tokens for u in used)
    cached_input = sum(u.cache_read_input_tokens for u in used)
    lines += [
        f"Calls: {sum(u.attempts for u in used)} process(es), "
        f"{sum(u.num_turns for u in used)} turn(s), model "
        + ", ".join(sorted({u.model for u in used})),
        f"Tokens: {fresh_input:,} input + {cached_input:,} from cache, "
        f"{sum(u.output_tokens for u in used):,} output",
        f"Notional cost: ${sum(u.cost_usd for u in used):.4f} total, "
        f"${sum(u.cost_usd for u in used) / len(used):.4f} per case "
        "(API list price; not billed on the subscription)",
        f"Latency per case: median {seconds[len(seconds) // 2]:.1f}s, "
        f"max {seconds[-1]:.1f}s",
    ]
    return "\n".join(lines)
