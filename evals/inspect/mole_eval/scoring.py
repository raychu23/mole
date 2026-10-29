"""Pure-Python scoring logic (no inspect_ai import, so the system python3 can test it).

classify_guard: one run's guarding-test outcome -> kept | regressed | build_broken | guard_unrunnable.
wilson / newcombe_diff: 95% intervals for a rate and for a difference of two rates.
summarize: per-arm regression rate + interval + tokens + time; refuses a partial run (any errored or unscored sample).
assert_model_reached: a run whose agent never got a model answer is an error, never a score.
"""
from __future__ import annotations

from math import sqrt
from typing import Any, Iterable

LABELS = ("kept", "regressed", "build_broken", "guard_unrunnable")
Z95 = 1.959963984540054


class IncompleteRun(Exception):
    """Some samples errored or have no score: no rates are reported (contract: no partial score)."""


class ModelUnreachable(RuntimeError):
    """Claude Code in the sandbox never got an answer from the model through the Inspect bridge."""


def classify_guard(build_exit: int, test_exit: int, report: dict[str, Any] | None) -> str:
    """Outcome of `npm run build` + the guarding vitest run (its --reporter=json report, None when absent)."""
    if build_exit != 0:
        return "build_broken"
    if not report or int(report.get("numTotalTests", 0)) == 0:
        return "guard_unrunnable"
    if int(report.get("numFailedTests", 0)) > 0:
        return "regressed"
    if test_exit == 0 and int(report.get("numPassedTests", 0)) >= 1:
        return "kept"
    return "guard_unrunnable"


def is_regression(label: str) -> bool:
    """Primary metric: anything but 'kept' counts (the guarding test does not pass)."""
    if label not in LABELS:
        raise ValueError(f"unknown label {label!r}")
    return label != "kept"


def wilson(k: int, n: int, z: float = Z95) -> tuple[float, float]:
    if n <= 0:
        raise ValueError("wilson interval needs n > 0")
    p = k / n
    den = 1 + z * z / n
    mid = (p + z * z / (2 * n)) / den
    half = z * sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return (max(0.0, mid - half), min(1.0, mid + half))


def newcombe_diff(k1: int, n1: int, k2: int, n2: int, z: float = Z95) -> tuple[float, float, float]:
    """p1 - p2 with Newcombe's hybrid score interval (method 10, Newcombe 1998)."""
    p1, p2 = k1 / n1, k2 / n2
    l1, u1 = wilson(k1, n1, z)
    l2, u2 = wilson(k2, n2, z)
    d = p1 - p2
    lo = d - sqrt((p1 - l1) ** 2 + (u2 - p2) ** 2)
    hi = d + sqrt((u1 - p1) ** 2 + (p2 - l2) ** 2)
    return (d, lo, hi)


def assert_model_reached(model_calls: int, detail: str = "") -> None:
    if model_calls <= 0:
        msg = "Claude Code in the sandbox could not reach the model through the Inspect bridge (0 model answers); no score is given"
        raise ModelUnreachable(f"{msg}: {detail}" if detail else msg)


def _mean(xs: list[float]) -> float:
    return sum(xs) / len(xs) if xs else 0.0


def summarize(records: Iterable[dict[str, Any]]) -> dict[str, Any]:
    recs = list(records)
    if not recs:
        raise IncompleteRun("no samples in the run")
    bad = [r["id"] for r in recs if r.get("error") or r.get("label") not in LABELS]
    if bad:
        raise IncompleteRun(f"{len(bad)} of {len(recs)} samples errored or have no score (no partial score): {', '.join(map(str, bad))}")
    arms: dict[str, Any] = {}
    for arm in sorted({r["arm"] for r in recs}, key=lambda a: (a != "none", a)):
        rs = [r for r in recs if r["arm"] == arm]
        k = sum(is_regression(r["label"]) for r in rs)
        n = len(rs)
        arms[arm] = {
            "n": n,
            "regressions": k,
            "rate": k / n,
            "ci95": list(wilson(k, n)),
            "counts": {lab: sum(r["label"] == lab for r in rs) for lab in LABELS},
            "tokens_mean": _mean([r["total_tokens"] for r in rs]),
            "tokens_total": sum(r["total_tokens"] for r in rs),
            "input_tokens_total": sum(r.get("input_tokens", 0) for r in rs),
            "output_tokens_total": sum(r.get("output_tokens", 0) for r in rs),
            "seconds_mean": _mean([r["seconds"] for r in rs]),
        }
    out: dict[str, Any] = {"n_samples": len(recs), "arms": arms}
    if "none" in arms and "mole" in arms:
        a, b = arms["none"], arms["mole"]
        d, lo, hi = newcombe_diff(a["regressions"], a["n"], b["regressions"], b["n"])
        out["diff_none_minus_mole"] = {"d": d, "ci95": [lo, hi], "mole_better_shown": lo > 0}
    return out
