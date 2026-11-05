"""CLI smoke test for freeze.py (T90's "one command" every experiment starts with)."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

FREEZE_PY = Path(__file__).resolve().parents[1] / "freeze.py"


def _write_spec(tmp_path: Path) -> Path:
    spec = {
        "id": "smoke-test",
        "hypothesis": "a smoke test",
        "arms": [{"id": "a", "description": "a"}, {"id": "b", "description": "b"}],
        "tasks": ["T1"],
        "primary_metric": "m",
        "analysis_plan": "p",
        "sample_size": {"runs_per_arm_per_task": 1, "power": 0.8, "alpha": 0.05, "mde": 1.0},
        "stop_rules": ["r"],
    }
    p = tmp_path / "spec.json"
    p.write_text(json.dumps(spec))
    return p


def test_freeze_then_check_passes(tmp_path):
    spec_path = _write_spec(tmp_path)
    frozen_path = tmp_path / "spec.sha256"
    r1 = subprocess.run([sys.executable, str(FREEZE_PY), str(spec_path), "--frozen", str(frozen_path)],
                        capture_output=True, text=True)
    assert r1.returncode == 0, r1.stderr
    assert frozen_path.exists()
    r2 = subprocess.run([sys.executable, str(FREEZE_PY), str(spec_path), "--frozen", str(frozen_path), "--check"],
                        capture_output=True, text=True)
    assert r2.returncode == 0, r2.stderr


def test_check_fails_after_edit(tmp_path):
    spec_path = _write_spec(tmp_path)
    frozen_path = tmp_path / "spec.sha256"
    subprocess.run([sys.executable, str(FREEZE_PY), str(spec_path), "--frozen", str(frozen_path)], check=True)
    d = json.loads(spec_path.read_text())
    d["hypothesis"] = "edited after freeze"
    spec_path.write_text(json.dumps(d))
    r = subprocess.run([sys.executable, str(FREEZE_PY), str(spec_path), "--frozen", str(frozen_path), "--check"],
                       capture_output=True, text=True)
    assert r.returncode == 1
    assert "edited after freeze" in r.stderr


def test_refuses_to_refreeze(tmp_path):
    spec_path = _write_spec(tmp_path)
    frozen_path = tmp_path / "spec.sha256"
    subprocess.run([sys.executable, str(FREEZE_PY), str(spec_path), "--frozen", str(frozen_path)], check=True)
    r = subprocess.run([sys.executable, str(FREEZE_PY), str(spec_path), "--frozen", str(frozen_path)],
                       capture_output=True, text=True)
    assert r.returncode == 2
    assert "already exists" in r.stderr


def test_single_arm_spec_freezes(tmp_path):
    """T107/v4.2: a single-arm base-rate/descriptive spec (no comparison arm) must freeze cleanly --
    validate() was loosened from arms>=2 to arms>=1 (spec.py) for exactly this design."""
    spec = {
        "id": "single-arm-smoke-test",
        "hypothesis": "a single-arm base-rate smoke test",
        "arms": [{"id": "a", "description": "only arm"}],
        "tasks": ["T1"],
        "primary_metric": "m",
        "analysis_plan": "p",
        "sample_size": {"runs_per_arm_per_task": 8, "power": 0.8, "alpha": 0.05, "mde": 0.2},
        "stop_rules": ["r"],
    }
    spec_path = tmp_path / "spec.json"
    spec_path.write_text(json.dumps(spec))
    frozen_path = tmp_path / "spec.sha256"
    r = subprocess.run([sys.executable, str(FREEZE_PY), str(spec_path), "--frozen", str(frozen_path)],
                       capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    assert frozen_path.exists()


def test_zero_arm_spec_refused(tmp_path):
    spec = {
        "id": "zero-arm-smoke-test",
        "hypothesis": "h",
        "arms": [],
        "tasks": ["T1"],
        "primary_metric": "m",
        "analysis_plan": "p",
        "sample_size": {"runs_per_arm_per_task": 8, "power": 0.8, "alpha": 0.05, "mde": 0.2},
        "stop_rules": ["r"],
    }
    spec_path = tmp_path / "spec.json"
    spec_path.write_text(json.dumps(spec))
    frozen_path = tmp_path / "spec.sha256"
    r = subprocess.run([sys.executable, str(FREEZE_PY), str(spec_path), "--frozen", str(frozen_path)],
                       capture_output=True, text=True)
    assert r.returncode == 1
    assert "at least 1 entry" in r.stderr
