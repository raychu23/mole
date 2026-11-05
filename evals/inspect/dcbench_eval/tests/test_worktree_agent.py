"""Red-first (T90 follow-up): the worktree solver must actually create/tear down a real git worktree
and run hermes as a subprocess (mocked here; a real hermes call is proven separately in this project's
own internal task history, not in this unit test suite -- no network/paid calls in pytest)."""
from __future__ import annotations

import subprocess

import pytest

from dcbench_eval.worktree_agent import make_worktree, remove_worktree, run_hermes, worktree_diff


@pytest.fixture
def tiny_repo(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    subprocess.run(["git", "init", "-q"], cwd=repo, check=True)
    subprocess.run(["git", "config", "user.email", "t@example.com"], cwd=repo, check=True)
    subprocess.run(["git", "config", "user.name", "t"], cwd=repo, check=True)
    (repo / "a.txt").write_text("hello\n")
    subprocess.run(["git", "add", "a.txt"], cwd=repo, check=True)
    subprocess.run(["git", "commit", "-q", "-m", "init"], cwd=repo, check=True)
    return repo


def test_make_worktree_creates_isolated_checkout(tiny_repo):
    wt = make_worktree(tiny_repo)
    try:
        assert (wt / "a.txt").read_text() == "hello\n"
        assert wt != tiny_repo
    finally:
        remove_worktree(tiny_repo, wt)
    assert not wt.exists()


def test_worktree_edits_never_touch_the_real_repo(tiny_repo):
    wt = make_worktree(tiny_repo)
    try:
        (wt / "a.txt").write_text("edited\n")
        assert (tiny_repo / "a.txt").read_text() == "hello\n"  # untouched
        assert "edited" in worktree_diff(wt)
    finally:
        remove_worktree(tiny_repo, wt)


def test_worktree_diff_includes_untracked_new_files(tiny_repo):
    """Regression test for the artefact in error-analysis-72.md (54% of T63's failed gotchas): a new
    (untracked) file's content must appear in the diff, not just modified-tracked-file content."""
    wt = make_worktree(tiny_repo)
    try:
        (wt / "brand_new.txt").write_text("decision-compliant content here\n")
        diff = worktree_diff(wt)
        assert "brand_new.txt" in diff
        assert "decision-compliant content here" in diff
    finally:
        remove_worktree(tiny_repo, wt)


def test_run_hermes_builds_the_documented_command(tmp_path, monkeypatch):
    captured = {}

    def fake_run(cmd, cwd=None, capture_output=None, text=None, timeout=None):
        captured["cmd"] = cmd
        return subprocess.CompletedProcess(cmd, 0, stdout="ok", stderr="")

    monkeypatch.setattr(subprocess, "run", fake_run)
    rc, out, err, secs = run_hermes("do it", tmp_path, "claude-sonnet-5", "anthropic", tmp_path / "usage.json")
    assert rc == 0 and out == "ok"
    cmd = captured["cmd"]
    assert cmd[:2] == ["hermes", "-z"]
    assert "do it" in cmd
    assert "-m" in cmd and "claude-sonnet-5" in cmd
    assert "--provider" in cmd and "anthropic" in cmd
    assert "--safe-mode" in cmd
    assert "-t" in cmd and cmd[cmd.index("-t") + 1] == "terminal,file"
