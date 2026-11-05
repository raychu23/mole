"""T90 round-2 review FAIL fix: worktree cleanup ownership moved to a Task-level `cleanup=` callback
(see worktree_agent.py's module docstring for why). These are real integration tests -- they run the
actual `Task` (dataset -> hermes_worktree_agent solver -> scorer -> cleanup) through `inspect_ai.eval()`,
with only `run_hermes` mocked (no real hermes/network/paid calls), so the fix is exercised the same way
Inspect itself drives it, not just called as a bare function.
"""
from __future__ import annotations

import subprocess
import time
from pathlib import Path

import pytest
from inspect_ai import Task, eval as inspect_eval
from inspect_ai.dataset import MemoryDataset, Sample
from inspect_ai.scorer import Score, Target, mean, scorer
from inspect_ai.solver import TaskState

from dcbench_eval import worktree_agent as wa


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


@scorer(metrics=[mean()])
def dummy_scorer():
    """Minimal scorer standing in for mole_check_scorer/dcbench_scorer -- avoids a dependency on the
    `mole` CLI being on PATH in the test environment, while still reading state.metadata["diff"] the same
    way the real scorers do."""

    async def score(state: TaskState, target: Target) -> Score:
        return Score(value=1.0, answer="ok", explanation=state.metadata.get("diff", "")[:500])

    return score


def worktree_count(repo: Path) -> int:
    r = subprocess.run(["git", "-C", str(repo), "worktree", "list", "--porcelain"], capture_output=True, text=True)
    return r.stdout.count("worktree ") - 1  # exclude the main worktree itself


def run_one_sample(repo: Path, log_dir: Path, time_limit: int | None = None) -> list:
    sample = Sample(id="s", input="do it", metadata={"arm": "none", "commit": "HEAD"})
    task = Task(
        dataset=MemoryDataset([sample]),
        solver=wa.hermes_worktree_agent(repo=str(repo)),
        scorer=dummy_scorer(),
        cleanup=wa.cleanup_sample,
        time_limit=time_limit,
    )
    return inspect_eval(task, model="mockllm/model", log_dir=str(log_dir), display="none")


def test_bad_arm_leaves_no_worktree_registered(tiny_repo, tmp_path, monkeypatch):
    """arms='rules:/nonexistent/path' -> apply_arm raises FileNotFoundError inside solve, before run_hermes
    is ever called. The old scorer-only `finally:` never ran in this case (scoring never happened); the
    fix is that Task-level cleanup runs regardless."""
    sample = Sample(id="s", input="do it", metadata={"arm": "rules:/nonexistent/path", "commit": "HEAD"})
    task = Task(
        dataset=MemoryDataset([sample]),
        solver=wa.hermes_worktree_agent(repo=str(tiny_repo)),
        scorer=dummy_scorer(),
        cleanup=wa.cleanup_sample,
    )
    logs = inspect_eval(task, model="mockllm/model", log_dir=str(tmp_path / "logs"), display="none")
    assert logs[0].samples[0].error is not None
    assert worktree_count(tiny_repo) == 0


def test_timed_out_sample_leaves_no_worktree_registered(tiny_repo, tmp_path, monkeypatch):
    """Simulates Inspect's own Task `time_limit` killing a sample mid-solve (run_hermes outlives the
    limit). Requires run_hermes to go through anyio.to_thread.run_sync(abandon_on_cancel=True) -- a plain
    blocking subprocess.run call in an async solve would block the event loop and defeat the cancellation
    entirely."""

    def slow_run_hermes(prompt, cwd, model, provider, usage_path, timeout=wa.AGENT_TIMEOUT_S):
        time.sleep(5)
        return 0, "ok", "", 5.0

    monkeypatch.setattr(wa, "run_hermes", slow_run_hermes)
    logs = run_one_sample(tiny_repo, tmp_path / "logs", time_limit=1)
    assert worktree_count(tiny_repo) == 0


def test_happy_path_still_scores_diff_including_new_files(tiny_repo, tmp_path, monkeypatch):
    def fake_run_hermes(prompt, cwd, model, provider, usage_path, timeout=wa.AGENT_TIMEOUT_S):
        (Path(cwd) / "brand_new.txt").write_text("decision-compliant content\n")
        return 0, "done", "", 0.1

    monkeypatch.setattr(wa, "run_hermes", fake_run_hermes)
    logs = run_one_sample(tiny_repo, tmp_path / "logs")
    assert logs[0].status == "success"
    explanation = logs[0].samples[0].scores["dummy_scorer"].explanation
    assert "brand_new.txt" in explanation
    assert "decision-compliant content" in explanation
    assert worktree_count(tiny_repo) == 0  # cleanup still runs on the success path


def test_cleanup_sample_is_a_noop_without_worktree_metadata():
    """Solver exceptions before make_worktree() (e.g. a bad commit the caller passed) leave no "worktree"
    key in metadata at all; cleanup_sample must not blow up."""
    import anyio

    state = TaskState(model="mockllm/model", sample_id="x", epoch=0, input=[], messages=[], metadata={})
    anyio.run(wa.cleanup_sample, state)  # must not raise


def test_prune_stale_worktrees_removes_dead_pid_leftovers_immediately_regardless_of_age(tiny_repo):
    """T93 round-2 review MEDIUM fix: a worktree whose lock file's pid is no longer running is stale the
    moment that's detected -- not after waiting out max_age_s (a crashed run's leftovers used to sit for up
    to an hour before anything touched them)."""
    dead_wt = wa.make_worktree(tiny_repo)
    import json as _json

    # simulate a crashed previous run: pid that is (overwhelmingly likely) not running, freshly-mtimed dir
    wa._lock_path(dead_wt).write_text(_json.dumps({"pid": 999_999, "created": time.time()}))

    removed = wa.prune_stale_worktrees(tiny_repo, max_age_s=3600)  # generous age floor the old code needed

    assert str(dead_wt.resolve()) in [str(Path(p).resolve()) for p in removed]
    assert not dead_wt.exists()
    assert not wa._lock_path(dead_wt).exists()


def test_prune_stale_worktrees_keeps_worktree_with_live_pid_even_when_old(tiny_repo):
    """The flip side: a worktree whose lock names a PID that IS still running (this test process itself) is
    never removed, no matter how old its mtime looks -- the fix for a legitimately long-running concurrent
    eval that the old 'older than 1h' floor would have swept out from under itself."""
    live_wt = wa.make_worktree(tiny_repo)  # _write_worktree_lock records THIS process's own pid
    old_mtime = time.time() - 10_000
    import os

    os.utime(live_wt, (old_mtime, old_mtime))

    removed = wa.prune_stale_worktrees(tiny_repo, max_age_s=0)  # even a zero floor must not touch it

    assert str(live_wt.resolve()) not in [str(Path(p).resolve()) for p in removed]
    assert live_wt.exists()

    wa.remove_worktree(tiny_repo, live_wt)


def test_prune_stale_worktrees_falls_back_to_age_for_legacy_worktrees_with_no_lock_file(tiny_repo):
    """A worktree made before this fix shipped (or whose lock write failed) has no lock file at all --
    `prune_stale_worktrees` still falls back to the original age-only floor for exactly that case, so
    upgrading never leaves pre-existing leftovers permanently un-sweepable."""
    old_wt = wa.make_worktree(tiny_repo)
    wa._lock_path(old_wt).unlink()  # simulate "no lock" (pre-fix worktree)
    new_wt = wa.make_worktree(tiny_repo)
    wa._lock_path(new_wt).unlink()
    old_mtime = time.time() - 10_000
    import os

    os.utime(old_wt, (old_mtime, old_mtime))

    removed = wa.prune_stale_worktrees(tiny_repo, max_age_s=3600)

    assert str(old_wt.resolve()) in [str(Path(p).resolve()) for p in removed]
    assert not old_wt.exists()
    assert new_wt.exists()

    wa.remove_worktree(tiny_repo, new_wt)


def test_prune_stale_worktrees_drops_registrations_for_already_deleted_dirs(tiny_repo):
    wt = wa.make_worktree(tiny_repo)
    import shutil

    shutil.rmtree(wt)  # simulate someone rm -rf'ing the checkout by hand, registration left dangling
    assert worktree_count(tiny_repo) == 1

    wa.prune_stale_worktrees(tiny_repo, max_age_s=0)

    assert worktree_count(tiny_repo) == 0


def test_ensure_worktrees_excluded_writes_git_info_exclude_never_gitignore(tiny_repo):
    """T93 round-2 review MEDIUM fix: `.mole_ab_worktrees/` must be ignored via `.git/info/exclude` (local,
    untracked) -- never by editing the user's own tracked `.gitignore`."""
    (tiny_repo / ".gitignore").write_text("node_modules/\n")  # the user's own file, must be left alone

    wa.ensure_worktrees_excluded(tiny_repo)

    exclude_text = (tiny_repo / ".git" / "info" / "exclude").read_text()
    assert "/.mole_ab_worktrees/" in exclude_text
    assert (tiny_repo / ".gitignore").read_text() == "node_modules/\n"


def test_ensure_worktrees_excluded_is_idempotent(tiny_repo):
    wa.ensure_worktrees_excluded(tiny_repo)
    wa.ensure_worktrees_excluded(tiny_repo)
    exclude_text = (tiny_repo / ".git" / "info" / "exclude").read_text()
    assert exclude_text.count("/.mole_ab_worktrees/") == 1


def test_make_worktree_registers_git_exclude_when_worktrees_root_is_inside_repo(tiny_repo):
    """The actual call site (task.py's docker path): worktrees_root = <repo>/.mole_ab_worktrees."""
    worktrees_root = tiny_repo / ".mole_ab_worktrees"
    wt = wa.make_worktree(tiny_repo, worktrees_root=worktrees_root)

    exclude_text = (tiny_repo / ".git" / "info" / "exclude").read_text()
    assert "/.mole_ab_worktrees/" in exclude_text

    wa.remove_worktree(tiny_repo, wt)


def test_ensure_worktrees_excluded_uses_the_common_git_dir_for_a_linked_worktree(tiny_repo, tmp_path):
    """T93 round-3 review HIGH: for a repo that is itself a linked git worktree, `--git-dir` is the
    per-worktree admin dir, whose info/exclude git never reads. The entry must land where git reads it."""
    import subprocess
    linked = tmp_path / "linked"
    subprocess.run(["git", "-C", str(tiny_repo), "worktree", "add", "-q", str(linked)], check=True)
    wa.ensure_worktrees_excluded(linked)
    (linked / ".mole_ab_worktrees").mkdir()
    (linked / ".mole_ab_worktrees" / "foo.txt").write_text("x")
    st = subprocess.run(["git", "-C", str(linked), "status", "--porcelain", "--untracked-files=all"],
                        capture_output=True, text=True, check=True).stdout
    assert ".mole_ab_worktrees" not in st
