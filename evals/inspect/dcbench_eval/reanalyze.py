"""Re-analyse T63's frozen dcbench productivity data (read-only) through the T90 system: the SAME published
stats (scipy/statsmodels, see stats.py) as the rest of T90, PLUS the Wilson/Newcombe intervals already built
for T17 (mole_eval.scoring), applied here to the dcbench merge-ready rate. Never mutates raw/runs.jsonl.

Usage:
  evals/inspect/dcbench_eval/reanalyze.py [--runs PATH] [--json]

Acceptance (T90 contract): this must reproduce context/product-plan/systems/metrics-proof/productivity/
results-72.md's numbers exactly (see tests/test_reanalyze.py) and add intervals that file did not have.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

EVAL_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(EVAL_DIR))

from dcbench_eval.stats import bootstrap_ci, clustered_se, holm_correction, paired_permutation_test  # noqa: E402
from mole_eval.scoring import newcombe_diff  # noqa: E402

# T63's own raw data lives in the MAIN repo working tree (context/ is gitignored, so it is not checked out in
# this worktree; see tasks/T90-ab-experiment-system/4 log/prior-art.md). Read-only: this module never writes here.
DEFAULT_RUNS_PATH = Path(
    "/Users/a1/Desktop/CS Code/Project/Mole/context/product-plan/systems/metrics-proof/productivity/raw/runs.jsonl"
)
TASKS = ["TASK-001", "TASK-003", "TASK-004", "TASK-006", "TASK-008", "TASK-009", "TASK-012", "TASK-013"]
ARMS = ["A", "R", "M"]
PAIRS = [("R", "M"), ("A", "M"), ("A", "R")]


def load_runs(path: Path | str) -> list[dict[str, Any]]:
    """Read-only: opens raw/runs.jsonl for reading only, never writes to it."""
    path = Path(path)
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def _task_max(records: list[dict[str, Any]]) -> dict[str, int]:
    out: dict[str, int] = {}
    for r in records:
        s = r.get("score") or {}
        if "max" in s and r["task"] not in out:
            out[r["task"]] = s["max"]
    return out


def analyze(records: list[dict[str, Any]]) -> dict[str, Any]:
    task_max = _task_max(records)
    by_arm: dict[str, list[dict[str, Any]]] = {arm: [r for r in records if r["arm"] == arm] for arm in ARMS}

    arms: dict[str, Any] = {}
    task_pct: dict[str, dict[str, float]] = {t: {} for t in TASKS}
    for arm in ARMS:
        rs = by_arm[arm]
        n = len(rs)
        earned = sum((r.get("score") or {}).get("earned", 0) for r in rs)
        # intention-to-treat: a run with no score (agent_error) counts its task's max with 0 earned
        itt_max = sum(task_max[r["task"]] if "score" not in r or r["score"] is None or "max" not in r["score"]
                      else r["score"]["max"] for r in rs)
        merge_ready = sum(1 for r in rs if (r.get("score") or {}).get("mergeReady"))
        secs = [r.get("agent_seconds_1", 0.0) + (r.get("agent_seconds_2") or 0.0) for r in rs]
        tok_vals = []
        for r in rs:
            t = r.get("tokens") or {}
            it, ot = t.get("input_tokens"), t.get("output_tokens")
            if it is not None and ot is not None:
                tok_vals.append(it + ot)

        per_task_means = []
        for t in TASKS:
            task_runs = [r for r in rs if r["task"] == t]
            pcts = [(r.get("score") or {}).get("percentage", 0.0) for r in task_runs]
            mean_pct = sum(pcts) / len(pcts) if pcts else 0.0
            task_pct[t][arm] = mean_pct
            per_task_means.append(mean_pct)

        boot = bootstrap_ci(per_task_means)
        arms[arm] = {
            "n": n,
            "earned": earned,
            "max": itt_max,
            "percentage": (earned / itt_max * 100) if itt_max else 0.0,
            "merge_ready": merge_ready,
            "mean_agent_seconds": sum(secs) / len(secs) if secs else 0.0,
            "total_tokens": sum(tok_vals),
            "tokened_runs": len(tok_vals),
            "mean_task_pct": boot["mean"],
            "bootstrap_ci95": [boot["lo"], boot["hi"]],
            "clustered_se": clustered_se(
                [(r.get("score") or {}).get("percentage", 0.0) for r in rs],
                [r["task"] for r in rs],
            ),
        }

    raw_p = {}
    pairwise_tests: dict[str, Any] = {}
    for x_arm, y_arm in PAIRS:
        xs = [task_pct[t][x_arm] for t in TASKS]
        ys = [task_pct[t][y_arm] for t in TASKS]
        res = paired_permutation_test(xs, ys)
        key = f"{x_arm}-{y_arm}"
        pairwise_tests[key] = res
        raw_p[key] = res["p"]
    adj = holm_correction([raw_p[k] for k in pairwise_tests])
    for key, p_adj in zip(pairwise_tests, adj):
        pairwise_tests[key]["p_holm"] = p_adj

    merge_ready_diffs = {}
    for x_arm, y_arm in PAIRS:
        a, b = arms[x_arm], arms[y_arm]
        d, lo, hi = newcombe_diff(a["merge_ready"], a["n"], b["merge_ready"], b["n"])
        merge_ready_diffs[f"{x_arm}-{y_arm}"] = {"d": d, "ci95": [lo, hi]}

    return {
        "arms": arms,
        "per_task_pct": task_pct,
        "pairwise_tests": pairwise_tests,
        "merge_ready_diffs": merge_ready_diffs,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--runs", default=str(DEFAULT_RUNS_PATH))
    ap.add_argument("--json", action="store_true", help="print the full result as JSON (default: a short table)")
    a = ap.parse_args()
    records = load_runs(a.runs)
    result = analyze(records)
    if a.json:
        print(json.dumps(result, indent=1))
        return 0
    print(f"{len(records)} runs read (read-only) from {a.runs}\n")
    print("arm   earned/max   %      merge-ready   mean agent s   tokens (M)   bootstrap 95% CI (task %)   clustered SE")
    for arm, d in result["arms"].items():
        lo, hi = d["bootstrap_ci95"]
        print(f"{arm:<5} {d['earned']}/{d['max']:<9} {d['percentage']:5.1f}  {d['merge_ready']}/{d['n']:<10} "
              f"{d['mean_agent_seconds']:9.1f}      {d['total_tokens'] / 1e6:6.2f}       {lo:5.1f} to {hi:5.1f}      {d['clustered_se']:5.2f}")
    print("\npaired permutation (task means, exact 2^8 sign flips) + Holm correction:")
    for key, t in result["pairwise_tests"].items():
        print(f"  {key}  mean diff {t['mean_diff']:+.1f}  p={t['p']:.3f}  p(Holm)={t['p_holm']:.3f}")
    print("\nmerge-ready rate difference (Newcombe 95% CI):")
    for key, d in result["merge_ready_diffs"].items():
        print(f"  {key}  d={d['d']:+.3f}  95% CI [{d['ci95'][0]:.3f}, {d['ci95'][1]:.3f}]")
    return 0


if __name__ == "__main__":
    sys.exit(main())
