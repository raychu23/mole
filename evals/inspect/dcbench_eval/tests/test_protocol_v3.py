"""protocol-v3.json's sample size must be the ACTUAL output of sample_size_for_mde on T63's measured SDs,
not a hand-picked number (T90 follow-up: v2's n=3/arm/task was never computed this way at all)."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from dcbench_eval.reanalyze import DEFAULT_RUNS_PATH, analyze, load_runs
from dcbench_eval.spec import assert_frozen_unedited, spec_from_dict
from dcbench_eval.stats import sample_size_for_mde

EVAL_DIR = Path(__file__).resolve().parents[2]
SPEC_PATH = EVAL_DIR / "dcbench_eval" / "experiments" / "protocol-v3.json"
FROZEN_PATH = EVAL_DIR / "dcbench_eval" / "experiments" / "FROZEN-v3.sha256"


def test_protocol_v3_parses_and_validates():
    spec = spec_from_dict(json.loads(SPEC_PATH.read_text()))
    spec.validate()
    assert spec.id == "T63-productivity-v3"
    assert spec.sample_size.mde == 15.0


def test_protocol_v3_is_frozen_and_unedited():
    assert_frozen_unedited(SPEC_PATH, FROZEN_PATH)  # raises if missing or drifted


@pytest.mark.skipif(not DEFAULT_RUNS_PATH.exists(), reason=f"T63 raw data not present at {DEFAULT_RUNS_PATH}")
def test_sample_size_matches_measured_sds_not_a_guess():
    """Recompute the sd(diff) per pair from T63's own 72 runs and confirm v3's runs_per_arm_per_task=21
    is exactly sample_size_for_mde() on the PRIMARY (R-M) pair's measured sd at mde=15 -- not copied
    from v1/v2 (which used 3, uncomputed) and not hand-picked."""
    import statistics

    records = load_runs(DEFAULT_RUNS_PATH)
    result = analyze(records)
    task_pct = result["per_task_pct"]
    tasks = list(task_pct.keys())

    def sd_diff(x: str, y: str) -> float:
        diffs = [task_pct[t][x] - task_pct[t][y] for t in tasks]
        return statistics.stdev(diffs)

    spec = spec_from_dict(json.loads(SPEC_PATH.read_text()))
    mde = spec.sample_size.mde
    n_rm = sample_size_for_mde(sd_diff("R", "M"), mde)
    n_am = sample_size_for_mde(sd_diff("A", "M"), mde)
    n_ar = sample_size_for_mde(sd_diff("A", "R"), mde)
    # the PRIMARY comparison (per the hypothesis) sets the bound: the other two pairs need fewer runs,
    # so 21 (R-M's requirement) is the conservative, not understated, choice
    assert n_rm == spec.sample_size.runs_per_arm_per_task == 21
    assert n_am < n_rm and n_ar < n_rm
    # sanity: this is dramatically more than v2's uncomputed n=3
    assert spec.sample_size.runs_per_arm_per_task > 3 * 5
