"""Scorers for `mole_ab` (T90 follow-up). Two real, runnable scorers:

  mole_check_scorer    generic decision-compliance scorer for ANY repo that has `.mole/decisions/`: runs
                        `mole check --worktree --json --root <worktree>` (packages/daemon/src/cli.ts,
                        unchanged) after the agent's run and scores on the facts Mole itself already
                        computes -- the number of outstanding questions `mole check` raises about the
                        change (0 = nothing flagged; the mean() metric reports the average across a run).
  dcbench_scorer        wraps dcbench's OWN scorer (benchmark/scorer.ts via score.mjs, same subprocess
                        contract as context/product-plan/systems/metrics-proof/productivity/scripts/
                        run_dcbench.py's score()) so dcbench can be plugged into mole_ab as one dataset
                        among others, not a special case.
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

from inspect_ai.scorer import Score, Target, mean, scorer, stderr
from inspect_ai.solver import TaskState

from .worktree_agent import remove_worktree


def _mole_bin(explicit: str | None) -> list[str]:
    if explicit:
        return ["node", explicit] if explicit.endswith(".js") else [explicit]
    return ["mole"]  # on PATH (npm i -g mole-code, or `npm link` in packages/daemon)


@scorer(metrics=[mean(), stderr()])
def mole_check_scorer(mole_bin: str | None = None, root: str | None = None):
    """root: --root to pass to `mole check` (defaults to the worktree itself, i.e. the repo IS the root)."""

    async def score(state: TaskState, target: Target) -> Score:
        wt = state.metadata.get("worktree")
        if not wt:
            return Score(value=-1, answer="error", explanation="no worktree in sample metadata; solver did not run")
        wt_path = Path(wt)
        try:
            cmd = [*_mole_bin(mole_bin), "check", "--worktree", "--json", "--root", str(root or wt_path)]
            r = subprocess.run(cmd, cwd=wt_path, capture_output=True, text=True, timeout=120)
            if r.returncode not in (0, 1):  # mole check exits 1 on nothing-to-check, still valid JSON
                return Score(value=-1, answer="error", explanation=f"mole check exit {r.returncode}: {r.stderr[-1000:]}")
            try:
                report = json.loads(r.stdout)
            except Exception as e:  # noqa: BLE001
                return Score(value=-1, answer="error", explanation=f"mole check did not print JSON: {e}; stdout: {r.stdout[-500:]}")
            questions = report.get("questions", [])
            return Score(
                value=float(len(questions)),
                answer=f"{len(questions)} question(s)",
                explanation=json.dumps({"questions": questions[:5], "hunks": len(report.get("hunks", []))})[:2000],
                metadata={"diff_chars": len(state.metadata.get("diff", "")), "agent_rc": state.metadata.get("agent_rc")},
            )
        finally:
            # the worktree's diff is already in state.metadata["diff"] (Inspect persists it in the .eval
            # log), so it's safe to remove the throwaway checkout now that scoring is done
            repo_root = state.metadata.get("repo")
            if repo_root:
                remove_worktree(Path(repo_root), wt_path)

    return score


@scorer(metrics=[mean(), stderr()])
def dcbench_scorer(dcbench_repo: str, task_key: str = "task_id"):
    """dcbench_repo: the dcbench checkout score.mjs needs for benchmark/scorer.ts + benchmark/tasks.ts.
    task_key: the sample.metadata key holding the dcbench TASK-xxx id."""
    score_mjs = Path(__file__).resolve().parents[0] / "dcbench_score.mjs"

    async def score(state: TaskState, target: Target) -> Score:
        wt = state.metadata.get("worktree")
        task_id = state.metadata.get(task_key)
        if not wt or not task_id:
            return Score(value=-1, answer="error", explanation="missing worktree or task id in sample metadata")
        try:
            r = subprocess.run(
                ["node", "--experimental-strip-types", "--no-warnings", str(score_mjs), dcbench_repo, wt, task_id],
                capture_output=True, text=True, timeout=120,
            )
            if r.returncode != 0:
                return Score(value=-1, answer="error", explanation=f"score.mjs exit {r.returncode}: {r.stderr[-1000:]}")
            report = json.loads(r.stdout)
            return Score(
                value=float(report.get("percentage", 0.0)),
                answer="merge-ready" if report.get("mergeReady") else "not merge-ready",
                explanation=json.dumps({k: report[k] for k in ("earned", "max", "mergeReady", "blockingViolations") if k in report}),
                metadata=report,
            )
        finally:
            repo_root = state.metadata.get("repo")
            if repo_root:
                remove_worktree(Path(repo_root), Path(wt))

    return score
