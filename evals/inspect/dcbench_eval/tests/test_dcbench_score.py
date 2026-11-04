"""Red-first (T90 follow-up, NEW EVIDENCE from the orchestrator 2026-11-04): dcbench_score.mjs must see
new (untracked) file content, not just modified-tracked-file content (error-analysis-72.md: 60/111, 54%,
of T63's failed gotchas were plain `git diff`'s blindness to untracked files). This test builds a tiny
FAKE dcbench-shaped repo (never a real, live dcbench benchmark checkout, which this task must only ever
read) so it can run dcbench_score.mjs end to end without touching it.
"""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parents[1]
SCORE_MJS = HERE / "dcbench_score.mjs"

FAKE_SCORER_TS = """\
function globToRegex(pattern) {
  const esc = pattern.replace(/[.+^${}()|[\\]\\\\]/g, '\\\\$&').replace(/\\*\\*/g, '.*').replace(/\\*/g, '[^/]*');
  return new RegExp('^' + esc + '$');
}
export function scoreTask(task, context) {
  return task.gotchas.map((g) => {
    const regex = new RegExp(g.pattern, 'm');
    const lines = context.diff.split('\\n');
    return { id: g.id, passed: lines.some((l) => regex.test(l)), weight: g.weight };
  });
}
"""

FAKE_TASKS_TS = """\
export const BENCHMARK_TASKS = [
  { taskId: 'FAKE-001', maxScore: 1, expectedFiles: ['new_file.txt'],
    gotchas: [{ id: 'g1', pattern: '^\\\\+decision-compliant', weight: 1 }] },
];
"""


@pytest.fixture
def fake_dcbench_repo(tmp_path):
    repo = tmp_path / "fake_dcbench_repo"
    (repo / "benchmark").mkdir(parents=True)
    (repo / "benchmark" / "scorer.ts").write_text(FAKE_SCORER_TS)
    (repo / "benchmark" / "tasks.ts").write_text(FAKE_TASKS_TS)
    return repo


@pytest.fixture
def tiny_worktree(tmp_path):
    wt = tmp_path / "wt"
    wt.mkdir()
    subprocess.run(["git", "init", "-q"], cwd=wt, check=True)
    subprocess.run(["git", "config", "user.email", "t@example.com"], cwd=wt, check=True)
    subprocess.run(["git", "config", "user.name", "t"], cwd=wt, check=True)
    (wt / "README.md").write_text("base\n")
    subprocess.run(["git", "add", "README.md"], cwd=wt, check=True)
    subprocess.run(["git", "commit", "-q", "-m", "init"], cwd=wt, check=True)
    return wt


def _node_available() -> bool:
    return shutil.which("node") is not None


pytestmark = pytest.mark.skipif(not _node_available(), reason="node not on PATH")


def test_new_untracked_file_content_is_scored(fake_dcbench_repo, tiny_worktree):
    # the gotcha's evidence lives ONLY inside a brand-new, never-`git add`-ed file
    (tiny_worktree / "new_file.txt").write_text("decision-compliant line\n")
    r = subprocess.run(
        ["node", "--experimental-strip-types", "--no-warnings", str(SCORE_MJS), str(fake_dcbench_repo), str(tiny_worktree), "FAKE-001"],
        capture_output=True, text=True, timeout=30,
    )
    assert r.returncode == 0, r.stderr
    report = json.loads(r.stdout)
    assert report["earned"] == 1, f"new-file gotcha should pass once untracked content is diffed: {report}"
    assert report["mergeReady"] is True
    assert "new_file.txt" in report["diffFiles"], "intent-to-add should move the new file into diffFileList"
    assert "decision-compliant line" in report["fullDiff"], "the full diff (saved to the log) must contain new-file content"
