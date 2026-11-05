"""Red-first (T90 follow-up): arms.py must parse the documented syntax and actually place context files."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from dcbench_eval.arms import (
    ArmConfig,
    agent_instruction_path,
    apply_arm,
    install_arm_for_agent,
    parse_arm,
    parse_arms,
    render_decisions_for_instructions,
)


def test_parse_none():
    a = parse_arm("none")
    assert a == ArmConfig(name="none", kind="none")


def test_parse_rules_and_decisions_need_a_path():
    with pytest.raises(ValueError):
        parse_arm("rules")
    with pytest.raises(ValueError):
        parse_arm("decisions")


def test_parse_rules():
    a = parse_arm("rules:CLAUDE.md")
    assert a.kind == "rules" and str(a.path) == "CLAUDE.md"


def test_parse_plugin_pin_needs_sha_and_path():
    with pytest.raises(ValueError):
        parse_arm("plugin_pin:abc123")
    a = parse_arm("plugin_pin:abc123:/some/path")
    assert a.commit == "abc123" and str(a.path) == "/some/path"


def test_parse_unknown_kind_rejected():
    with pytest.raises(ValueError):
        parse_arm("bogus:x")


def test_parse_arms_splits_on_comma():
    arms = parse_arms("none, rules:a.md, decisions:.mole/decisions")
    assert [a.kind for a in arms] == ["none", "rules", "decisions"]


def test_apply_arm_none_returns_prompt_unchanged(tmp_path):
    assert apply_arm(parse_arm("none"), tmp_path, "do the thing") == "do the thing"


def test_apply_arm_rules_prefixes_file_content(tmp_path):
    rules = tmp_path / "RULES.md"
    rules.write_text("Always write tests first.")
    prompt = apply_arm(parse_arm(f"rules:{rules}"), tmp_path, "fix the bug")
    assert "Always write tests first." in prompt
    assert prompt.endswith("fix the bug")


def test_apply_arm_decisions_copies_directory_into_worktree(tmp_path):
    src = tmp_path / "src_decisions"
    src.mkdir()
    (src / "D1.md").write_text("rules: never do X")
    wt = tmp_path / "worktree"
    wt.mkdir()
    out = apply_arm(parse_arm(f"decisions:{src}"), wt, "prompt text")
    assert out == "prompt text"
    assert (wt / ".mole" / "decisions" / "D1.md").read_text() == "rules: never do X"


# --- install_arm_for_agent (T93 review FAIL fix #2): claude_code/codex read context differently from
# hermes -- they never see apply_arm()'s returned prompt-prefix string, only CLAUDE.md/AGENTS.md on disk
# (and, for claude_code, project hooks). These tests prove the two arms actually produce DIFFERENT agent
# inputs for both agents, which was the review's concrete complaint ("rules" was a no-op, "decisions"
# landed somewhere neither CLI looks).


def test_agent_instruction_path_maps_claude_code_and_codex():
    wt = Path("/tmp/doesnotneedtoexist")
    assert agent_instruction_path(wt, "claude_code").name == "CLAUDE.md"
    assert agent_instruction_path(wt, "codex").name == "AGENTS.md"
    with pytest.raises(ValueError):
        agent_instruction_path(wt, "hermes")


def test_install_arm_for_agent_none_writes_nothing(tmp_path):
    wt = tmp_path / "wt"
    wt.mkdir()
    info = install_arm_for_agent(parse_arm("none"), wt, "claude_code")
    assert info == {"instruction_file": None, "plugin_hooks_installed": False}
    assert not (wt / "CLAUDE.md").exists()


def test_install_arm_for_agent_rules_writes_claude_md_for_claude_code(tmp_path):
    rules = tmp_path / "RULES.md"
    rules.write_text("Always write tests first.")
    wt = tmp_path / "wt"
    wt.mkdir()
    info = install_arm_for_agent(parse_arm(f"rules:{rules}"), wt, "claude_code")
    assert info["instruction_file"] == str(wt / "CLAUDE.md")
    assert "Always write tests first." in (wt / "CLAUDE.md").read_text()


def test_install_arm_for_agent_rules_writes_agents_md_for_codex(tmp_path):
    rules = tmp_path / "RULES.md"
    rules.write_text("Always write tests first.")
    wt = tmp_path / "wt"
    wt.mkdir()
    info = install_arm_for_agent(parse_arm(f"rules:{rules}"), wt, "codex")
    assert info["instruction_file"] == str(wt / "AGENTS.md")
    assert "Always write tests first." in (wt / "AGENTS.md").read_text()
    assert not (wt / "CLAUDE.md").exists()


def test_install_arm_for_agent_rules_appends_to_existing_instruction_file(tmp_path):
    rules = tmp_path / "RULES.md"
    rules.write_text("New rule.")
    wt = tmp_path / "wt"
    wt.mkdir()
    (wt / "AGENTS.md").write_text("Pre-existing project instructions.\n")
    install_arm_for_agent(parse_arm(f"rules:{rules}"), wt, "codex")
    text = (wt / "AGENTS.md").read_text()
    assert "Pre-existing project instructions." in text
    assert "New rule." in text


def test_install_arm_for_agent_decisions_falls_back_to_instruction_file_when_no_plugin_found(tmp_path, monkeypatch):
    monkeypatch.setattr("dcbench_eval.arms._find_mole_plugin_dir", lambda: None)
    decisions = tmp_path / "decisions"
    decisions.mkdir()
    (decisions / "D1.md").write_text("rules: never do X")
    wt = tmp_path / "wt"
    wt.mkdir()
    info = install_arm_for_agent(parse_arm(f"decisions:{decisions}"), wt, "claude_code")
    assert info["plugin_hooks_installed"] is False
    assert info["instruction_file"] == str(wt / "CLAUDE.md")
    assert "never do X" in (wt / "CLAUDE.md").read_text()
    # side effect of apply_arm() is still kept (Mole's own tooling reads this convention too)
    assert (wt / ".mole" / "decisions" / "D1.md").exists()


def test_install_arm_for_agent_decisions_falls_back_for_codex_always(tmp_path):
    """codex has no plugin-hook mechanism at all -- 'decisions' always lands in AGENTS.md for it."""
    decisions = tmp_path / "decisions"
    decisions.mkdir()
    (decisions / "D1.md").write_text("rules: never do Y")
    wt = tmp_path / "wt"
    wt.mkdir()
    info = install_arm_for_agent(parse_arm(f"decisions:{decisions}"), wt, "codex")
    assert info["plugin_hooks_installed"] is False
    assert "never do Y" in (wt / "AGENTS.md").read_text()


def test_install_arm_for_agent_decisions_installs_real_plugin_hooks_when_found_in_repo(tmp_path):
    """Run from inside the Mole monorepo checkout (this test's own cwd): _find_mole_plugin_dir finds the
    real plugins/claude-code, so claude_code gets the actual hooks installed instead of the text fallback
    -- the 'if feasible' half of the review's ask."""
    decisions = tmp_path / "decisions"
    decisions.mkdir()
    (decisions / "D1.md").write_text("rules: never do Z")
    wt = tmp_path / "wt"
    wt.mkdir()
    info = install_arm_for_agent(parse_arm(f"decisions:{decisions}"), wt, "claude_code")
    assert info["plugin_hooks_installed"] is True
    assert info["instruction_file"] is None
    settings = json.loads((wt / ".claude" / "settings.json").read_text())
    assert "SessionStart" in settings["hooks"]
    for event in settings["hooks"].values():
        for matcher_block in event:
            for hook in matcher_block["hooks"]:
                assert "${CLAUDE_PLUGIN_ROOT}" not in hook["command"]
                assert str(wt / ".mole-plugin") in hook["command"]
    assert (wt / ".mole-plugin" / ".claude-plugin" / "plugin.json").exists()


def test_render_decisions_for_instructions_concatenates_every_md(tmp_path):
    (tmp_path / "D1.md").write_text("first decision")
    (tmp_path / "D2.md").write_text("second decision")
    text = render_decisions_for_instructions(tmp_path)
    assert "first decision" in text and "second decision" in text


def test_two_arms_produce_different_claude_md_for_claude_code(tmp_path):
    """The review's concrete acceptance check: two arms must produce DIFFERENT agent inputs."""
    rules = tmp_path / "RULES.md"
    rules.write_text("rule text unique to this arm")
    wt_none = tmp_path / "wt_none"
    wt_none.mkdir()
    wt_rules = tmp_path / "wt_rules"
    wt_rules.mkdir()
    install_arm_for_agent(parse_arm("none"), wt_none, "claude_code")
    install_arm_for_agent(parse_arm(f"rules:{rules}"), wt_rules, "claude_code")
    none_text = (wt_none / "CLAUDE.md").read_text() if (wt_none / "CLAUDE.md").exists() else ""
    rules_text = (wt_rules / "CLAUDE.md").read_text()
    assert none_text != rules_text
    assert "rule text unique to this arm" in rules_text


def test_two_arms_produce_different_agents_md_for_codex(tmp_path):
    rules = tmp_path / "RULES.md"
    rules.write_text("codex-specific rule text")
    wt_none = tmp_path / "wt_none"
    wt_none.mkdir()
    wt_rules = tmp_path / "wt_rules"
    wt_rules.mkdir()
    install_arm_for_agent(parse_arm("none"), wt_none, "codex")
    install_arm_for_agent(parse_arm(f"rules:{rules}"), wt_rules, "codex")
    none_text = (wt_none / "AGENTS.md").read_text() if (wt_none / "AGENTS.md").exists() else ""
    rules_text = (wt_rules / "AGENTS.md").read_text()
    assert none_text != rules_text
    assert "codex-specific rule text" in rules_text
