"""Red-first (T93): mole_ab() must offer a public-usable `agent` option (`claude_code`/`codex` via
inspect-swe, no hermes subscription needed) alongside the existing `hermes` default, selecting the right
solver and the sandbox each needs (claude_code/codex run through Inspect's sandbox_agent_bridge, which
needs an Inspect sandbox environment -- "local" runs them directly on the host, no Docker, against
whatever `claude`/`codex` binary is on the user's own PATH; hermes needs no sandbox at all, since it never
uses Inspect's model loop -- see worktree_agent.py's docstring)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

EVAL_DIR = Path(__file__).resolve().parents[2]
if str(EVAL_DIR) not in sys.path:
    sys.path.insert(0, str(EVAL_DIR))

import pytest

from dcbench_eval.task import mole_ab


@pytest.fixture
def tiny_dataset(tmp_path):
    p = tmp_path / "tasks.jsonl"
    p.write_text(json.dumps({"id": "t1", "prompt": "do it"}) + "\n")
    return str(p)


@pytest.fixture
def tiny_repo(tmp_path):
    import subprocess

    repo = tmp_path / "repo"
    repo.mkdir()
    subprocess.run(["git", "init", "-q"], cwd=repo, check=True)
    subprocess.run(["git", "config", "user.email", "t@example.com"], cwd=repo, check=True)
    subprocess.run(["git", "config", "user.name", "t"], cwd=repo, check=True)
    (repo / "a.txt").write_text("hello\n")
    subprocess.run(["git", "add", "a.txt"], cwd=repo, check=True)
    subprocess.run(["git", "commit", "-q", "-m", "init"], cwd=repo, check=True)
    return repo


def test_default_agent_is_hermes_no_sandbox_needed(tiny_repo, tiny_dataset):
    task = mole_ab(repo=str(tiny_repo), dataset=tiny_dataset, arms="none")
    assert task.sandbox is None


def test_agent_claude_code_selects_local_sandbox(tiny_repo, tiny_dataset):
    task = mole_ab(repo=str(tiny_repo), dataset=tiny_dataset, arms="none", agent="claude_code")
    assert task.sandbox is not None
    assert task.sandbox.type == "local"


def test_agent_codex_selects_local_sandbox(tiny_repo, tiny_dataset):
    task = mole_ab(repo=str(tiny_repo), dataset=tiny_dataset, arms="none", agent="codex")
    assert task.sandbox is not None
    assert task.sandbox.type == "local"


def test_unknown_agent_rejected(tiny_repo, tiny_dataset):
    with pytest.raises(ValueError, match="unknown agent"):
        mole_ab(repo=str(tiny_repo), dataset=tiny_dataset, arms="none", agent="bogus")
