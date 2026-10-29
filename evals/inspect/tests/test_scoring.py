"""Pure-Python scorer logic (no inspect_ai import): guard classification, intervals, per-arm summary, model reachability."""
import pytest

from mole_eval.scoring import (
    IncompleteRun,
    ModelUnreachable,
    assert_model_reached,
    classify_guard,
    newcombe_diff,
    summarize,
    wilson,
)

PASS = {"numTotalTests": 1, "numPassedTests": 1, "numFailedTests": 0, "success": True}
FAIL = {"numTotalTests": 1, "numPassedTests": 0, "numFailedTests": 1, "success": False}
NONE_RAN = {"numTotalTests": 0, "numPassedTests": 0, "numFailedTests": 0, "success": False}


def test_classify_guard():
    assert classify_guard(0, 0, PASS) == "kept"
    assert classify_guard(0, 1, FAIL) == "regressed"
    assert classify_guard(2, 1, None) == "build_broken"
    assert classify_guard(0, 1, None) == "guard_unrunnable"
    assert classify_guard(0, 1, NONE_RAN) == "guard_unrunnable"
    # a zero exit with a failed test in the report is not "kept"
    assert classify_guard(0, 0, FAIL) == "regressed"


def test_wilson_known_values():
    lo, hi = wilson(0, 10)
    assert lo == 0 and hi == pytest.approx(0.2775, abs=1e-4)
    lo, hi = wilson(5, 10)
    assert lo == pytest.approx(0.2366, abs=1e-4) and hi == pytest.approx(0.7634, abs=1e-4)
    with pytest.raises(ValueError):
        wilson(0, 0)


def test_newcombe_diff_matches_newcombe_1998_example():
    # Newcombe (1998) Stat Med 17:873, method 10: 56/70 - 48/80 = 0.2000, 95% CI 0.0524 to 0.3339
    d, lo, hi = newcombe_diff(56, 70, 48, 80)
    assert d == pytest.approx(0.2)
    assert lo == pytest.approx(0.0524, abs=1e-4) and hi == pytest.approx(0.3339, abs=1e-4)


def rec(arm, label, sid, tokens=1000, seconds=10.0, error=None):
    return {"id": sid, "arm": arm, "case": "B3-review", "epoch": 1, "label": label, "error": error,
            "input_tokens": tokens - 100, "output_tokens": 100, "total_tokens": tokens, "seconds": seconds}


def test_summarize_per_arm_rate_interval_tokens_time():
    recs = [rec("none", "regressed", "a"), rec("none", "kept", "b", 3000, 30.0),
            rec("mole", "kept", "c"), rec("mole", "build_broken", "d")]
    s = summarize(recs)
    none, mole = s["arms"]["none"], s["arms"]["mole"]
    assert none["n"] == 2 and none["regressions"] == 1 and none["rate"] == 0.5
    assert none["ci95"] == list(wilson(1, 2))
    assert none["tokens_mean"] == 2000 and none["seconds_mean"] == 20.0
    assert mole["regressions"] == 1 and mole["counts"]["build_broken"] == 1
    assert s["diff_none_minus_mole"]["d"] == 0.0


def test_summarize_refuses_a_partial_run():
    recs = [rec("none", "kept", "a"), rec("mole", None, "b", error="RuntimeError: could not reach the model")]
    with pytest.raises(IncompleteRun) as e:
        summarize(recs)
    assert "b" in str(e.value)
    with pytest.raises(IncompleteRun):
        summarize([])


def test_model_unreachable_is_a_clear_error():
    assert_model_reached(3)
    with pytest.raises(ModelUnreachable) as e:
        assert_model_reached(0, "ECONNREFUSED localhost:3001")
    assert "could not reach the model" in str(e.value) and "ECONNREFUSED" in str(e.value)
