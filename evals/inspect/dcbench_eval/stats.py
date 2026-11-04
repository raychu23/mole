"""Statistics for the A/B experiment system (T90), built on PUBLISHED implementations, not hand-rolled:

  - paired_permutation_test: scipy.stats.permutation_test, permutation_type="samples" (exact sign-flip
    enumeration when n_resamples=np.inf and n is small, the same method T63's protocol.md used by hand:
    "exact 2^8 sign flips, task means"). https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.permutation_test.html
  - bootstrap_ci: scipy.stats.bootstrap (percentile method). https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.bootstrap.html
  - holm_correction: statsmodels.stats.multitest.multipletests(method="holm") (Holm 1979 step-down),
    the same family GrowthBook/Statsig apply across metrics/variants. https://www.statsmodels.org/stable/generated/statsmodels.stats.multitest.multipletests.html
  - clustered_se: Anthropic, "A statistical approach to model evaluations" / arXiv 2411.00640 (Miller
    2024), Eq. 4 and Eq. 8 (cluster on the unit of randomization -- here, task). No published Python
    package implements this exact paired-and-clustered combination, so the formula is computed directly
    from the paper (cited above each function), not invented.
  - sample_size_for_mde: statsmodels.stats.power.TTestPower (paired/one-sample form), the standard
    power-analysis tool statsmodels ships; https://www.statsmodels.org/stable/generated/statsmodels.stats.power.TTestPower.html
"""
from __future__ import annotations

from typing import Sequence

import numpy as np
from scipy.stats import bootstrap, permutation_test
from statsmodels.stats.multitest import multipletests
from statsmodels.stats.power import TTestPower

EXACT_ENUMERATION_CAP = 20  # 2^20 ~= 1e6 sign flips; above this scipy falls back to random resampling.


def paired_permutation_test(x: Sequence[float], y: Sequence[float], n_resamples: int | float | None = None) -> dict:
    """Two-sided paired permutation test on x - y (per-unit, e.g. per-task, paired values).

    Exact (all 2^n sign flips) when len(x) <= EXACT_ENUMERATION_CAP and n_resamples is left default;
    otherwise scipy samples n_resamples sign flips (seeded via scipy's own rng for determinism upstream).
    """
    xa, ya = np.asarray(x, dtype=float), np.asarray(y, dtype=float)
    n = len(xa)
    if n == 0:
        raise ValueError("paired_permutation_test: x/y must be non-empty")

    def stat(a, b, axis=0):
        return np.mean(a - b, axis=axis)

    exact = n_resamples is None and n <= EXACT_ENUMERATION_CAP
    resamples = np.inf if exact else (n_resamples if n_resamples is not None else 20000)
    res = permutation_test((xa, ya), stat, permutation_type="samples", n_resamples=resamples, alternative="two-sided")
    return {"mean_diff": float(res.statistic), "p": float(res.pvalue), "n": n, "exact": bool(exact)}


def bootstrap_ci(values: Sequence[float], confidence: float = 0.95, iterations: int = 10000, seed: int = 0) -> dict:
    """Percentile bootstrap CI for the mean, via scipy.stats.bootstrap."""
    arr = np.asarray(values, dtype=float)
    if arr.size == 0:
        raise ValueError("bootstrap_ci: values must be non-empty")
    res = bootstrap((arr,), np.mean, confidence_level=confidence, n_resamples=iterations,
                     random_state=seed, method="percentile")
    return {"mean": float(np.mean(arr)), "lo": float(res.confidence_interval.low), "hi": float(res.confidence_interval.high)}


def clustered_se(values: Sequence[float], cluster_ids: Sequence[str]) -> float:
    """Clustered standard error of a mean (Anthropic arXiv 2411.00640, Eq. 4): cluster on cluster_ids.

    Equals the naive CLT SE when every cluster has exactly one observation.
    """
    values = list(values)
    if len(values) != len(cluster_ids):
        raise ValueError("clustered_se: values and cluster_ids length mismatch")
    n = len(values)
    mean = sum(values) / n
    resid = [v - mean for v in values]
    by_cluster: dict[str, list[int]] = {}
    for i, c in enumerate(cluster_ids):
        by_cluster.setdefault(c, []).append(i)
    var_sum = sum(r * r for r in resid)
    for idxs in by_cluster.values():
        for i in idxs:
            for j in idxs:
                if i != j:
                    var_sum += resid[i] * resid[j]
    return (var_sum / (n * n)) ** 0.5


def holm_correction(p_values: Sequence[float]) -> list[float]:
    """Holm-Bonferroni step-down adjusted p-values, SAME order as input (statsmodels, method='holm')."""
    if len(p_values) == 0:
        return []
    _, p_adj, _, _ = multipletests(list(p_values), method="holm")
    return [float(p) for p in p_adj]


def sample_size_for_mde(sd: float, mde: float, alpha: float = 0.05, power: float = 0.8) -> int:
    """Paired-difference sample size (statsmodels TTestPower), for a given sd of the per-unit
    difference and a minimum detectable effect mde in the same units.
    """
    effect_size = mde / sd
    n = TTestPower().solve_power(effect_size=effect_size, alpha=alpha, power=power, alternative="two-sided")
    import math
    return math.ceil(n)
