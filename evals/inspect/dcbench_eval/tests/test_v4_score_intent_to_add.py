"""T97 round-1 FIX (review deleg_b40d00a6 task-1, 2026-11-04): score.mjs must stage `git add
--intent-to-add --all` before diffing so a brand-new UNTRACKED file's content is visible to dcbench's
own scorer.ts grep_diff check, exactly like evals/inspect/dcbench_eval/dcbench_score.mjs already does.

This test uses the REAL pinned dcbench decision D-001 ("must use DateRangePicker, not deprecated
CalendarRange") and its real gotcha (TASK-001's `D-001-date-range-picker`, benchmark/tasks.ts), scored
through score.mjs against the real benchmark/scorer.ts (pinned 9f507ce) -- not a fake scorer -- so the
regression is tied to the actual gotcha the review named, not a stand-in. It only ever READS the pinned
dcbench checkout under scratch/dcbench-v4/repo (never scratch/dcbench itself); it writes into a disposable
worktree under a fresh `git worktree add` of that same pinned checkout, removed in a fixture finalizer.

Skips (not a failure) if the pinned dcbench repo isn't present on this machine -- this test proves a real
regression against real benchmark data, it does not ship a synthetic substitute for it.
"""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[3]  # tests -> dcbench_eval -> inspect -> evals -> REPO
SCORE_MJS = REPO_ROOT / "context/product-plan/systems/metrics-proof/productivity/scripts/score.mjs"
DCB_REPO = Path("/Users/a1/.hermes/cache/scratch/dcbench-v4/repo")
PIN = "9f507ce"


def _node_available() -> bool:
    return shutil.which("node") is not None


pytestmark = [
    pytest.mark.skipif(not _node_available(), reason="node not on PATH"),
    pytest.mark.skipif(not DCB_REPO.exists(), reason="pinned dcbench repo (scratch/dcbench-v4/repo) not present on this machine"),
    pytest.mark.skipif(not SCORE_MJS.exists(), reason="context/ is a private, gitignored workspace dir on this machine; score.mjs not present"),
]


@pytest.fixture
def real_task_worktree(tmp_path):
    """A disposable git worktree of the PINNED dcbench checkout (never scratch/dcbench-v4/repo's own
    working copy, and never scratch/dcbench itself)."""
    wt = tmp_path / "wt"
    r = subprocess.run(["git", "-C", str(DCB_REPO), "worktree", "add", "-q", "--detach", str(wt), PIN],
                        capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    try:
        yield wt
    finally:
        subprocess.run(["git", "-C", str(DCB_REPO), "worktree", "remove", "--force", str(wt)], capture_output=True)
        shutil.rmtree(wt, ignore_errors=True)


def _score(repo, wt, task_id):
    r = subprocess.run(
        ["node", "--experimental-strip-types", "--no-warnings", str(SCORE_MJS), str(repo), str(wt), task_id],
        capture_output=True, text=True, timeout=60,
    )
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


def test_new_untracked_file_importing_calendarrange_fails_d001_gotcha(real_task_worktree):
    wt = real_task_worktree
    # A brand-new, never-`git add`-ed file that imports the deprecated CalendarRange component --
    # exactly the trap D-001's gotcha exists to catch ("CalendarRange is still imported in
    # notification-preferences.tsx -- agents will copy that pattern").
    new_file = wt / "src" / "app" / "analytics" / "export-panel.tsx"
    new_file.parent.mkdir(parents=True, exist_ok=True)
    new_file.write_text("import { CalendarRange } from '@/components/ui/calendar-range';\nexport function ExportPanel() { return <CalendarRange />; }\n")

    report = _score(DCB_REPO, wt, "TASK-001")
    d001 = next(g for g in report["gotchaResults"] if g["gotchaId"] == "D-001-date-range-picker")

    assert "src/app/analytics/export-panel.tsx" in report["diffFiles"], "intent-to-add should move the new file into diffFileList"
    assert d001["failCheckMatched"] is True, (
        "the new (untracked) file's CalendarRange import must be visible to scorer.ts's grep_diff fail "
        f"check, not silently invisible to plain `git diff`: {d001}"
    )
    assert d001["passed"] is False, f"D-001's gotcha must fail when a new file imports CalendarRange: {d001}"


def test_new_untracked_file_importing_daterangepicker_passes_d001_gotcha(real_task_worktree):
    """The flip side of the same bug (error-analysis-72.md finding #1): a CORRECT new file was also
    invisible to plain `git diff` and so lost credit it had actually earned."""
    wt = real_task_worktree
    new_file = wt / "src" / "app" / "analytics" / "export-panel.tsx"
    new_file.parent.mkdir(parents=True, exist_ok=True)
    new_file.write_text("import { DateRangePicker } from '@/components/ui/date-range-picker';\nexport function ExportPanel() { return <DateRangePicker from={null} to={null} />; }\n")

    report = _score(DCB_REPO, wt, "TASK-001")
    d001 = next(g for g in report["gotchaResults"] if g["gotchaId"] == "D-001-date-range-picker")

    assert d001["passCheckMatched"] is True, f"a new file's correct DateRangePicker import must be scored, not invisible: {d001}"
    assert d001["passed"] is True, f"D-001's gotcha must pass for a correct new file: {d001}"
