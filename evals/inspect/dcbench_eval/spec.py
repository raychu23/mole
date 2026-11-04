"""Pre-registration for the T90 A/B experiment system: hashed + frozen before run 1.

Builds on Inspect AI's Task (dataset/solver/scorer, see task.py) for RUNNING the experiment, and
on OSF / AsPredicted pre-registration practice (fix hypothesis, design and analysis plan before
data collection) for this piece, which Inspect AI does not provide on its own. See
tasks/T90-ab-experiment-system/4 log/prior-art.md.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path


@dataclass(frozen=True)
class SampleSizePlan:
    runs_per_arm_per_task: int
    power: float
    alpha: float
    mde: float  # minimum detectable effect the sample size was chosen to detect


@dataclass(frozen=True)
class ExperimentArm:
    id: str
    description: str
    env: dict = field(default_factory=dict)
    context_files: list = field(default_factory=list)
    pinned_commit: str | None = None


@dataclass(frozen=True)
class ExperimentSpec:
    id: str
    hypothesis: str
    arms: list  # list[ExperimentArm]
    tasks: list  # list[str]
    primary_metric: str
    analysis_plan: str
    sample_size: SampleSizePlan
    stop_rules: list

    def validate(self) -> None:
        if not self.id:
            raise ValueError("ExperimentSpec: id is required")
        if not self.hypothesis:
            raise ValueError("ExperimentSpec: hypothesis is required")
        if len(self.arms) < 2:
            raise ValueError("ExperimentSpec: arms must have at least 2 entries")
        if not self.tasks:
            raise ValueError("ExperimentSpec: tasks must be non-empty")
        if not self.primary_metric:
            raise ValueError("ExperimentSpec: primary_metric is required")
        if not self.analysis_plan:
            raise ValueError("ExperimentSpec: analysis_plan is required")
        if self.sample_size is None:
            raise ValueError("ExperimentSpec: sample_size (power calc) is required, frozen before run 1")
        if not self.stop_rules:
            raise ValueError("ExperimentSpec: stop_rules must be non-empty")


def spec_from_dict(d: dict) -> ExperimentSpec:
    arms = [ExperimentArm(**a) for a in d["arms"]]
    ss = SampleSizePlan(**d["sample_size"])
    return ExperimentSpec(
        id=d["id"], hypothesis=d["hypothesis"], arms=arms, tasks=list(d["tasks"]),
        primary_metric=d["primary_metric"], analysis_plan=d["analysis_plan"],
        sample_size=ss, stop_rules=list(d["stop_rules"]),
    )


def _canonical_json(spec_dict: dict) -> str:
    return json.dumps(spec_dict, sort_keys=True, separators=(",", ":"))


def _sha256_of_spec_file(spec_path: Path) -> str:
    d = json.loads(spec_path.read_text())
    return hashlib.sha256(_canonical_json(d).encode("utf-8")).hexdigest()


def freeze_spec(spec_path: Path, frozen_path: Path) -> dict:
    """Validates, hashes and writes a FROZEN.sha256-style record. Call once, before run 1."""
    spec_path, frozen_path = Path(spec_path), Path(frozen_path)
    spec = spec_from_dict(json.loads(spec_path.read_text()))
    spec.validate()
    sha256 = _sha256_of_spec_file(spec_path)
    frozen_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    lines = [
        f"# {spec.id} \u2014 frozen before run 1",
        f"# Frozen: {frozen_at}",
        "# Any edit to the spec file after this point must produce a NEW spec (e.g. \"-v2\") and a",
        "# fresh freeze; the old one is refused by assert_frozen_unedited().",
        "#",
        "# sha256                                                            path",
        f"{sha256}  {spec_path}",
        "",
    ]
    frozen_path.write_text("\n".join(lines))
    return {"spec_path": str(spec_path), "sha256": sha256, "frozen_at": frozen_at}


def assert_frozen_unedited(spec_path: Path, frozen_path: Path) -> None:
    """Raises if the spec file's current content hash does not match its frozen hash."""
    spec_path, frozen_path = Path(spec_path), Path(frozen_path)
    if not frozen_path.exists():
        raise FileNotFoundError(f"assert_frozen_unedited: no freeze record at {frozen_path}; freeze before running")
    text = frozen_path.read_text()
    frozen_hash = None
    for line in text.splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            frozen_hash = line.split()[0]
            break
    if not frozen_hash:
        raise ValueError(f"assert_frozen_unedited: {frozen_path} has no sha256 line")
    current_hash = _sha256_of_spec_file(spec_path)
    if current_hash != frozen_hash:
        raise ValueError(
            f"assert_frozen_unedited: {spec_path} was edited after freeze "
            f"(expected {frozen_hash}, got {current_hash}). A fix after run 1 is a NEW spec version "
            "(protocol vN+1) with a fresh freeze, not an edit to this one."
        )
