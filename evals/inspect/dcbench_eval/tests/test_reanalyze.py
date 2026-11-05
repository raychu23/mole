"""Red-first: re-analysing T63's frozen raw/runs.jsonl (read-only) must reproduce results-72.md's numbers
exactly, and add confidence intervals results-72.md did not have.

Expected numbers are copied verbatim from
context/product-plan/systems/metrics-proof/productivity/results-72.md (not recomputed by hand): 72 rows,
8 tasks x 3 arms x 3 epochs. This test never writes to raw/runs.jsonl (read-only; see dcbench_eval.reanalyze
.load_runs, which only opens it for reading).

This test file (unlike reanalyze.py itself) is private-only -- excluded from the public export by
scripts/export-public.mjs -- so it is free to name the private data's conventional on-disk location
directly, rather than requiring $MOLE_AB_RUNS_PATH to be set (reanalyze.py itself ships with no such
default; see its own T93 review-FAIL fix comment).
"""
from __future__ import annotations

import os
from pathlib import Path

import pytest

from dcbench_eval.reanalyze import analyze, load_runs

RUNS_PATH = Path(os.environ.get(
    "MOLE_AB_RUNS_PATH",
    "context/product-plan/systems/metrics-proof/productivity/raw/runs.jsonl",
))
pytestmark = pytest.mark.skipif(not RUNS_PATH.exists(), reason=f"T63 raw data not present at {RUNS_PATH}")


@pytest.fixture(scope="module")
def result():
    records = load_runs(RUNS_PATH)
    assert len(records) == 72, "T63 is 72 pre-registered runs; the analysis must not drop or add rows"
    return analyze(records)


def test_points_percentage_matches_results_72(result):
    # results-72.md: A 39/123 31.7% · R 34/123 27.6% · M 29/123 23.6% (intention-to-treat: the one agent_error
    # run scores 0, stays in)
    arms = result["arms"]
    assert arms["A"]["earned"] == 39 and arms["A"]["max"] == 123
    assert arms["R"]["earned"] == 34 and arms["R"]["max"] == 123
    assert arms["M"]["earned"] == 29 and arms["M"]["max"] == 123
    assert round(arms["A"]["percentage"], 1) == 31.7
    assert round(arms["R"]["percentage"], 1) == 27.6
    assert round(arms["M"]["percentage"], 1) == 23.6


def test_merge_ready_counts_match_results_72(result):
    arms = result["arms"]
    assert arms["A"]["merge_ready"] == 4 and arms["A"]["n"] == 24
    assert arms["R"]["merge_ready"] == 5 and arms["R"]["n"] == 24
    assert arms["M"]["merge_ready"] == 3 and arms["M"]["n"] == 24


def test_mean_agent_seconds_matches_results_72(result):
    arms = result["arms"]
    assert round(arms["A"]["mean_agent_seconds"]) == 346
    assert round(arms["R"]["mean_agent_seconds"]) == 298
    assert round(arms["M"]["mean_agent_seconds"]) == 271


def test_tokens_match_results_72(result):
    # results-72.md: A 46.9M (24 runs) · R 40.3M (24) · M 36.2M (23; the error run has none)
    arms = result["arms"]
    assert round(arms["A"]["total_tokens"] / 1e6, 1) == 46.9
    assert round(arms["R"]["total_tokens"] / 1e6, 1) == 40.3
    assert round(arms["M"]["total_tokens"] / 1e6, 1) == 36.2
    assert arms["M"]["tokened_runs"] == 23


def test_per_task_percentages_match_results_72(result):
    by_task = result["per_task_pct"]
    assert round(by_task["TASK-001"]["A"], 1) == 55.6
    assert round(by_task["TASK-001"]["R"], 1) == 72.2
    assert round(by_task["TASK-001"]["M"], 1) == 16.7
    assert by_task["TASK-012"]["A"] == by_task["TASK-012"]["R"] == by_task["TASK-012"]["M"] == 100.0
    assert by_task["TASK-008"]["A"] == by_task["TASK-008"]["R"] == by_task["TASK-008"]["M"] == 0.0


def test_paired_permutation_reproduces_results_72(result):
    # results-72.md "tests": R-M +2.4 p=1.0 · A-M +7.8 p=0.375 · A-R +5.4 p=0.5 (paired, exact 2^8 sign flips,
    # task means)
    tests = result["pairwise_tests"]
    rm, am, ar = tests["R-M"], tests["A-M"], tests["A-R"]
    assert round(rm["mean_diff"], 1) == 2.4 and rm["p"] == 1.0 and rm["exact"] is True
    assert round(am["mean_diff"], 1) == 7.8 and am["p"] == 0.375 and am["exact"] is True
    assert round(ar["mean_diff"], 1) == 5.4 and ar["p"] == 0.5 and ar["exact"] is True


def test_adds_intervals_results_72_did_not_have(result):
    """This is the part results-72.md is missing: a CI beside every %, never hand-rolled (scipy/statsmodels)."""
    arms = result["arms"]
    for arm in ("A", "R", "M"):
        lo, hi = arms[arm]["bootstrap_ci95"]
        assert lo <= arms[arm]["mean_task_pct"] <= hi
        assert arms[arm]["clustered_se"] >= 0.0
    tests = result["pairwise_tests"]
    for pair in ("R-M", "A-M", "A-R"):
        d = tests[pair]
        assert d["p_holm"] >= d["p"]  # Holm step-down only ever raises (or keeps) p
    mr = result["merge_ready_diffs"]
    for pair in ("A-M", "R-M", "A-R"):
        d, lo, hi = mr[pair]["d"], *mr[pair]["ci95"]
        assert lo <= d <= hi
