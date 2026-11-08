"""stats.wilson / newcombe_diff known values (T93 moved wilson here from mole_eval.scoring and dropped the `z *` factor on
the half-width, so every interval was ~1.96x too narrow and a 0/n interval excluded 0. Same reference values as
evals/inspect/tests/test_scoring.py, which tests the original)."""
import pytest

from dcbench_eval.stats import newcombe_diff, wilson


def test_wilson_known_values():
    lo, hi = wilson(0, 10)
    assert lo == 0 and hi == pytest.approx(0.2775, abs=1e-4)
    lo, hi = wilson(5, 10)
    assert lo == pytest.approx(0.2366, abs=1e-4) and hi == pytest.approx(0.7634, abs=1e-4)
    lo, hi = wilson(0, 16)  # the v4.2 pilot's pooled result
    assert lo == 0 and hi == pytest.approx(0.1936, abs=1e-4)


def test_newcombe_diff_matches_newcombe_1998_example():
    # Newcombe (1998) Stat Med 17:873, method 10: 56/70 - 48/80 = 0.2000, 95% CI 0.0524 to 0.3339
    d, lo, hi = newcombe_diff(56, 70, 48, 80)
    assert d == pytest.approx(0.2)
    assert lo == pytest.approx(0.0524, abs=1e-3) and hi == pytest.approx(0.3339, abs=1e-3)
