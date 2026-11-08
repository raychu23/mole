#!/usr/bin/env python3
"""Score the 3 new B2 baselines (linter, guidelines, two-sided judge) on v3's held-out 89, same methodology
as v3/results.json: Wilson 95% CI (reusing the already-verified formula from
context/product-plan/systems/metrics-proof/prelim-11-01/mc-agent-ab/v4/raw/stats.py), McNemar exact
(correctness-based, same as v3/results.md "McNemar exact" section) for each new arm vs T53.
"""
import importlib.util
import json
from pathlib import Path
from itertools import product

V3 = Path(__file__).parent.parent
STATS_PATH = V3.parent.parent / "prelim-11-01" / "mc-agent-ab" / "v4" / "raw" / "stats.py"
spec = importlib.util.spec_from_file_location("stats", STATS_PATH)
stats = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stats)
wilson = stats.wilson

CASES = {c["id"]: c for c in json.loads((V3 / "cases_with_labels_v3.json").read_text())}

# T53's own per-case predictions on the same 89, for McNemar vs T53 (reuse v3's own file).
T53_ROUTE = json.loads((V3 / "run" / "t53_semantic_route_v3_heldout_claude-haiku-4-5_k5_m0_c1.01.json").read_text())
T53_BY_ID = {r["id"]: r for r in T53_ROUTE}


def is_violate(label):
    return label == "violate"


def confusion(rows, pred_key="predictedViolate"):
    tp = fp = tn = fn = 0
    scored = 0
    for r in rows:
        if r.get("abstain"):
            continue
        pred = r[pred_key]
        if pred is None:
            continue
        actual = is_violate(r["label_final"])
        scored += 1
        if actual and pred:
            tp += 1
        elif actual and not pred:
            fn += 1
        elif not actual and pred:
            fp += 1
        else:
            tn += 1
    return tp, fp, tn, fn, scored


def metrics(rows, pred_key="predictedViolate", cost_key=None, latency_key=None):
    tp, fp, tn, fn, scored = confusion(rows, pred_key)
    n_pos = tp + fn
    n_neg = tn + fp
    recall_p, recall_lo, recall_hi = wilson(tp, n_pos) if n_pos else (None, None, None)
    prec_denom = tp + fp
    prec_p, prec_lo, prec_hi = wilson(tp, prec_denom) if prec_denom else (None, None, None)
    fa_p, fa_lo, fa_hi = wilson(fp, n_neg) if n_neg else (None, None, None)
    accuracy = (tp + tn) / scored if scored else None

    costs = []
    latencies = []
    if cost_key:
        for r in rows:
            if r.get("abstain"):
                continue
            u = r.get("usage") or {}
            c = u.get("estimated_cost_usd")
            if c is not None:
                costs.append(c)
    if latency_key:
        for r in rows:
            if r.get("abstain"):
                continue
            ms = r.get("wallMs")
            if ms is not None:
                latencies.append(ms / 1000.0)

    out = {
        "n_scored": scored, "n_total": len(rows), "n_abstain": len(rows) - scored,
        "tp": tp, "fp": fp, "tn": tn, "fn": fn,
        "recall": round(recall_p, 4) if recall_p is not None else None,
        "recall_wilson_95ci": [round(recall_lo, 4), round(recall_hi, 4)] if recall_p is not None else None,
        "precision": round(prec_p, 4) if prec_p is not None else None,
        "precision_wilson_95ci": [round(prec_lo, 4), round(prec_hi, 4)] if prec_p is not None else None,
        "false_alarm_rate": round(fa_p, 4) if fa_p is not None else None,
        "false_alarm_wilson_95ci": [round(fa_lo, 4), round(fa_hi, 4)] if fa_p is not None else None,
        "accuracy": round(accuracy, 4) if accuracy is not None else None,
    }
    if costs:
        out["mean_cost_usd"] = round(sum(costs) / len(costs), 4)
        out["total_cost_usd"] = round(sum(costs), 4)
    else:
        out["mean_cost_usd"] = 0.0
        out["total_cost_usd"] = 0.0
    if latencies:
        s = sorted(latencies)
        out["p50_latency_s"] = round(s[len(s) // 2], 3)
        out["p95_latency_s"] = round(s[min(len(s) - 1, int(len(s) * 0.95))], 3)
    return out


def correct(row, pred_key="predictedViolate"):
    if row.get("abstain") or row.get(pred_key) is None:
        return None
    return bool(row[pred_key]) == is_violate(row["label_final"])


def mcnemar_exact(b, c):
    """Exact two-sided binomial test on discordant pairs (b, c), same as v3's own McNemar computation."""
    from math import comb
    n = b + c
    if n == 0:
        return 1.0
    k = min(b, c)
    p = sum(comb(n, i) for i in range(0, k + 1)) * 2 * (0.5 ** n)
    return min(1.0, p)


def mcnemar_vs_t53(new_rows, pred_key="predictedViolate"):
    by_id = {r["id"]: r for r in new_rows}
    both_right = a_only = b_only = both_wrong = 0
    n = 0
    for cid, t53row in T53_BY_ID.items():
        if cid not in by_id:
            continue
        new_row = by_id[cid]
        t53_correct = bool(t53row["predictedViolate"]) == is_violate(t53row["label_final"])
        new_correct = correct(new_row, pred_key)
        if new_correct is None:
            continue
        n += 1
        if t53_correct and new_correct:
            both_right += 1
        elif t53_correct and not new_correct:
            a_only += 1  # T53-only-right
        elif not t53_correct and new_correct:
            b_only += 1  # new-arm-only-right
        else:
            both_wrong += 1
    p = mcnemar_exact(a_only, b_only)
    return {"n": n, "both_right": both_right, "t53_only_right": a_only, "arm_only_right": b_only,
            "both_wrong": both_wrong, "discordant": a_only + b_only, "p_exact_two_sided": round(p, 4)}


def main():
    out = {}

    linter = json.loads((Path(__file__).parent / "arm_linter_heldout_v3.json").read_text())
    # View 1: scored-only (the 33/89 cases where a rule was compiled). Honest about coverage, but
    # comparing to T53 on only this subset is confounded (T53 never abstains, so this is not a fair
    # apples-to-apples McNemar).
    out["linter_only_scored_subset"] = metrics(linter["rows"])
    out["linter_only_scored_subset"]["decision_coverage"] = linter["decision_coverage"]
    out["linter_only_scored_subset"]["case_coverage"] = linter["case_coverage"]
    out["linter_only_scored_subset"]["mcnemar_vs_t53"] = mcnemar_vs_t53(linter["rows"])
    out["linter_only_scored_subset"]["caveat"] = (
        "n=33/89: McNemar here only compares the cases the linter did NOT abstain on -- not a fair "
        "deployment comparison (see linter_abstain_as_compliant below for the n=89 view)."
    )

    # View 2: abstain-as-compliant (what a team actually experiences if the linter has no rule for a
    # decision: it simply doesn't block). Fair n=89 comparison to T53/reviewer/RAG.
    rows_v2 = []
    for r in linter["rows"]:
        r2 = dict(r)
        if r2.get("abstain"):
            r2["abstain"] = False
            r2["predictedViolate"] = False
        rows_v2.append(r2)
    out["linter_abstain_as_compliant"] = metrics(rows_v2)
    out["linter_abstain_as_compliant"]["decision_coverage"] = linter["decision_coverage"]
    out["linter_abstain_as_compliant"]["case_coverage"] = linter["case_coverage"]
    out["linter_abstain_as_compliant"]["mcnemar_vs_t53"] = mcnemar_vs_t53(rows_v2)

    for name, fname in [("guidelines", "arm_guidelines_heldout_v3.json"), ("two_sided_judge", "arm_judge_heldout_v3.json")]:
        p = Path(__file__).parent / fname
        if not p.exists():
            out[name] = {"status": "NOT RUN", "reason": f"{fname} missing"}
            continue
        rows = json.loads(p.read_text())
        if len(rows) < 89:
            out[name] = {"status": f"PARTIAL: {len(rows)}/89 cases scored so far", "n_done": len(rows)}
            continue
        m = metrics(rows, cost_key="usage", latency_key="wallMs")
        m["mcnemar_vs_t53"] = mcnemar_vs_t53(rows)
        out[name] = m
        if name == "two_sided_judge":
            rows_v2 = []
            for r in rows:
                r2 = dict(r)
                if r2.get("abstain"):
                    r2["abstain"] = False
                    r2["predictedViolate"] = False
                rows_v2.append(r2)
            jv2 = metrics(rows_v2, cost_key="usage", latency_key="wallMs")
            jv2["mcnemar_vs_t53"] = mcnemar_vs_t53(rows_v2)
            jv2["note"] = "abstain (0 routed candidates, 18/89) treated as predicted-compliant for a full n=89 view"
            out["two_sided_judge_abstain_as_compliant"] = jv2

    Path(__file__).parent.joinpath("results-v3-baselines.json").write_text(json.dumps(out, indent=1))
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
