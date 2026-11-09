#!/usr/bin/env python3
"""T110 v2 review-fix (2026-11-08): recompute scored_v2.json's t46_cascade metrics (and the T53-vs-T46-
cascade McNemar pair reported in results-v2.md) after run_t46_cascade_v2.mjs's checkStep() file-scope fix.
Only t46_cascade's numbers change here; t53/reviewer/rag are untouched (their own arms/scripts were not
part of this defect -- same inputs, same code, not re-run)."""
import json
import sys
from pathlib import Path
from scipy.stats import binomtest

sys.path.insert(0, "/Users/a1/Desktop/CS Code/Project/Mole/evals/inspect/dcbench_eval")
from stats import wilson  # noqa: E402

HERE = Path(__file__).parent
POS_IDS = ["h2v2-bs-18540-prefix", "h2v2-bs-20007-prefix", "h2v2-bs-17875-prefix", "h2v2-bs-6882-prefix"]
NEG_IDS = ["h2v2-bs-18540-fixed", "h2v2-bs-20007-fixed", "h2v2-bs-17875-fixed", "h2v2-bs-6882-fixed",
           "h2v2-bs-23449-neg", "h2v2-bs-28578-neg", "h2v2-bs-6993-neg"]

t46 = {r["id"]: r for r in json.loads((HERE / "arm_t46_cascade_v2.json").read_text())["rows"]}
t53 = {r["id"]: r for r in json.loads((HERE / "arm_t53_v2.json").read_text())}

tp = sum(1 for i in POS_IDS if t46[i]["predictedViolate"])
fn = len(POS_IDS) - tp
fp = sum(1 for i in NEG_IDS if t46[i]["predictedViolate"])
tn = len(NEG_IDS) - fp
recall = tp / len(POS_IDS)
fa = fp / len(NEG_IDS)
recall_ci = wilson(tp, len(POS_IDS))
fa_ci = wilson(fp, len(NEG_IDS))
print(f"t46_cascade: tp={tp} fn={fn} fp={fp} tn={tn} recall={recall:.3f} {recall_ci} fa={fa:.3f} {fa_ci}")

scored = json.loads((HERE / "scored_v2.json").read_text())
scored["metrics"]["t46_cascade"] = {
    "tp": tp, "fn": fn, "fp": fp, "tn": tn,
    "recall": recall, "recall_ci": list(recall_ci),
    "fa": fa, "fa_ci": list(fa_ci),
}
(HERE / "scored_v2.json").write_text(json.dumps(scored, indent=1))
print("updated scored_v2.json's t46_cascade block")

# T53 vs T46 cascade McNemar (exact binomial on discordant pairs), same convention the rest of results-v2.md used
all_ids = POS_IDS + NEG_IDS


def correct(pred_row, label):
    return bool(pred_row["predictedViolate"]) == (label == "violate")


b10 = b01 = 0  # b10: T53 right, T46 cascade wrong; b01: T46 cascade right, T53 wrong
for i in all_ids:
    label = t46[i]["label_final"]
    c53 = correct(t53[i], label)
    c46 = correct(t46[i], label)
    if c53 and not c46:
        b10 += 1
    elif c46 and not c53:
        b01 += 1
n_discordant = b10 + b01
p = binomtest(min(b10, b01), n_discordant, 0.5).pvalue if n_discordant else float("nan")
print(f"T53 vs T46 cascade (POST-FIX): b10={b10} b01={b01} n_discordant={n_discordant} p={p:.4f}")
