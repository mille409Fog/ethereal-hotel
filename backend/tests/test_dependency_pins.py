"""Keep the two runtime dependency lists from drifting apart.

The application's dependencies are declared twice, because the two deployment
targets read different files and neither can read the other's:

* ``backend/requirements.txt`` — what ``backend/Dockerfile`` and CI install.
* ``pyproject.toml`` ``[project.dependencies]`` — what Vercel installs for the
  serverless function in ``api/``. It has to live in ``pyproject.toml``
  specifically, because that is also where ``requires-python`` pins the
  interpreter, and Vercel only consults that file when it is the dependency
  source. A root ``requirements.txt`` silently took priority and cost a
  handful of failed builds before that was understood.

Duplication that depends on someone remembering is duplication that drifts, and
the failure mode here is nasty and remote: the hosted demo quietly running a
different FastAPI from the one the test suite exercised. So it is asserted
rather than trusted. If you add a dependency, add it in both places — this test
tells you when you have not.
"""

import tomllib
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
_REQUIREMENTS = _REPO_ROOT / "backend" / "requirements.txt"
_PYPROJECT = _REPO_ROOT / "pyproject.toml"


def _pinned_from_requirements() -> set[str]:
    """Every requirement line, ignoring comments, blanks and ``-r`` includes."""
    lines = _REQUIREMENTS.read_text(encoding="utf-8").splitlines()
    return {
        stripped
        for line in lines
        if (stripped := line.split("#")[0].strip()) and not stripped.startswith("-")
    }


def _pinned_from_pyproject() -> set[str]:
    with _PYPROJECT.open("rb") as handle:
        return set(tomllib.load(handle)["project"]["dependencies"])


def test_runtime_dependencies_match_across_both_declarations() -> None:
    from_requirements = _pinned_from_requirements()
    from_pyproject = _pinned_from_pyproject()

    assert from_requirements == from_pyproject, (
        "backend/requirements.txt and pyproject.toml [project.dependencies] "
        "have drifted. The container and the Vercel function would install "
        "different versions.\n"
        f"  only in requirements.txt: {sorted(from_requirements - from_pyproject)}\n"
        f"  only in pyproject.toml:   {sorted(from_pyproject - from_requirements)}"
    )


def test_every_runtime_dependency_is_pinned_exactly() -> None:
    """A range would let a deploy six months from now install something untested.

    The comment at the top of ``requirements.txt`` promises exact pins; this is
    what makes that promise checkable.
    """
    unpinned = sorted(dep for dep in _pinned_from_pyproject() if "==" not in dep)
    assert not unpinned, f"Runtime dependencies must be pinned exactly: {unpinned}"
