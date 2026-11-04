"""T90 follow-up (e): reanalyze.py must also read Inspect .eval logs, not just T63's runs.jsonl. Uses the
REAL end-to-end proof log saved by the orchestrator in 4 log/ (2 real hermes runs against a tiny synthetic
repo, scored by mole_check_scorer)."""
from __future__ import annotations

from pathlib import Path

import pytest

from dcbench_eval.reanalyze import analyze_generic, load_inspect_log

PROOF_LOG = Path(__file__).resolve().parents[4] / "tasks" / "T90-ab-experiment-system" / "4 log" / "mole_ab-e2e-proof.eval"

pytestmark = pytest.mark.skipif(not PROOF_LOG.exists(), reason=f"e2e proof log not present at {PROOF_LOG}")


def test_load_inspect_log_reads_real_eval_file():
    records = load_inspect_log(PROOF_LOG)
    assert len(records) == 2
    arms = {r["arm"] for r in records}
    assert "none" in arms
    assert all(r["agent_seconds_1"] > 0 for r in records), "a real hermes call, not a mock, should take > 0s"


def test_analyze_generic_handles_the_small_proof_log_honestly():
    records = load_inspect_log(PROOF_LOG)
    result = analyze_generic(records)
    assert set(result["arms"].keys()) == {r["arm"] for r in records}
    for arm, d in result["arms"].items():
        assert d["n"] == 1
        assert d["bootstrap_ci95"] is None, "n=1 must not fabricate a bootstrap CI"
    assert result["pairwise_tests"] == {}
    assert "not enough data" in (result.get("note") or "")
