"""T107/protocol-v4.2: score-v42.mjs (NEW file, score.mjs copied + arm-setup-file exclusion) must (a)
keep the v4.1 intent-to-add fix (test_v4_score_intent_to_add.py's own regression, repeated here against
score-v42.mjs so the new file is independently proven, not just copy-pasted) and (b) exclude an arm's own
setup paths (.mole/**, CLAUDE.md) from the scored diff -- the fix for results-v41.md's post-hoc scorer
finding ("the M arm's .mole/decisions files appear as new files in the diff ... no score affected", checked
only after the fact in v4.1; built into the scorer itself in v4.2).

Same discipline as test_v4_score_intent_to_add.py: real pinned dcbench decision D-001/TASK-001, real
scorer.ts, a disposable worktree of the pinned checkout under scratch/dcbench-v4/repo. Skips (not a
failure) if the pinned repo or score-v42.mjs aren't present on this machine.
"""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[3]  # tests -> dcbench_eval -> inspect -> evals -> REPO
SCORE_V42_MJS = REPO_ROOT / "context/product-plan/systems/metrics-proof/productivity/scripts/score-v42.mjs"
DCB_REPO = Path("/Users/a1/.hermes/cache/scratch/dcbench-v4/repo")
PIN = "9f507ce"


def _node_available() -> bool:
    return shutil.which("node") is not None


pytestmark = [
    pytest.mark.skipif(not _node_available(), reason="node not on PATH"),
    pytest.mark.skipif(not DCB_REPO.exists(), reason="pinned dcbench repo (scratch/dcbench-v4/repo) not present on this machine"),
    pytest.mark.skipif(not SCORE_V42_MJS.exists(), reason="context/ is a private, gitignored workspace dir on this machine; score-v42.mjs not present"),
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
        ["node", "--experimental-strip-types", "--no-warnings", str(SCORE_V42_MJS), str(repo), str(wt), task_id],
        capture_output=True, text=True, timeout=60,
    )
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


def test_new_untracked_file_importing_calendarrange_still_fails_d001_gotcha(real_task_worktree):
    """Regression carried from v4.1 (test_v4_score_intent_to_add.py): the intent-to-add fix must still
    work in the new file, not just the one it was copied from."""
    wt = real_task_worktree
    new_file = wt / "src" / "app" / "analytics" / "export-panel.tsx"
    new_file.parent.mkdir(parents=True, exist_ok=True)
    new_file.write_text("import { CalendarRange } from '@/components/ui/calendar-range';\nexport function ExportPanel() { return <CalendarRange />; }\n")

    report = _score(DCB_REPO, wt, "TASK-001")
    d001 = next(g for g in report["gotchaResults"] if g["gotchaId"] == "D-001-date-range-picker")

    assert "src/app/analytics/export-panel.tsx" in report["diffFiles"]
    assert d001["failCheckMatched"] is True
    assert d001["passed"] is False


def test_mole_decisions_dir_excluded_from_diff_and_does_not_trip_gotcha(real_task_worktree):
    """The v4.2 addition: an arm's own .mole/decisions setup files (written into the worktree the same
    way run_dcbench_v42.py's M-block arm does via shutil.copytree) must not appear in the scored diff at
    all, and must not be able to accidentally satisfy or trip a gotcha's grep_diff check."""
    wt = real_task_worktree
    mole_dir = wt / ".mole" / "decisions"
    mole_dir.mkdir(parents=True, exist_ok=True)
    # Deliberately includes the literal fail-pattern text ("CalendarRange") in decision PROSE, the way a
    # real decision record describing the D-001 rule would -- this must NOT trip the gotcha.
    (mole_dir / "d-001.md").write_text(
        "---\nid: D-001\nrules:\n  - kind: forbid-import\n    to: '@/components/ui/calendar-range'\n---\n"
        "Use DateRangePicker, not the deprecated CalendarRange component.\n"
    )
    # A real (non-crisp) code change so the diff is non-empty and TASK-001 is genuinely scored.
    target = wt / "src" / "app" / "dashboard" / "page.tsx"
    if target.exists():
        target.write_text(target.read_text() + "\n// test edit\n")

    report = _score(DCB_REPO, wt, "TASK-001")

    assert not any(".mole" in f for f in report["diffFiles"]), f".mole/ must be excluded from diffFiles: {report['diffFiles']}"
    assert not any(".mole" in f for f in report["untracked"]), f".mole/ must be excluded from untracked: {report['untracked']}"
    assert ".mole" not in report["fullDiff"], ".mole/ content must not appear in the scored diff text at all"
    d001 = next(g for g in report["gotchaResults"] if g["gotchaId"] == "D-001-date-range-picker")
    assert d001["failCheckMatched"] is False, (
        f"the decision record's own prose (containing the literal word 'CalendarRange') must not trip "
        f"the gotcha once .mole/ is excluded from the diff: {d001}"
    )


def test_claude_md_excluded_from_diff(real_task_worktree):
    """The R arm's setup file (if it were ever written into a worktree, unlike today's run_dcbench_v42.py
    which only prepends CLAUDE.md text to the prompt) must also be excluded, applied the SAME way as
    .mole/ -- no per-arm branching in the scorer."""
    wt = real_task_worktree
    (wt / "CLAUDE.md").write_text("Project instructions mentioning CalendarRange in passing.\n")
    target = wt / "src" / "app" / "dashboard" / "page.tsx"
    if target.exists():
        target.write_text(target.read_text() + "\n// test edit\n")

    report = _score(DCB_REPO, wt, "TASK-001")

    assert "CLAUDE.md" not in report["diffFiles"]
    assert "CLAUDE.md" not in report["untracked"]
    assert "CLAUDE.md" not in report["fullDiff"]
