"""Red-first (T90 follow-up): arms.py must parse the documented syntax and actually place context files."""
from __future__ import annotations

import pytest

from dcbench_eval.arms import ArmConfig, apply_arm, parse_arm, parse_arms


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
