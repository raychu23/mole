"""Generic arm spec for `mole_ab` (T90, follow-up to the FAIL review): what context (if any) the hermes
agent sees before the same task prompt. Models run_dcbench.py's A/R/M pattern (arm_prompt()), generalised
so it works for ANY repo, not just dcbench.

Arm string syntax (one arm per comma-separated -T arms= entry):
  none                   no context at all (baseline)
  rules:PATH             PATH's text content, prefixed to the prompt verbatim (a CLAUDE.md/RULES.md
                          pasted in, since hermes --safe-mode does not load CLAUDE.md itself -- same
                          reason run_dcbench.py's arm R pastes text rather than relying on file discovery)
  decisions:PATH         PATH (a directory of .mole/decisions/*.md files) is copied into the worktree's
                          .mole/decisions/ before the agent runs
  plugin_pin:SHA:PATH    PATH (a plugins/claude-code checkout, or any directory) is checked out at git
                          commit SHA and copied into the worktree's plugins/claude-code/ before the agent
                          runs -- pins the TOOL version itself, not just the decisions content
"""
from __future__ import annotations

import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ArmConfig:
    name: str
    kind: str  # none | rules | decisions | plugin_pin
    path: Path | None = None
    commit: str | None = None

    @property
    def id(self) -> str:
        return self.name


def parse_arm(spec: str) -> ArmConfig:
    parts = spec.split(":")
    kind = parts[0]
    if kind == "none":
        if len(parts) != 1:
            raise ValueError(f"arm 'none' takes no arguments, got {spec!r}")
        return ArmConfig(name="none", kind="none")
    if kind in ("rules", "decisions"):
        if len(parts) != 2:
            raise ValueError(f"arm {kind!r} needs exactly one PATH argument, got {spec!r}")
        return ArmConfig(name=spec, kind=kind, path=Path(parts[1]))
    if kind == "plugin_pin":
        if len(parts) != 3:
            raise ValueError(f"arm 'plugin_pin' needs SHA:PATH, got {spec!r}")
        return ArmConfig(name=spec, kind=kind, commit=parts[1], path=Path(parts[2]))
    raise ValueError(f"unknown arm kind {kind!r} in {spec!r}; known: none, rules:PATH, decisions:PATH, plugin_pin:SHA:PATH")


def parse_arms(arms: str) -> list[ArmConfig]:
    cfgs = [parse_arm(a.strip()) for a in arms.split(",") if a.strip()]
    if len(cfgs) < 1:
        raise ValueError("arms must have at least 1 entry")
    return cfgs


def apply_arm(arm: ArmConfig, worktree: Path, prompt: str) -> str:
    """Places the arm's context into `worktree` and returns the (possibly prefixed) prompt text."""
    if arm.kind == "none":
        return prompt
    if arm.kind == "rules":
        text = arm.path.read_text()
        return f"Project instructions:\n\n{text}\n\n---\n\n{prompt}"
    if arm.kind == "decisions":
        dest = worktree / ".mole" / "decisions"
        dest.parent.mkdir(parents=True, exist_ok=True)
        if dest.exists():
            shutil.rmtree(dest)
        shutil.copytree(arm.path, dest)
        return prompt
    if arm.kind == "plugin_pin":
        src_repo = arm.path
        # archive the pinned commit straight into the destination (no nested git worktree needed)
        dest = worktree / "plugins" / "claude-code"
        dest.parent.mkdir(parents=True, exist_ok=True)
        if dest.exists():
            shutil.rmtree(dest)
        dest.mkdir(parents=True)
        archive = subprocess.run(
            ["git", "-C", str(src_repo), "archive", arm.commit],
            capture_output=True,
        )
        if archive.returncode != 0:
            raise RuntimeError(f"plugin_pin: git archive {arm.commit} failed: {archive.stderr.decode()[-500:]}")
        tar = subprocess.run(["tar", "-x", "-C", str(dest)], input=archive.stdout, capture_output=True)
        if tar.returncode != 0:
            raise RuntimeError(f"plugin_pin: tar extract failed: {tar.stderr.decode()[-500:]}")
        return prompt
    raise ValueError(f"unknown arm kind {arm.kind!r}")
