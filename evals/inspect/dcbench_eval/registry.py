"""Registry of experiments: ideas -> status (T90 brief requirement). One JSON file, small and inspectable."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

VALID_STATUSES = {"idea", "pre-registered", "running", "analyzed", "done"}


def load_registry(path: Path) -> dict[str, Any]:
    path = Path(path)
    if not path.exists():
        return {"experiments": []}
    return json.loads(path.read_text())


def save_registry(path: Path, registry: dict[str, Any]) -> None:
    Path(path).write_text(json.dumps(registry, indent=2) + "\n")


def upsert_experiment(path: Path, entry: dict[str, Any]) -> dict[str, Any]:
    if entry.get("status") not in VALID_STATUSES:
        raise ValueError(f"upsert_experiment: status must be one of {sorted(VALID_STATUSES)}, got {entry.get('status')!r}")
    if not entry.get("id"):
        raise ValueError("upsert_experiment: entry requires an id")
    registry = load_registry(path)
    experiments = registry.setdefault("experiments", [])
    for i, e in enumerate(experiments):
        if e["id"] == entry["id"]:
            experiments[i] = entry
            save_registry(path, registry)
            return registry
    experiments.append(entry)
    save_registry(path, registry)
    return registry
