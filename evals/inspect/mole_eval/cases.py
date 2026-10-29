"""Samples from cases/key.json: every runnable case x every arm, same prompt in both arms."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Sequence

EVAL_DIR = Path(__file__).resolve().parents[1]
KEY_PATH = EVAL_DIR / "cases" / "key.json"
ARMS = ("none", "mole")


def load_key(path: Path | str | None = None) -> dict[str, Any]:
    return json.loads(Path(path or KEY_PATH).read_text())


def samples(key: dict[str, Any], arms: Sequence[str] = ARMS, case_ids: Sequence[str] | None = None) -> list[dict[str, Any]]:
    known = [c["id"] for c in key["cases"]]
    if case_ids is not None:
        unknown = [c for c in case_ids if c not in known]
        if unknown:
            raise ValueError(f"unknown case(s) {unknown}; known: {known}")
    out = []
    for c in key["cases"]:
        if case_ids is not None and c["id"] not in case_ids:
            continue
        for arm in arms:
            if arm not in ARMS:
                raise ValueError(f"unknown arm {arm!r}")
            out.append({
                "id": f"{c['id']}-{arm}",
                "input": c["prompt"],
                "metadata": {"case": c["id"], "arm": arm, "setup": list(c.get("setup", [])), "guard": key["guard"]["placed_at"]},
            })
    return out
