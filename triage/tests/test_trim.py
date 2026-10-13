"""Trimming: what survives from a raw log, and that a log always trims the same way."""

from ci_triage.trim import MAX_LINES, TAIL_LINES, clean_line, trim


def gh_line(text: str, ts: str = "2026-10-10T18:49:52.1270299Z ") -> str:
    """A line as `gh run view --log-failed` prints it."""
    return f"End-to-end\tRun suite\t{ts}{text}"


def log(*lines: str) -> str:
    return "\n".join(gh_line(line) for line in lines)


# --- clean_line --------------------------------------------------------------------


def test_clean_line_drops_the_gh_prefix_and_the_timestamp() -> None:
    assert clean_line(gh_line("hello")) == "hello"


def test_clean_line_drops_the_byte_order_mark_on_the_first_line() -> None:
    assert (
        clean_line(
            gh_line("\N{ZERO WIDTH NO-BREAK SPACE}2026-10-10T18:49:52Z x", ts="")
        )
        == "x"
    )


def test_clean_line_drops_colour_codes_as_escapes_and_as_gh_prints_them() -> None:
    assert clean_line(gh_line("\x1b[31mred\x1b[0m")) == "red"
    assert clean_line(gh_line("^[[31m✘ ^[[41;31m[ERROR]^[[0m")) == "✘ [ERROR]"


def test_clean_line_keeps_continuation_lines_that_have_no_timestamp() -> None:
    assert clean_line("job\tstep\t    Error: boom") == "    Error: boom"


def test_clean_line_tolerates_a_line_without_the_gh_prefix() -> None:
    assert clean_line("plain text") == "plain text"


# --- trim --------------------------------------------------------------------------


def test_an_empty_log_trims_to_an_empty_excerpt() -> None:
    excerpt = trim("")
    assert excerpt.text == ""
    assert excerpt.error_lines == ()
    assert excerpt.source_lines == 0
    assert not excerpt.truncated


def test_error_annotations_are_collected_without_their_marker() -> None:
    excerpt = trim(log("setup", "##[error]  1) e2e/a.spec.ts:1:1 › fails", "done"))
    assert excerpt.error_lines == ("1) e2e/a.spec.ts:1:1 › fails",)


def test_the_window_around_an_annotation_is_kept_and_far_noise_is_not() -> None:
    before = [f"setup {i}" for i in range(200)]
    after = [f"teardown {i}" for i in range(200)]
    excerpt = trim(log(*before, "cause of it", "##[error]it broke", *after))
    assert "cause of it" in excerpt.text
    assert "##[error]it broke" in excerpt.text
    assert "teardown 0" in excerpt.text  # context after the anchor
    assert "setup 0\n" not in excerpt.text
    assert "teardown 199" not in excerpt.text
    assert excerpt.truncated
    assert "lines omitted" in excerpt.text


def test_a_strong_signal_far_above_the_annotation_is_kept() -> None:
    # npm audit: the report sits far above the only annotated line.
    filler = [f"package line {i}" for i in range(100)]
    excerpt = trim(
        log("Severity: high", "fast-uri vulnerable", *filler, "##[error]exit code 1")
    )
    assert "Severity: high" in excerpt.text
    assert "fast-uri vulnerable" in excerpt.text


def test_without_annotations_or_signals_a_weak_hint_anchors() -> None:
    filler = [f"line {i}" for i in range(200)]
    excerpt = trim(log(*filler[:100], "3 tests FAILED", *filler[100:]))
    assert "3 tests FAILED" in excerpt.text
    assert "line 0\n" not in excerpt.text


def test_with_no_anchor_at_all_the_tail_is_kept() -> None:
    lines = [f"quiet {i}" for i in range(300)]
    excerpt = trim(log(*lines))
    kept = [line for line in excerpt.text.splitlines() if line.startswith("quiet")]
    assert kept == lines[-TAIL_LINES:]


def test_the_excerpt_never_exceeds_the_cap_and_always_keeps_the_last_anchor() -> None:
    lines: list[str] = []
    for i in range(60):
        lines += [f"filler {i}.{j}" for j in range(30)]
        lines.append(f"##[error]failure {i}")
    lines.append("##[error]5 failed")
    excerpt = trim(log(*lines))
    content = [line for line in excerpt.text.splitlines() if "omitted" not in line]
    assert len(content) <= MAX_LINES
    assert "##[error]5 failed" in excerpt.text
    assert "##[error]failure 0" in excerpt.text  # earliest windows are kept first


def test_overlapping_windows_merge_instead_of_repeating_lines() -> None:
    excerpt = trim(log("a", "##[error]one", "b", "##[error]two", "c"))
    assert excerpt.text.count("##[error]one") == 1
    assert excerpt.text.count("b") == 1


def test_trimming_is_deterministic() -> None:
    raw = log(*[f"line {i}" for i in range(500)], "##[error]x", "Error: y")
    assert trim(raw) == trim(raw)
