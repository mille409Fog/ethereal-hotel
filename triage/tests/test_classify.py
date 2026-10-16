"""The Stage 3 step: one model call per case, a rules fallback, and the record cache."""

from collections.abc import Callable
from pathlib import Path

import pytest
from fakes import make_case

from ci_triage.classify import (
    PROMPT_VERSION,
    FirstCallFailedError,
    RecordStore,
    files_at,
    listed_files,
    render_case,
    system_prompt,
    triage_all,
    triage_case,
    triage_schema,
)
from ci_triage.claude_cli import Answer, ClaudeCallError, UsageLimitError
from ci_triage.models import (
    Category,
    Confidence,
    FailedJob,
    JsonObject,
    TriageRecord,
    Usage,
)

USAGE = Usage(
    model="claude-sonnet-5-5",
    input_tokens=5,
    cache_creation_input_tokens=0,
    cache_read_input_tokens=4000,
    output_tokens=200,
    cost_usd=0.01,
    duration_ms=6000,
    num_turns=2,
    attempts=1,
)

GOOD: JsonObject = {
    "category": "threshold",
    "hypothesis": "The bundle outgrew its budget.",
    "evidence": ["bundle initial exceeded maximum budget"],
    "suggested_files": ["angular.json"],
    "fix_rationale": "Budgets are configured there.",
    "confidence": "high",
}

TRACKED = {"angular.json", "src/main.ts"}


class FakeAsk:
    def __init__(self, *outcomes: JsonObject | BaseException) -> None:
        self.outcomes = list(outcomes)
        self.prompts: list[tuple[str, str]] = []

    def __call__(self, system: str, user: str, schema: JsonObject) -> Answer:
        self.prompts.append((system, user))
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, BaseException):
            raise outcome
        return Answer(outcome, USAGE)


def single(ask: FakeAsk) -> Callable[[FailedJob], TriageRecord]:
    return lambda case: triage_case(case, ask, "p", TRACKED)


# --- the prompt ------------------------------------------------------------------


def test_the_schema_offers_exactly_the_categories_and_confidences() -> None:
    props = triage_schema()["properties"]
    assert isinstance(props, dict)
    assert props["category"]["enum"] == [c.value for c in Category]
    assert props["confidence"]["enum"] == [c.value for c in Confidence]


def test_the_file_list_is_the_tree_at_the_commit_or_nothing() -> None:
    def git(args: list[str]) -> tuple[int, str, str]:
        assert args == ["ls-tree", "-r", "--name-only", "abc"]
        return 0, "a.ts\nb/c.json\n", ""

    assert files_at(git, "abc") == ["a.ts", "b/c.json"]
    assert files_at(lambda args: (128, "", "bad object"), "abc") is None


def test_the_file_list_leaves_out_the_corpus_and_binaries() -> None:
    tracked = ["b.ts", "a.json", "triage/data/corpus/1.json", "docs/x.PNG", "r.pdf"]
    assert listed_files(tracked) == ["a.json", "b.ts", "r.pdf"]


def test_the_prompt_file_is_filled_with_the_file_list() -> None:
    prompt = system_prompt(PROMPT_VERSION, ["src/main.ts", "angular.json"])
    assert "{repo_files}" not in prompt
    assert "angular.json\nsrc/main.ts" in prompt
    for category in Category:
        assert f"`{category.value}`" in prompt


def test_the_case_is_wrapped_as_data_with_errors_deduplicated() -> None:
    case = make_case(text="the log", error_lines=("boom", "boom", "bang"))
    rendered = render_case(case)
    assert rendered.startswith("<job>") and rendered.endswith("</job>")
    assert rendered.count("- boom") == 1
    assert "the log" in rendered


# --- triage_case -----------------------------------------------------------------


def test_a_good_answer_becomes_a_model_record() -> None:
    record = triage_case(make_case(), FakeAsk(GOOD), "prompt", TRACKED)
    assert record.source == "model"
    assert record.triage.category is Category.THRESHOLD
    assert record.triage.suggested_files == ("angular.json",)
    assert record.usage == USAGE
    assert record.fallback_reason is None


def test_an_answer_our_types_reject_falls_back_to_rules() -> None:
    bad = {**GOOD, "category": "cosmic-rays"}
    record = triage_case(make_case(), FakeAsk(bad), "prompt", TRACKED)
    assert record.source == "rules"
    assert record.triage.confidence is Confidence.LOW
    assert record.fallback_reason is not None
    assert "category" in record.fallback_reason
    # The call that produced the bad answer still spent quota.
    assert record.usage == USAGE


@pytest.mark.parametrize("kind", ["invalid", "retry"])
def test_a_call_with_no_usable_answer_falls_back_to_rules(kind: str) -> None:
    failure = ClaudeCallError(kind, "nope", USAGE)  # type: ignore[arg-type]
    record = triage_case(make_case(), FakeAsk(failure), "prompt", TRACKED)
    assert record.source == "rules"
    assert record.fallback_reason == f"{kind}: nope"


def test_the_limit_and_a_broken_setup_are_not_papered_over() -> None:
    with pytest.raises(UsageLimitError):
        triage_case(make_case(), FakeAsk(UsageLimitError("x")), "p", TRACKED)
    with pytest.raises(ClaudeCallError):
        triage_case(
            make_case(), FakeAsk(ClaudeCallError("fatal", "x", None)), "p", TRACKED
        )


# --- the store and triage_all ----------------------------------------------------


def test_a_record_round_trips_through_the_store(tmp_path: Path) -> None:
    store = RecordStore(tmp_path)
    record = triage_case(make_case(), FakeAsk(GOOD), "prompt", TRACKED)
    store.save(record)
    assert store.path_for(record.case_id).parent.name == PROMPT_VERSION
    assert store.get(record.case_id) == record
    assert store.get("missing") is None


def test_stored_cases_cost_nothing_and_new_ones_are_saved_at_once(
    tmp_path: Path,
) -> None:
    store = RecordStore(tmp_path)
    first, second = make_case(run_id=1), make_case(run_id=2)
    store.save(triage_case(first, FakeAsk(GOOD), "p", TRACKED))

    ask = FakeAsk(GOOD)
    records = triage_all([first, second], single(ask), store)

    assert [r.case_id for r in records] == ["1-10", "2-10"]
    assert len(ask.prompts) == 1
    assert store.get("2-10") is not None


def test_a_limit_mid_run_keeps_what_was_done(tmp_path: Path) -> None:
    store = RecordStore(tmp_path)
    cases = [make_case(run_id=n) for n in (1, 2, 3)]
    ask = FakeAsk(GOOD, UsageLimitError("limit"))
    with pytest.raises(UsageLimitError):
        triage_all(cases, single(ask), store)
    assert store.get("1-10") is not None
    assert store.get("2-10") is None


def test_a_run_whose_first_call_falls_back_stops_there(tmp_path: Path) -> None:
    store = RecordStore(tmp_path)
    cases = [make_case(run_id=n) for n in (1, 2)]
    ask = FakeAsk(ClaudeCallError("invalid", "schema", USAGE), GOOD)
    with pytest.raises(FirstCallFailedError):
        triage_all(cases, single(ask), store)
    # The failed record is kept, so the evidence of what went wrong is too.
    record = store.get("1-10")
    assert record is not None and record.source == "rules"
    assert len(ask.prompts) == 1


def test_a_later_fallback_does_not_stop_the_run(tmp_path: Path) -> None:
    store = RecordStore(tmp_path)
    cases = [make_case(run_id=n) for n in (1, 2, 3)]
    ask = FakeAsk(GOOD, ClaudeCallError("invalid", "schema", USAGE), GOOD)
    records = triage_all(cases, single(ask), store)
    assert [r.source for r in records] == ["model", "rules", "model"]
