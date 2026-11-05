#!/usr/bin/env python3
"""The ONE command every T90 experiment starts with: hash + freeze a spec before run 1 (OSF/AsPredicted
practice; see this project's own internal prior-art notes). Refuses silently-edited specs after the
fact (assert_frozen_unedited) -- CI should call --check on every push so a quiet edit to a frozen spec fails
the build instead of invalidating a result nobody notices.

Usage:
  freeze.py <spec.json> [--frozen PATH]              # first freeze, before run 1
  freeze.py <spec.json> [--frozen PATH] --check       # CI gate: fail if the spec was edited after freezing
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from spec import assert_frozen_unedited, freeze_spec  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("spec", help="path to the experiment spec JSON (hypothesis, arms, tasks, analysis plan, sample size, stop rules)")
    ap.add_argument("--frozen", default=None, help="path to write/check the freeze record (default: <spec>.sha256 beside it)")
    ap.add_argument("--check", action="store_true", help="CI mode: verify the spec is unchanged since its freeze; non-zero exit on drift")
    a = ap.parse_args()
    spec_path = Path(a.spec)
    frozen_path = Path(a.frozen) if a.frozen else spec_path.with_suffix(".sha256")
    if a.check:
        try:
            assert_frozen_unedited(spec_path, frozen_path)
        except (FileNotFoundError, ValueError) as e:
            print(f"FROZEN SPEC CHECK FAILED: {e}", file=sys.stderr)
            return 1
        print(f"OK: {spec_path} matches its freeze at {frozen_path}")
        return 0
    if frozen_path.exists():
        print(f"refused: {frozen_path} already exists; a change now is a NEW spec version (e.g. -v2), not an edit", file=sys.stderr)
        return 2
    info = freeze_spec(spec_path, frozen_path)
    print(f"frozen {info['spec_path']} -> {frozen_path}\n  sha256 {info['sha256']}\n  at     {info['frozen_at']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
