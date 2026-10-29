"""The Inspect task itself (skipped cleanly when inspect_ai / inspect_swe are not importable, e.g. the system python3)."""
import pytest

pytest.importorskip("inspect_ai")
pytest.importorskip("inspect_swe")


def test_task_builds_with_both_arms_docker_sandbox_and_guard_scorer():
    from mole_eval.task import mole_regression

    t = mole_regression()
    assert len(t.dataset) == 4
    assert {s.metadata["arm"] for s in t.dataset} == {"none", "mole"}
    assert t.sandbox.type == "docker"
    assert t.scorer


def test_dry_run_task_is_two_samples():
    from mole_eval.task import mole_regression

    t = mole_regression(cases="B3-review")
    assert [s.id for s in t.dataset] == ["B3-review-none", "B3-review-mole"]
