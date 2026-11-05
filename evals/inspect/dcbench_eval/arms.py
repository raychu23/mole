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

import json
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


# --- external-agent (claude_code/codex) context placement -----------------------------------------------
#
# apply_arm() above places context the way *hermes* consumes it: a prompt-prefix string, because hermes
# --safe-mode never reads CLAUDE.md/AGENTS.md itself (it only sees whatever this module hands back as the
# prompt). Claude Code and Codex are different: they are real, separately-documented CLI tools with their
# own persistent-context convention that has nothing to do with our prompt string, so a review found that
# (a) a "rules" arm's prefixed-prompt return value was silently discarded for these agents (the caller
# never used it) and (b) a "decisions" arm's files, written only to .mole/decisions/, sit somewhere neither
# CLI looks without Mole's own Claude Code plugin hooks installed. Fixed here per each CLI's own docs:
#   Claude Code -- reads ./CLAUDE.md (or ./.claude/CLAUDE.md), loaded at the start of every session
#     (https://docs.claude.com/en/docs/claude-code/claude-md, "Project instructions").
#   Codex       -- reads AGENTS.md from the project root down to the cwd, concatenated, once per run
#     (https://github.com/openai/codex/blob/main/docs/agents_md.md, "How Codex discovers guidance").
AGENT_INSTRUCTION_FILENAMES = {"claude_code": "CLAUDE.md", "codex": "AGENTS.md"}


def agent_instruction_path(worktree: Path, agent: str) -> Path:
    """The file `agent` actually reads at startup for persistent project context, per its own docs
    (see the module-level comment above this section). Raises for any agent with no such convention
    (today: only claude_code/codex call this -- hermes uses apply_arm()'s prompt-prefix return instead)."""
    try:
        return worktree / AGENT_INSTRUCTION_FILENAMES[agent]
    except KeyError:
        raise ValueError(f"no instruction-file convention known for agent {agent!r}; known: {sorted(AGENT_INSTRUCTION_FILENAMES)}") from None


def _append_instruction(path: Path, heading: str, body: str) -> None:
    """Appends a `## heading` + body section to `path`, creating it if absent and preserving whatever is
    already there (a real user repo may already ship its own CLAUDE.md/AGENTS.md; this arm's context is
    additive, never a silent overwrite)."""
    existing = path.read_text() if path.exists() else ""
    sep = "" if not existing else ("\n\n" if not existing.endswith("\n\n") else "")
    path.write_text(f"{existing}{sep}## {heading}\n\n{body.rstrip()}\n")


def render_decisions_for_instructions(decisions_dir: Path) -> str:
    """Concatenates every `*.md` under a `.mole/decisions`-shaped directory into one block suitable for
    pasting into CLAUDE.md/AGENTS.md -- the fallback for a 'decisions' arm when no Mole plugin hook can be
    installed in the sandbox (see install_claude_code_plugin_hooks)."""
    files = sorted(decisions_dir.glob("*.md"))
    if not files:
        return "(no *.md decision files found)"
    return "\n\n".join(f"### {f.name}\n\n{f.read_text().rstrip()}" for f in files)


def _find_mole_plugin_dir() -> Path | None:
    """Best-effort: locate THIS checkout's own plugins/claude-code (works when mole_ab is run from inside
    the Mole monorepo itself -- e.g. dev/CI use against this repo's own .mole/decisions). For an arbitrary
    external user repo there is no local Mole plugin checkout to find and this returns None; callers must
    then fall back to render_decisions_for_instructions(), which always works for any repo."""
    here = Path(__file__).resolve()
    for parent in here.parents:
        candidate = parent / "plugins" / "claude-code"
        if (candidate / ".claude-plugin" / "plugin.json").exists() and (candidate / "hooks" / "hooks.json").exists():
            return candidate
    return None


def install_claude_code_plugin_hooks(worktree: Path) -> bool:
    """Installs Mole's own Claude Code plugin hooks (SessionStart/PreToolUse/Stop/UserPromptSubmit --
    plugins/claude-code/hooks/hooks.json) into `worktree` WITHOUT a marketplace install: copies the plugin
    directory to `<worktree>/.mole-plugin` and writes its hooks into the project-level
    `<worktree>/.claude/settings.json` (the same project-settings hooks mechanism Claude Code's own docs
    document, https://docs.claude.com/en/docs/claude-code/hooks-guide -- a project's `.claude/settings.json`
    may declare a `hooks` block directly, no plugin registration needed), substituting the real copied path
    for `${CLAUDE_PLUGIN_ROOT}` (only set for an actual marketplace-installed plugin, not a bare file copy).
    Returns True if installed, False if no local plugin checkout was found (see _find_mole_plugin_dir) --
    the caller must then fall back to writing decision text directly into CLAUDE.md instead."""
    src = _find_mole_plugin_dir()
    if src is None:
        return False
    dest = worktree / ".mole-plugin"
    if dest.exists():
        shutil.rmtree(dest)
    shutil.copytree(src, dest)
    hooks_doc = json.loads((dest / "hooks" / "hooks.json").read_text())
    hooks_cfg = json.loads(json.dumps(hooks_doc["hooks"]).replace("${CLAUDE_PLUGIN_ROOT}", str(dest)))
    settings_path = worktree / ".claude" / "settings.json"
    settings_path.parent.mkdir(parents=True, exist_ok=True)
    settings = json.loads(settings_path.read_text()) if settings_path.exists() else {}
    settings["hooks"] = hooks_cfg
    settings_path.write_text(json.dumps(settings, indent=2) + "\n")
    return True


def install_arm_for_agent(arm: ArmConfig, worktree: Path, agent: str) -> dict[str, object]:
    """The external-agent (claude_code/codex) equivalent of apply_arm(): places context the way THAT
    agent actually reads it at startup, per the module-level comment above. Still calls apply_arm() first
    for its file-placement side effects that are agent-agnostic (.mole/decisions/ copy, plugin_pin's
    archive extraction -- kept for Mole's own tooling / a later plugin-hook install to find), but -- unlike
    the review-FAIL version -- never silently discards what matters for THIS agent: a 'rules' arm's text
    and a 'decisions' arm's content both land in the one place claude_code/codex actually load.
    Returns a small dict describing what happened (used by tests and worth logging): instruction_file
    (path written, or None for 'none'/'plugin_pin'), plugin_hooks_installed (True only for a 'decisions'
    arm under claude_code when install_claude_code_plugin_hooks succeeded)."""
    apply_arm(arm, worktree, "")  # side effects only (.mole/decisions copy, plugin_pin archive); see docstring
    info: dict[str, object] = {"instruction_file": None, "plugin_hooks_installed": False}
    if arm.kind in ("none", "plugin_pin"):
        return info
    instr_path = agent_instruction_path(worktree, agent)
    if arm.kind == "rules":
        _append_instruction(instr_path, f"Project instructions (arm: {arm.name})", arm.path.read_text())
        info["instruction_file"] = str(instr_path)
        return info
    if arm.kind == "decisions":
        if agent == "claude_code" and install_claude_code_plugin_hooks(worktree):
            info["plugin_hooks_installed"] = True
            return info
        text = render_decisions_for_instructions(arm.path)
        _append_instruction(
            instr_path,
            f"Project decisions (arm: {arm.name}; ported here -- no Mole plugin hook is installed in this sandbox for {agent})",
            text,
        )
        info["instruction_file"] = str(instr_path)
        return info
    raise ValueError(f"unknown arm kind {arm.kind!r}")
