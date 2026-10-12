# 0002 — Python, inside this repository's existing toolchain

**Status:** accepted, 2026-10-12

## Context

The triage agent lives in this repository because its subject is this repository's CI.
The repository already runs Python under ruff, mypy `--strict` and pytest, from one root
`pyproject.toml` and one venv (`backend/venv`), and those checks already gate CI.

## Options

- **A separate project with its own venv, config and CI job.** Clean isolation, but two
  Python toolchains in one repository to keep in step, and a second place for a lint
  rule to drift.
- **TypeScript beside the Angular app.** The same language as the frontend, but the
  data work (log trimming, labelling, evaluation) is more natural in Python, and the
  Python gates are the stricter of the two here.
- **Python under the existing gates.** Chosen.

## Decision

`triage/` is a Python tree checked by the same ruff and mypy configuration as `backend/`
and `api/`. It runs in the same venv and is tested in the same CI job, as a separate
pytest step because each tree has its own `pytest.ini`.

The plan this project follows asks for a `Makefile`. This repository runs everything
through npm scripts, `make` is not installed on the Windows machine it is developed on,
and `scripts/py-tool.mjs` already finds the venv's tools. So the commands are npm
scripts: `test:triage`, `triage:doctor`, and later `triage:eval`.

## Consequences

- Python 3.11 is the floor (the ruff and mypy target), and CI runs 3.11 and 3.12.
- Two constraints from sharing mypy's module namespace with `backend/`: the entry point
  is `cli.py`, not `main.py`, because `backend/main.py` already owns `main`, and
  `triage/tests/` has no `__init__.py`, so it does not collide with `backend/tests`.
- The project has no third-party runtime dependencies yet. When it gets one, it goes in
  `backend/requirements-dev.txt` beside the tools, not in `backend/requirements.txt`,
  which is the deployed API's runtime list and is checked against `pyproject.toml`.
