"""The agent's tools, against a real throwaway git repository.

Real git rather than a fake, because the tools' behaviour *is* git's: pathspecs,
`<sha>:<path>`, grep's exit codes. A fake would only test what we think git does.
"""

import subprocess
from pathlib import Path

import pytest

from ci_triage.tools import (
    MAX_MATCHES,
    TOOLS,
    CaseContext,
    EarlierFailure,
    Git,
    HistoryRun,
    call_tool,
    real_git,
)


def _git(repo: Path, *args: str) -> str:
    return subprocess.run(
        ["git", "-C", str(repo), *args],
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()


@pytest.fixture(scope="module")
def repo(tmp_path_factory: pytest.TempPathFactory) -> tuple[Path, str, str]:
    """Two commits. Returns (path, first sha, second sha)."""
    root = tmp_path_factory.mktemp("repo")
    _git(root, "init", "-q")
    _git(root, "config", "user.email", "t@example.com")
    _git(root, "config", "user.name", "t")
    _git(root, "config", "core.autocrlf", "false")
    files = {
        "e2e/support/lobby.ts": "export const LOBBY_TIMEOUT = 20_000;\n",
        "e2e/aubade.spec.ts": "await waitFor(LOBBY_TIMEOUT);\n",
        "angular.json": '{"budgets": [{"maximumError": "15kB"}]}\n',
        "triage/data/golden/1.json": '{"category": "threshold", "LOBBY_TIMEOUT": 1}\n',
        "many.txt": "".join(f"needle {n}\n" for n in range(MAX_MATCHES + 5)),
        "long.txt": "".join(f"line {n}\n" for n in range(1, 301)),
    }
    for name, text in files.items():
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8", newline="\n")
    (root / "logo.png").write_bytes(b"\x89PNG\x00\x00binary")
    _git(root, "add", "-A")
    _git(root, "commit", "-q", "-m", "first")
    first = _git(root, "rev-parse", "HEAD")
    (root / "e2e/support/lobby.ts").write_text(
        "export const LOBBY_TIMEOUT = 40_000;\n", encoding="utf-8", newline="\n"
    )
    body = "".join(f"\nrelease note {n}" for n in range(40))
    _git(root, "commit", "-q", "-am", f"raise the lobby budget\n{body}")
    second = _git(root, "rev-parse", "HEAD")
    return root, first, second


def ctx_at(sha: str) -> CaseContext:
    return CaseContext(
        sha=sha,
        workflow="Code Quality",
        job="End-to-end",
        branch="dependabot/npm/x",
        created_at="2026-10-01T00:00:00Z",
        history={
            "development-alpha": (
                HistoryRun(
                    created_at="2026-09-30T00:00:00Z",
                    sha="a" * 40,
                    event="push",
                    run_conclusion="failure",
                    job_conclusion="failure",
                    failed_steps=("Run end-to-end suite",),
                ),
                HistoryRun(
                    created_at="2026-09-29T00:00:00Z",
                    sha="b" * 40,
                    event="push",
                    run_conclusion="success",
                    job_conclusion="success",
                    failed_steps=(),
                ),
            ),
            "dependabot/npm/x": (),
        },
        earlier=(
            EarlierFailure(
                case_id="9-9",
                created_at="2026-09-30T00:00:00Z",
                branch="development-alpha",
                sha="a" * 40,
                failed_steps=("Run end-to-end suite",),
                error_lines=("Unlocking the lobby", "Unlocking the lobby", "exit 1"),
            ),
        ),
    )


def call(
    repo: tuple[Path, str, str], name: str, args: dict[str, object], at: int = 1
) -> tuple[str, bool]:
    root, first, second = repo
    git: Git = real_git(str(root))
    return call_tool(ctx_at(first if at == 1 else second), git, name, args)


# --- search_repo -----------------------------------------------------------------


def test_search_finds_a_definition_at_the_failing_commit(
    repo: tuple[Path, str, str],
) -> None:
    text, error = call(repo, "search_repo", {"pattern": "LOBBY_TIMEOUT ="})
    assert not error
    assert "e2e/support/lobby.ts:1:export const LOBBY_TIMEOUT = 20_000;" in text


def test_search_cannot_see_the_fix_that_came_later(
    repo: tuple[Path, str, str],
) -> None:
    text, _ = call(repo, "search_repo", {"pattern": "40_000"})
    assert text.startswith("No matches")
    text, _ = call(repo, "search_repo", {"pattern": "40_000"}, at=2)
    assert "lobby.ts" in text


def test_search_never_reaches_the_triage_labels(repo: tuple[Path, str, str]) -> None:
    text, _ = call(repo, "search_repo", {"pattern": "LOBBY_TIMEOUT"})
    assert "triage/" not in text
    text, _ = call(repo, "search_repo", {"pattern": "category"})
    assert text.startswith("No matches")


def test_search_narrows_by_glob_and_caps_its_answer(
    repo: tuple[Path, str, str],
) -> None:
    text, _ = call(repo, "search_repo", {"pattern": "LOBBY", "path_glob": "*.json"})
    assert text.startswith("No matches")
    text, _ = call(repo, "search_repo", {"pattern": "needle"})
    assert f"{MAX_MATCHES + 5} match(es)" in text
    assert "5 more not shown" in text


def test_a_bad_regex_says_how_to_fix_it(repo: tuple[Path, str, str]) -> None:
    text, error = call(repo, "search_repo", {"pattern": "budget("})
    assert error
    assert "Escape regex" in text


# --- read_file -------------------------------------------------------------------


def test_read_file_returns_numbered_lines_and_says_what_is_left(
    repo: tuple[Path, str, str],
) -> None:
    text, error = call(
        repo, "read_file", {"path": "long.txt", "start_line": 10, "line_count": 3}
    )
    assert not error
    assert text.splitlines()[0] == f"long.txt at {repo[1][:10]}, lines 10-12 of 300"
    assert "   10  line 10" in text
    assert "ask with start_line=13" in text


def test_a_missing_file_suggests_the_real_one(repo: tuple[Path, str, str]) -> None:
    text, error = call(repo, "read_file", {"path": "src/lobby.ts"})
    assert error
    assert "e2e/support/lobby.ts" in text


@pytest.mark.parametrize(
    ("args", "message"),
    [
        ({"path": "../secrets"}, "without `..`"),
        ({"path": "/etc/passwd"}, "relative"),
        ({"path": "triage/data/golden/1.json"}, "outside the investigation"),
        ({"path": "logo.png"}, "binary"),
        ({"path": "long.txt", "start_line": 400}, "past the end"),
        ({"path": "long.txt", "line_count": 5000}, "from 1 to 200"),
        ({"path": "long.txt", "start_line": True}, "whole number"),
        ({"path": "long.txt", "mode": "all"}, "Unknown argument"),
        ({}, "`path` must be"),
    ],
)
def test_read_file_refuses_with_a_reason(
    repo: tuple[Path, str, str], args: dict[str, object], message: str
) -> None:
    text, error = call(repo, "read_file", args)
    assert error
    assert message in text


# --- commit_changes --------------------------------------------------------------


def test_commit_changes_lists_the_files_and_shows_one_diff(
    repo: tuple[Path, str, str],
) -> None:
    text, _ = call(repo, "commit_changes", {}, at=2)
    assert "raise the lobby budget" in text
    # Files before the message, and a long message cut short.
    assert text.index("e2e/support/lobby.ts") < text.index("release note 0")
    assert "release note 11" in text and "release note 12" not in text
    assert "… 28 more line(s)" in text
    diff, _ = call(repo, "commit_changes", {"path": "e2e/support/lobby.ts"}, at=2)
    assert "+export const LOBBY_TIMEOUT = 40_000;" in diff
    untouched, error = call(repo, "commit_changes", {"path": "angular.json"}, at=2)
    assert not error
    assert "did not change `angular.json`" in untouched


# --- job_history and earlier_failures --------------------------------------------


def test_job_history_shows_the_job_on_a_branch(repo: tuple[Path, str, str]) -> None:
    text, error = call(repo, "job_history", {"branch": "development-alpha"})
    assert not error
    lines = text.splitlines()
    assert "before this failure" in lines[0]
    assert "job failure, run failure — failed: Run end-to-end suite" in lines[1]
    assert "job success" in lines[2]
    one, _ = call(repo, "job_history", {"branch": "development-alpha", "limit": 1})
    assert len(one.splitlines()) == 2


def test_job_history_names_the_branches_it_has(repo: tuple[Path, str, str]) -> None:
    text, error = call(repo, "job_history", {"branch": "main"})
    assert error
    assert "Available: dependabot/npm/x, development-alpha" in text
    empty, error = call(repo, "job_history", {"branch": "dependabot/npm/x"})
    assert not error
    assert empty.startswith("No earlier runs")


def test_earlier_failures_show_error_lines_and_no_conclusion(
    repo: tuple[Path, str, str],
) -> None:
    text, error = call(repo, "earlier_failures", {})
    assert not error
    assert text.count("Unlocking the lobby") == 1  # deduplicated
    assert "nobody's conclusion" in text
    for word in ("threshold", "environment", "category"):
        assert word not in text


# --- the registry ----------------------------------------------------------------


def test_an_unknown_tool_lists_the_real_ones(repo: tuple[Path, str, str]) -> None:
    text, error = call(repo, "grep", {})
    assert error
    assert "search_repo" in text


def test_every_tool_has_a_strict_schema_and_a_description() -> None:
    assert 3 <= len(TOOLS) <= 6
    for tool in TOOLS:
        assert tool.input_schema["additionalProperties"] is False
        assert len(tool.description) > 80


def test_a_case_context_round_trips_through_json() -> None:
    ctx = ctx_at("c" * 40)
    assert CaseContext.from_json(ctx.to_json()) == ctx
