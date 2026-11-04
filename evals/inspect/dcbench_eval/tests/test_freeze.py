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
