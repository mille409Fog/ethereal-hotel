"""The agent's tools: five read-only questions about one failed job.

Each tool is designed like an API for a new teammate. It has a name that says what it
does, a description that says when to use it, a strict input schema, and errors that
say how to recover. The descriptions are the only documentation the model ever reads.

Three rules hold for every tool:

1. **Read-only.** Nothing here writes to the repository, to GitHub, or to disk.
2. **As of the failure.** Repository reads happen at the failing commit, and history
   stops before the failing run, so the agent cannot see the fix that came later.
3. **Small answers.** Every result goes into the model's context and is paid for again
   on each later turn, so each tool returns a capped, targeted slice, not a whole file.

The tools run offline. Everything they need from GitHub (job history, earlier failures)
was gathered by the workflow before the agent started and arrives in a `CaseContext`.
Git is the only process they start, and it reads the local clone.
"""

import difflib
import subprocess
from collections.abc import Callable, Mapping
from dataclasses import asdict, dataclass
from pathlib import PurePosixPath
from typing import Final

from ci_triage.models import JsonObject

# Runs `git <args>` in the repository; returns (exit code, stdout, stderr).
Git = Callable[[list[str]], tuple[int, str, str]]

MAX_MATCHES: Final = 40
MAX_LINE_CHARS: Final = 200
DEFAULT_LINES: Final = 120
MAX_LINES: Final = 200
MAX_DIFF_LINES: Final = 200
MAX_BODY_LINES: Final = 12
DEFAULT_RUNS: Final = 10
MAX_RUNS: Final = 20
DEFAULT_FAILURES: Final = 5
MAX_FAILURES: Final = 10
MAX_ERROR_LINES: Final = 6

# The triage tool's own files: its corpus and golden set carry the labels, so they are
# outside what an investigation may read, at any commit.
OUT_OF_SCOPE: Final = "triage/"


def real_git(repo: str) -> Git:
    def run(args: list[str]) -> tuple[int, str, str]:
        done = subprocess.run(
            ["git", "-C", repo, *args],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=30,
            check=False,
        )
        return done.returncode, done.stdout, done.stderr

    return run


class ToolError(Exception):
    """A tool call the agent can correct. The message tells it how."""


# --- the case the tools answer about ---------------------------------------------


@dataclass(frozen=True)
class HistoryRun:
    """One earlier run of the failing job's workflow, and how that job fared in it."""

    created_at: str
    sha: str
    event: str
    run_conclusion: str
    # "" when the job did not run in that run, or had another name then.
    job_conclusion: str
    failed_steps: tuple[str, ...]


@dataclass(frozen=True)
class EarlierFailure:
    """An earlier failure of the same job, from the corpus. Error lines, no label."""

    case_id: str
    created_at: str
    branch: str
    sha: str
    failed_steps: tuple[str, ...]
    error_lines: tuple[str, ...]


@dataclass(frozen=True)
class CaseContext:
    sha: str
    workflow: str
    job: str
    branch: str
    created_at: str
    # Branch name → its runs before this failure, newest first.
    history: Mapping[str, tuple[HistoryRun, ...]]
    earlier: tuple[EarlierFailure, ...]

    def to_json(self) -> JsonObject:
        return {
            "sha": self.sha,
            "workflow": self.workflow,
            "job": self.job,
            "branch": self.branch,
            "created_at": self.created_at,
            "history": {
                b: [asdict(r) for r in runs] for b, runs in self.history.items()
            },
            "earlier": [asdict(e) for e in self.earlier],
        }

    @classmethod
    def from_json(cls, data: JsonObject) -> "CaseContext":
        history = data.get("history")
        earlier = data.get("earlier")
        if not isinstance(history, dict) or not isinstance(earlier, list):
            raise ValueError("history and earlier: expected an object and a list")
        return cls(
            sha=_s(data, "sha"),
            workflow=_s(data, "workflow"),
            job=_s(data, "job"),
            branch=_s(data, "branch"),
            created_at=_s(data, "created_at"),
            history={
                str(branch): tuple(_history_run(run) for run in _objects(runs))
                for branch, runs in history.items()
            },
            earlier=tuple(_earlier_failure(item) for item in _objects(earlier)),
        )


def _s(data: JsonObject, key: str) -> str:
    value = data.get(key)
    if not isinstance(value, str):
        raise ValueError(f"{key}: expected a string, got {value!r}")
    return value


def _strs(data: JsonObject, key: str) -> tuple[str, ...]:
    value = data.get(key)
    if not isinstance(value, list | tuple) or not all(
        isinstance(v, str) for v in value
    ):
        raise ValueError(f"{key}: expected a list of strings, got {value!r}")
    return tuple(value)


def _objects(value: object) -> list[JsonObject]:
    if not isinstance(value, list) or not all(isinstance(v, dict) for v in value):
        raise ValueError(f"expected a list of objects, got {value!r}")
    return value


def _history_run(data: JsonObject) -> HistoryRun:
    return HistoryRun(
        created_at=_s(data, "created_at"),
        sha=_s(data, "sha"),
        event=_s(data, "event"),
        run_conclusion=_s(data, "run_conclusion"),
        job_conclusion=_s(data, "job_conclusion"),
        failed_steps=_strs(data, "failed_steps"),
    )


def _earlier_failure(data: JsonObject) -> EarlierFailure:
    return EarlierFailure(
        case_id=_s(data, "case_id"),
        created_at=_s(data, "created_at"),
        branch=_s(data, "branch"),
        sha=_s(data, "sha"),
        failed_steps=_strs(data, "failed_steps"),
        error_lines=_strs(data, "error_lines"),
    )


# --- argument checking: the model's arguments are input, and are checked as such --


def _check_keys(args: Mapping[str, object], allowed: set[str]) -> None:
    unknown = sorted(set(args) - allowed)
    if unknown:
        raise ToolError(
            f"Unknown argument(s) {unknown}. This tool takes: {sorted(allowed)}."
        )


def _text_arg(args: Mapping[str, object], key: str, required: bool = True) -> str:
    value = args.get(key)
    if value is None and not required:
        return ""
    if not isinstance(value, str) or not value.strip():
        raise ToolError(f"`{key}` must be a non-empty string.")
    return value


def _int_arg(
    args: Mapping[str, object], key: str, default: int, low: int, high: int
) -> int:
    value = args.get(key, default)
    if (
        not isinstance(value, int)
        or isinstance(value, bool)
        or not low <= value <= high
    ):
        raise ToolError(f"`{key}` must be a whole number from {low} to {high}.")
    return value


def _clip(line: str) -> str:
    return line if len(line) <= MAX_LINE_CHARS else line[:MAX_LINE_CHARS] + " …"


def _short(sha: str) -> str:
    return sha[:10]


def _clean_path(path: str) -> str:
    clean = str(PurePosixPath(path.strip().replace("\\", "/"))).removeprefix("./")
    if clean.startswith("/") or ".." in PurePosixPath(clean).parts:
        raise ToolError("`path` must be relative to the repository root, without `..`.")
    if clean.startswith(OUT_OF_SCOPE):
        raise ToolError(
            f"`{OUT_OF_SCOPE}` is the triage tool itself and is outside the "
            "investigation. Read the application's files instead."
        )
    return clean


# --- the five tools --------------------------------------------------------------


def search_repo(ctx: CaseContext, git: Git, args: Mapping[str, object]) -> str:
    _check_keys(args, {"pattern", "path_glob"})
    pattern = _text_arg(args, "pattern")
    glob = _text_arg(args, "path_glob", required=False)
    pathspecs = [f":(glob){glob}"] if glob else []
    code, out, err = git(
        [
            "grep", "-n", "-I", "-E", "-e", pattern, ctx.sha, "--",
            *pathspecs, f":(exclude){OUT_OF_SCOPE}",
        ]
    )  # fmt: skip
    if code == 1:
        where = f" in `{glob}`" if glob else ""
        return (
            f"No matches for /{pattern}/{where} at {_short(ctx.sha)}. The pattern is a "
            "POSIX extended regex and is case-sensitive: try a shorter literal "
            "substring, or drop `path_glob`."
        )
    if code != 0:
        raise ToolError(
            f"git grep rejected the search: {err.strip()[:300]}. Escape regex "
            r"metacharacters such as ( ) [ ] . * with a backslash."
        )
    prefix = f"{ctx.sha}:"
    lines = [_clip(line.removeprefix(prefix)) for line in out.splitlines()]
    shown = lines[:MAX_MATCHES]
    header = f"{len(lines)} match(es) at {_short(ctx.sha)} (path:line:text)"
    footer = (
        [
            f"… {len(lines) - MAX_MATCHES} more not shown: narrow `path_glob` "
            "or the pattern."
        ]
        if len(lines) > MAX_MATCHES
        else []
    )
    return "\n".join([header, *shown, *footer])


def _similar_paths(ctx: CaseContext, git: Git, path: str) -> list[str]:
    code, out, _ = git(["ls-tree", "-r", "--name-only", ctx.sha])
    if code != 0:
        return []
    files = [f for f in out.splitlines() if not f.startswith(OUT_OF_SCOPE)]
    name = PurePosixPath(path).name
    same_name = [f for f in files if PurePosixPath(f).name == name]
    return same_name[:5] or difflib.get_close_matches(path, files, n=5, cutoff=0.5)


def read_file(ctx: CaseContext, git: Git, args: Mapping[str, object]) -> str:
    _check_keys(args, {"path", "start_line", "line_count"})
    path = _clean_path(_text_arg(args, "path"))
    start = _int_arg(args, "start_line", 1, 1, 1_000_000)
    count = _int_arg(args, "line_count", DEFAULT_LINES, 1, MAX_LINES)
    code, out, _ = git(["show", f"{ctx.sha}:{path}"])
    if code != 0:
        similar = _similar_paths(ctx, git, path)
        hint = f" Did you mean: {', '.join(similar)}?" if similar else ""
        raise ToolError(
            f"No file `{path}` at {_short(ctx.sha)}.{hint} Use search_repo to find "
            "where something is defined."
        )
    if "\0" in out:
        raise ToolError(f"`{path}` is a binary file and cannot be read as text.")
    lines = out.splitlines()
    if start > len(lines):
        raise ToolError(
            f"`{path}` has {len(lines)} lines; start_line {start} is past the end."
        )
    end = min(start + count - 1, len(lines))
    body = [f"{n:>5}  {_clip(lines[n - 1])}" for n in range(start, end + 1)]
    more = (
        [f"… lines {end + 1}-{len(lines)} not shown; ask with start_line={end + 1}."]
        if end < len(lines)
        else []
    )
    return "\n".join(
        [
            f"{path} at {_short(ctx.sha)}, lines {start}-{end} of {len(lines)}",
            *body,
            *more,
        ]
    )


def commit_changes(ctx: CaseContext, git: Git, args: Mapping[str, object]) -> str:
    _check_keys(args, {"path"})
    raw = _text_arg(args, "path", required=False)
    if not raw:
        code, stat, err = git(
            [
                "show", "--stat=120", "--diff-merges=first-parent",
                "--format=commit %H%nauthored %aI%n%s", ctx.sha,
            ]
        )  # fmt: skip
        if code != 0:
            raise ToolError(f"git could not show the commit: {err.strip()[:300]}")
        # The message body last and capped: an upgrade bot's body is pages of release
        # notes, written outside this repository, that would sit in the context for
        # every later turn.
        _, body, _ = git(["show", "-s", "--format=%b", ctx.sha])
        body_lines = [_clip(line) for line in body.strip().splitlines()]
        lines = [_clip(line) for line in stat.strip().splitlines()][:MAX_DIFF_LINES]
        if body_lines:
            lines += ["", "message body:", *body_lines[:MAX_BODY_LINES]]
            if len(body_lines) > MAX_BODY_LINES:
                lines.append(f"… {len(body_lines) - MAX_BODY_LINES} more line(s)")
        return "\n".join(lines)
    path = _clean_path(raw)
    code, out, err = git(
        ["show", "--format=", "--diff-merges=first-parent", ctx.sha, "--", path]
    )
    if code != 0:
        raise ToolError(f"git could not show the diff: {err.strip()[:300]}")
    if not out.strip():
        return (
            f"The failing commit {_short(ctx.sha)} did not change `{path}`. Call "
            "commit_changes with no path to see which files it did change."
        )
    lines = [_clip(line) for line in out.splitlines()]
    more = (
        [f"… {len(lines) - MAX_DIFF_LINES} more diff lines not shown."]
        if len(lines) > MAX_DIFF_LINES
        else []
    )
    return "\n".join([*lines[:MAX_DIFF_LINES], *more])


def job_history(ctx: CaseContext, git: Git, args: Mapping[str, object]) -> str:
    _check_keys(args, {"branch", "limit"})
    branch = _text_arg(args, "branch")
    limit = _int_arg(args, "limit", DEFAULT_RUNS, 1, MAX_RUNS)
    if branch not in ctx.history:
        raise ToolError(
            f"No history gathered for `{branch}`. Available: "
            f"{', '.join(sorted(ctx.history))}."
        )
    runs = ctx.history[branch][:limit]
    if not runs:
        return (
            f"No earlier runs of `{ctx.workflow}` on `{branch}` before "
            f"{ctx.created_at}. (Dependabot's own workflow runs cannot be listed.)"
        )
    lines = [
        f"`{ctx.job}` in earlier runs of `{ctx.workflow}` on `{branch}`, newest "
        f"first, all before this failure ({ctx.created_at}):",
    ]
    for run in runs:
        job = run.job_conclusion or "did not run"
        steps = f" — failed: {', '.join(run.failed_steps)}" if run.failed_steps else ""
        lines.append(
            f"- {run.created_at} {_short(run.sha)} ({run.event}): job {job}, "
            f"run {run.run_conclusion or 'unknown'}{steps}"
        )
    return "\n".join(lines)


def earlier_failures(ctx: CaseContext, git: Git, args: Mapping[str, object]) -> str:
    _check_keys(args, {"limit"})
    limit = _int_arg(args, "limit", DEFAULT_FAILURES, 1, MAX_FAILURES)
    found = ctx.earlier[:limit]
    if not found:
        return f"No earlier failures of `{ctx.job}` in the corpus."
    lines = [
        f"Earlier failures of `{ctx.job}`, newest first. Their error lines only; "
        "nobody's conclusion about them is included."
    ]
    for item in found:
        lines.append(
            f"\n{item.created_at} on `{item.branch}` at {_short(item.sha)}"
            f" — failed: {', '.join(item.failed_steps) or '(unknown)'}"
        )
        errors = list(dict.fromkeys(item.error_lines))[:MAX_ERROR_LINES]
        lines += [f"  {_clip(e)}" for e in errors] or ["  (no error annotations)"]
    return "\n".join(lines)


# --- the registry: what tools/list advertises ------------------------------------

Handler = Callable[[CaseContext, Git, Mapping[str, object]], str]


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    input_schema: JsonObject
    handler: Handler


def _schema(properties: JsonObject, required: list[str]) -> JsonObject:
    return {
        "type": "object",
        "properties": properties,
        "required": required,
        "additionalProperties": False,
    }


TOOLS: Final[tuple[Tool, ...]] = (
    Tool(
        "search_repo",
        "Search the repository's files, as they were at the failing commit, for a "
        "regular expression (git grep, POSIX extended, case-sensitive). Use it to find "
        "where something named in the log is defined or configured: a constant, a "
        "budget, a test name, a script. Returns path:line:text, at most "
        f"{MAX_MATCHES} matches.",
        _schema(
            {
                "pattern": {"type": "string", "description": "Regex to search for."},
                "path_glob": {
                    "type": "string",
                    "description": "Optional glob limiting the search, e.g. 'e2e/**' "
                    "or '*.json'.",
                },
            },
            ["pattern"],
        ),
        search_repo,
    ),
    Tool(
        "read_file",
        "Read numbered lines of one repository file as it was at the failing commit. "
        f"At most {MAX_LINES} lines per call; read around a search_repo match rather "
        "than whole files.",
        _schema(
            {
                "path": {"type": "string", "description": "Path from the repo root."},
                "start_line": {"type": "integer", "minimum": 1},
                "line_count": {"type": "integer", "minimum": 1, "maximum": MAX_LINES},
            },
            ["path"],
        ),
        read_file,
    ),
    Tool(
        "commit_changes",
        "What the failing commit changed. With no path: its message and the list of "
        "files it changed, with line counts. With a path: that file's diff in this "
        "commit. Use it to judge whether the commit itself could have caused the "
        "failure.",
        _schema(
            {"path": {"type": "string", "description": "Optional file to diff."}},
            [],
        ),
        commit_changes,
    ),
    Tool(
        "job_history",
        "How this same job fared in earlier runs of its workflow on a branch, before "
        "this failure: newest first, with each run's commit and outcome. Use it to "
        "tell "
        "a failure this branch introduced from one it inherited: if the job was "
        "already failing the same way on the main development branch, the change on "
        "this branch did not cause it.",
        _schema(
            {
                "branch": {
                    "type": "string",
                    "description": "Branch name; the error lists the available ones.",
                },
                "limit": {"type": "integer", "minimum": 1, "maximum": MAX_RUNS},
            },
            ["branch"],
        ),
        job_history,
    ),
    Tool(
        "earlier_failures",
        "Earlier failures of this same job, from the triage corpus, newest first, "
        "each with its branch, commit and error lines. Use it to recognise a failure "
        "that recurs. It does not say what anyone concluded about them.",
        _schema(
            {"limit": {"type": "integer", "minimum": 1, "maximum": MAX_FAILURES}},
            [],
        ),
        earlier_failures,
    ),
)

TOOLS_BY_NAME: Final = {tool.name: tool for tool in TOOLS}


def call_tool(
    ctx: CaseContext, git: Git, name: str, args: Mapping[str, object]
) -> tuple[str, bool]:
    """Run a tool by name. Returns (text, is_error); never raises for bad input."""
    tool = TOOLS_BY_NAME.get(name)
    if tool is None:
        return f"No tool `{name}`. Tools: {', '.join(TOOLS_BY_NAME)}.", True
    try:
        return tool.handler(ctx, git, args), False
    except ToolError as error:
        return str(error), True
