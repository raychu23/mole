"""Re-analyse T63's frozen dcbench productivity data (read-only) through the T90 system: the SAME published
stats (scipy/statsmodels, see stats.py) as the rest of T90, PLUS the Wilson/Newcombe intervals already built
for T17 (mole_eval.scoring), applied here to the dcbench merge-ready rate. Never mutates raw/runs.jsonl.

Usage:
  evals/inspect/dcbench_eval/reanalyze.py [--runs PATH] [--json]

Acceptance (T90 contract): this must reproduce the private productivity benchmark's results file's
numbers exactly (see tests/test_reanalyze.py) and add intervals that file did not have.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

EVAL_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(EVAL_DIR))

from dcbench_eval.stats import bootstrap_ci, clustered_se, holm_correction, newcombe_diff, paired_permutation_test  # noqa: E402

# No machine-specific path baked in here (this module ships publicly): the historical T63 raw data lives
# in a private task-history location outside this worktree, so this module carries NO default path to it
# (T93 review FAIL fix #1: the export tool used to string-rewrite a hardcoded default away, which mangled
# the literal value every caller saw; the correct fix is not shipping a private default at all). --runs is
# required unless --inspect-log is given; set MOLE_AB_RUNS_PATH to avoid retyping --runs every run.
DEFAULT_RUNS_PATH = Path(os.environ["MOLE_AB_RUNS_PATH"]) if os.environ.get("MOLE_AB_RUNS_PATH") else None
TASKS = ["TASK-001", "TASK-003", "TASK-004", "TASK-006", "TASK-008", "TASK-009", "TASK-012", "TASK-013"]
ARMS = ["A", "R", "M"]
PAIRS = [("R", "M"), ("A", "M"), ("A", "R")]


def load_runs(path: Path | str) -> list[dict[str, Any]]:
    """Read-only: opens raw/runs.jsonl for reading only, never writes to it."""
    path = Path(path)
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def load_inspect_log(path: Path | str) -> list[dict[str, Any]]:
    """T90 follow-up (e): read an Inspect `.eval` log (mole_ab or mole_regression) and normalise its
    samples into the SAME record shape analyze() expects (task/arm/score.earned/score.max/score.mergeReady/
    agent_seconds_1/tokens), so one `analyze()` works on T63's old runs.jsonl AND any mole_ab .eval log.
    Uses inspect_ai.log.read_eval_log -- the one correct way to parse `.eval` (a zip, not JSON-on-disk).
    """
    from inspect_ai.log import read_eval_log  # local import: reanalyze.py must run even without inspect_ai

    log = read_eval_log(str(path))
    out: list[dict[str, Any]] = []
    for s in log.samples or []:
        meta = s.metadata or {}
        scores = s.scores or {}
        sc = next(iter(scores.values()), None)
        score_meta = (sc.metadata or {}) if sc is not None else {}
        usage = list((s.model_usage or {}).values())
        input_tokens = sum(u.input_tokens for u in usage)
        output_tokens = sum(u.output_tokens for u in usage)
        # dcbench_scorer's Score.metadata IS the dcbench score.mjs report (earned/max/mergeReady);
        # mole_check_scorer has no earned/max concept, so "score" falls back to the scorer's own value.
        score: dict[str, Any] = {
            "earned": score_meta.get("earned"),
            "max": score_meta.get("max"),
            "percentage": score_meta.get("percentage", float(sc.value) if sc is not None and isinstance(sc.value, (int, float)) else None),
            "mergeReady": score_meta.get("mergeReady"),
        }
        out.append({
            "run_id": s.id,
            "task": meta.get("row_id") or meta.get("case") or str(s.id).rsplit("-", 1)[0],
            "arm": meta.get("arm"),
            "agent_seconds_1": meta.get("agent_seconds", 0.0),
            "tokens": {"input_tokens": input_tokens, "output_tokens": output_tokens},
            "score": score,
            "status": "ok" if sc is not None and not s.error else "agent_error",
        })
    return out


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


def analyze_generic(records: list[dict[str, Any]]) -> dict[str, Any]:
    """T90 follow-up (e): the same stats as analyze(), but for an ARBITRARY arm/task set (any mole_ab
    .eval log), not T63's hardcoded 3-arm/8-task shape. Skips merge-ready (dcbench-only) and permutation
    tests when fewer than 2 arms or any arm/task cell is empty (an Inspect log of a quick 1-2 sample smoke
    run, like the e2e proof in 4 log/, has no statistical power -- this still reports means/CIs honestly,
    it just can't run a permutation test on n=1)."""
    arms_present = sorted({r["arm"] for r in records if r.get("arm") is not None})
    tasks_present = sorted({r["task"] for r in records})
    task_pct: dict[str, dict[str, float]] = {t: {} for t in tasks_present}
    arms: dict[str, Any] = {}
    for arm in arms_present:
        rs = [r for r in records if r["arm"] == arm]
        n = len(rs)
        pcts_by_task: dict[str, list[float]] = {}
        for r in rs:
            pct = (r.get("score") or {}).get("percentage")
            if pct is not None:
                pcts_by_task.setdefault(r["task"], []).append(pct)
        per_task_means = []
        for t in tasks_present:
            vals = pcts_by_task.get(t, [])
            mean_pct = sum(vals) / len(vals) if vals else None
            if mean_pct is not None:
                task_pct[t][arm] = mean_pct
                per_task_means.append(mean_pct)
        secs = [r.get("agent_seconds_1", 0.0) for r in rs]
        tok = [r.get("tokens", {}) for r in rs]
        entry: dict[str, Any] = {
            "n": n,
            "mean_agent_seconds": sum(secs) / len(secs) if secs else 0.0,
            "total_tokens": sum((t.get("input_tokens") or 0) + (t.get("output_tokens") or 0) for t in tok),
        }
        if len(per_task_means) >= 2:
            boot = bootstrap_ci(per_task_means)
            entry["mean_task_pct"] = boot["mean"]
            entry["bootstrap_ci95"] = [boot["lo"], boot["hi"]]
        elif per_task_means:
            entry["mean_task_pct"] = per_task_means[0]
            entry["bootstrap_ci95"] = None  # not enough samples for a bootstrap CI; say so, don't fabricate one
        arms[arm] = entry

    pairwise_tests: dict[str, Any] = {}
    common_tasks = [t for t in tasks_present if len(task_pct[t]) == len(arms_present)]
    if len(arms_present) >= 2 and len(common_tasks) >= 2:
        raw_p = {}
        for i, x_arm in enumerate(arms_present):
            for y_arm in arms_present[i + 1 :]:
                xs = [task_pct[t][x_arm] for t in common_tasks]
                ys = [task_pct[t][y_arm] for t in common_tasks]
                res = paired_permutation_test(xs, ys)
                key = f"{x_arm}-{y_arm}"
                pairwise_tests[key] = res
                raw_p[key] = res["p"]
        if raw_p:
            adj = holm_correction([raw_p[k] for k in pairwise_tests])
            for key, p_adj in zip(pairwise_tests, adj):
                pairwise_tests[key]["p_holm"] = p_adj
    return {"arms": arms, "per_task_pct": task_pct, "pairwise_tests": pairwise_tests,
            "note": None if len(common_tasks) >= 2 else "fewer than 2 tasks with every arm scored: no permutation test run (not enough data, not a null result)"}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--runs", default=str(DEFAULT_RUNS_PATH) if DEFAULT_RUNS_PATH else None,
                     help="path to a runs.jsonl (shaped like T63's); required unless $MOLE_AB_RUNS_PATH is set or --inspect-log is given -- this module ships publicly with no baked-in path to any private data")
    ap.add_argument("--inspect-log", default=None, help="an Inspect .eval log (mole_ab or mole_regression) instead of --runs; uses analyze_generic, not T63's hardcoded A/R/M shape")
    ap.add_argument("--json", action="store_true", help="print the full result as JSON (default: a short table)")
    a = ap.parse_args()
    if not a.inspect_log and not a.runs:
        ap.error("--runs PATH (or $MOLE_AB_RUNS_PATH) is required when --inspect-log is not given")
    if a.inspect_log:
        records = load_inspect_log(a.inspect_log)
        result = analyze_generic(records)
        if a.json:
            print(json.dumps(result, indent=1))
            return 0
        print(f"{len(records)} samples read from Inspect log {a.inspect_log}\n")
        print("arm                 n   mean agent s   tokens   mean task %   bootstrap 95% CI")
        for arm, d in result["arms"].items():
            ci = f"{d['bootstrap_ci95'][0]:.1f} to {d['bootstrap_ci95'][1]:.1f}" if d.get("bootstrap_ci95") else "n/a (n<2)"
            pct = d.get("mean_task_pct")
            pct_s = f"{pct:5.1f}" if pct is not None else "  n/a"
            print(f"{arm:<20} {d['n']:<3} {d['mean_agent_seconds']:9.1f}      {d['total_tokens']:<8} {pct_s}         {ci}")
        if result["pairwise_tests"]:
            print("\npaired permutation + Holm correction:")
            for key, t in result["pairwise_tests"].items():
                print(f"  {key}  mean diff {t['mean_diff']:+.1f}  p={t['p']:.3f}  p(Holm)={t.get('p_holm', float('nan')):.3f}")
        elif result.get("note"):
            print(f"\n{result['note']}")
        return 0
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
