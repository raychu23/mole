"""T93 review FAIL fix #1: reanalyze.py must ship with NO baked-in default path to any private data (the
export tool used to string-rewrite that literal away instead, corrupting the value every caller saw).
These tests are private-data-independent (no skipif) -- they only check the "no default" contract, not
T63's actual numbers (see test_reanalyze.py for that, which legitimately needs the private data present).
"""
from __future__ import annotations

import importlib
import subprocess
import sys

import pytest


def test_default_runs_path_is_none_without_env_var(monkeypatch):
    monkeypatch.delenv("MOLE_AB_RUNS_PATH", raising=False)
    import dcbench_eval.reanalyze as reanalyze

    importlib.reload(reanalyze)
    try:
        assert reanalyze.DEFAULT_RUNS_PATH is None
    finally:
        importlib.reload(reanalyze)  # restore module state for later tests in the same process


def test_default_runs_path_set_from_env_var(monkeypatch, tmp_path):
    runs = tmp_path / "runs.jsonl"
    monkeypatch.setenv("MOLE_AB_RUNS_PATH", str(runs))
    import dcbench_eval.reanalyze as reanalyze

    importlib.reload(reanalyze)
    try:
        assert reanalyze.DEFAULT_RUNS_PATH == runs
    finally:
        monkeypatch.delenv("MOLE_AB_RUNS_PATH", raising=False)
        importlib.reload(reanalyze)


def test_cli_errors_clearly_when_no_runs_path_and_no_inspect_log(tmp_path):
    env = {"PATH": "/usr/bin:/bin"}  # no MOLE_AB_RUNS_PATH
    from dcbench_eval import reanalyze as reanalyze_module

    r = subprocess.run(
        [sys.executable, reanalyze_module.__file__],
        capture_output=True, text=True, env=env, cwd=tmp_path,
    )
    assert r.returncode != 0
    assert "--runs" in r.stderr and "MOLE_AB_RUNS_PATH" in r.stderr
