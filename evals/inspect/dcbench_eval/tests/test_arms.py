"""Red-first (T90 follow-up): arms.py must parse the documented syntax and actually place context files."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from dcbench_eval.arms import (
    ArmConfig,
    DEFAULT_MOLE_PACKAGE_URL,
    agent_instruction_path,
    apply_arm,
    install_arm_for_agent,
    install_claude_code_plugin_hooks,
    install_mole_npm_package,
    parse_arm,
    parse_arms,
    preflight_mole_resolves,
    render_decisions_for_instructions,
)

REAL_LIB_MJS = Path(__file__).resolve().parents[4] / "plugins" / "claude-code" / "scripts" / "lib.mjs"


def _write_fake_mole_package(pkg_dir: Path, *, working_find_mole: bool, with_dist: bool = True) -> Path:
    """Builds a directory shaped like the real installed `mole-code` npm package (dist/, .claude-plugin/,
    hooks/, scripts/ -- see release/mole-code/package.json's `files`) for tests, without a real npm
    install. `working_find_mole=True` copies the REAL plugins/claude-code/scripts/lib.mjs verbatim (so
    findMole() is exercised for real, same as production); False writes a stub whose findMole() always
    returns undefined, simulating the exact review-caught failure (an install that LOOKS present but can't
    actually resolve the CLI)."""
    (pkg_dir / "dist").mkdir(parents=True, exist_ok=True)
    if with_dist:
        (pkg_dir / "dist" / "cli.js").write_text("#!/usr/bin/env node\nconsole.log(JSON.stringify(process.argv.slice(2)));\n")
    (pkg_dir / ".claude-plugin").mkdir(parents=True, exist_ok=True)
    (pkg_dir / ".claude-plugin" / "plugin.json").write_text(json.dumps({"name": "mole-code"}))
    (pkg_dir / "hooks").mkdir(parents=True, exist_ok=True)
    (pkg_dir / "hooks" / "hooks.json").write_text(json.dumps({
        "hooks": {
            "SessionStart": [{"hooks": [{"type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/session-start.mjs"}]}],
        }
    }))
    (pkg_dir / "scripts").mkdir(parents=True, exist_ok=True)
    if working_find_mole:
        (pkg_dir / "scripts" / "lib.mjs").write_text(REAL_LIB_MJS.read_text())
    else:
        (pkg_dir / "scripts" / "lib.mjs").write_text("export function findMole() { return undefined; }\n")
    return pkg_dir


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
    assert info == {"instruction_file": None, "plugin_hooks_installed": False, "mechanism": None}
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


def test_install_arm_for_agent_decisions_falls_back_to_instruction_file_when_npm_install_impossible(tmp_path, monkeypatch):
    """T93 round-2 review HIGH fix: when installing the real mole-code npm package is impossible (npm
    missing, install failed -- simulated here by monkeypatching install_mole_npm_package to None), the arm
    must fall back honestly to the instruction-file text, never pretend the plugin is installed."""
    monkeypatch.setattr("dcbench_eval.arms.install_mole_npm_package", lambda worktree, mole_package=None: None)
    decisions = tmp_path / "decisions"
    decisions.mkdir()
    (decisions / "D1.md").write_text("rules: never do X")
    wt = tmp_path / "wt"
    wt.mkdir()
    info = install_arm_for_agent(parse_arm(f"decisions:{decisions}"), wt, "claude_code")
    assert info["plugin_hooks_installed"] is False
    assert info["mechanism"] == "instruction_file"
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
    assert info["mechanism"] == "instruction_file"
    assert "never do Y" in (wt / "AGENTS.md").read_text()


# --- install_mole_npm_package / preflight_mole_resolves (T93 round-2 review HIGH fix) ---------------------
#
# The review's concrete bug: a bare copy of plugins/claude-code SOURCE (no dist/) was installed and reported
# plugin_hooks_installed: True, but the plugin's own findMole() (scripts/lib.mjs) returned undefined inside
# it, so every hook silently no-op'd -- the 'decisions' arm behaved exactly like 'none' while claiming
# success. These tests prove: (1) installing the real npm package is attempted (not a source copy), (2) a
# failed/impossible install is reported honestly, never silently, and (3) a preflight runs the REAL
# findMole() BEFORE claiming the plugin is installed and FAILS LOUDLY if it can't resolve.


def test_install_mole_npm_package_returns_none_when_npm_missing(tmp_path, monkeypatch):
    monkeypatch.setattr("shutil.which", lambda name: None)
    assert install_mole_npm_package(tmp_path) is None


def test_install_mole_npm_package_returns_none_when_npm_install_fails(tmp_path, monkeypatch):
    monkeypatch.setattr("shutil.which", lambda name: "/usr/bin/npm")

    class FakeResult:
        returncode = 1
        stdout = ""
        stderr = "network error"

    monkeypatch.setattr("subprocess.run", lambda *a, **k: FakeResult())
    assert install_mole_npm_package(tmp_path) is None


def test_install_mole_npm_package_returns_none_when_install_produced_no_dist(tmp_path, monkeypatch):
    """Defensive: even if npm reports success, a package with no dist/cli.js must never be treated as a
    real install (that is exactly the bug class this review round caught)."""
    monkeypatch.setattr("shutil.which", lambda name: "/usr/bin/npm")

    def fake_run(cmd, **kwargs):
        prefix = Path(cmd[cmd.index("--prefix") + 1])
        (prefix / "node_modules" / "mole-code").mkdir(parents=True)  # no dist/ inside

        class FakeResult:
            returncode = 0
            stdout = ""
            stderr = ""

        return FakeResult()

    monkeypatch.setattr("subprocess.run", fake_run)
    assert install_mole_npm_package(tmp_path) is None


def test_install_mole_npm_package_returns_installed_dir_with_dist_on_success(tmp_path, monkeypatch):
    monkeypatch.setattr("shutil.which", lambda name: "/usr/bin/npm")
    captured = {}

    def fake_run(cmd, **kwargs):
        captured["cmd"] = cmd
        prefix = Path(cmd[cmd.index("--prefix") + 1])
        pkg = prefix / "node_modules" / "mole-code"
        _write_fake_mole_package(pkg, working_find_mole=True)

        class FakeResult:
            returncode = 0
            stdout = ""
            stderr = ""

        return FakeResult()

    monkeypatch.setattr("subprocess.run", fake_run)
    result = install_mole_npm_package(tmp_path, mole_package="/some/local/mole-code-0.1.0.tgz")
    assert result is not None
    assert result == tmp_path / ".mole-npm" / "node_modules" / "mole-code"
    assert (result / "dist" / "cli.js").exists()
    assert captured["cmd"][-1] == "/some/local/mole-code-0.1.0.tgz"


def test_install_mole_npm_package_defaults_to_public_release_url(tmp_path, monkeypatch):
    monkeypatch.setattr("shutil.which", lambda name: "/usr/bin/npm")
    captured = {}

    def fake_run(cmd, **kwargs):
        captured["cmd"] = cmd

        class FakeResult:
            returncode = 1  # fails either way -- only checking what URL was requested
            stdout = ""
            stderr = ""

        return FakeResult()

    monkeypatch.setattr("subprocess.run", fake_run)
    install_mole_npm_package(tmp_path)
    assert captured["cmd"][-1] == DEFAULT_MOLE_PACKAGE_URL


def test_preflight_mole_resolves_raises_loudly_when_find_mole_cannot_resolve(tmp_path):
    """The exact review repro: an 'installed' plugin whose findMole() returns undefined must FAIL LOUDLY
    here, not silently let the caller claim plugin_hooks_installed: True."""
    pkg = tmp_path / "broken_pkg"
    _write_fake_mole_package(pkg, working_find_mole=False)
    wt = tmp_path / "wt"
    wt.mkdir()
    with pytest.raises(RuntimeError, match="preflight FAILED"):
        preflight_mole_resolves(pkg, wt)


def test_preflight_mole_resolves_passes_when_the_real_find_mole_resolves(tmp_path):
    """The real plugins/claude-code/scripts/lib.mjs findMole(), given a worktree with a sibling dist/cli.js
    (exactly how install_claude_code_plugin_hooks lays the copy out), must resolve -- proving the preflight
    is not just a tautology that always raises."""
    pkg = tmp_path / "working_pkg"
    _write_fake_mole_package(pkg, working_find_mole=True)
    wt = tmp_path / "wt"
    wt.mkdir()
    preflight_mole_resolves(pkg, wt)  # must not raise


def test_install_claude_code_plugin_hooks_reports_not_installed_when_npm_package_unavailable(tmp_path, monkeypatch):
    monkeypatch.setattr("dcbench_eval.arms.install_mole_npm_package", lambda worktree, mole_package=None: None)
    wt = tmp_path / "wt"
    wt.mkdir()
    result = install_claude_code_plugin_hooks(wt)
    assert result == {"installed": False, "mechanism": None}
    assert not (wt / ".mole-plugin").exists()


def test_install_claude_code_plugin_hooks_raises_when_installed_package_cannot_resolve_mole(tmp_path, monkeypatch):
    """Defense in depth: even if a future install_mole_npm_package bug ever handed back a package that
    looks installed but can't actually resolve (this test bypasses that function's own dist/cli.js guard on
    purpose), the preflight here must still catch it and raise -- never silently report success."""
    broken_pkg = tmp_path / "broken_pkg"
    _write_fake_mole_package(broken_pkg, working_find_mole=False)
    monkeypatch.setattr("dcbench_eval.arms.install_mole_npm_package", lambda worktree, mole_package=None: broken_pkg)
    wt = tmp_path / "wt"
    wt.mkdir()
    with pytest.raises(RuntimeError, match="preflight FAILED"):
        install_claude_code_plugin_hooks(wt)


def test_install_claude_code_plugin_hooks_succeeds_with_a_real_working_package(tmp_path, monkeypatch):
    """The 'if feasible' half of the review's ask: a package that DOES resolve gets installed, hooks wired
    into .claude/settings.json with real paths (never the unresolved ${CLAUDE_PLUGIN_ROOT} placeholder),
    and the preflight passes -- this is what plugin_hooks_installed: True is now actually backed by."""
    working_pkg = tmp_path / "working_pkg"
    _write_fake_mole_package(working_pkg, working_find_mole=True)
    monkeypatch.setattr("dcbench_eval.arms.install_mole_npm_package", lambda worktree, mole_package=None: working_pkg)
    wt = tmp_path / "wt"
    wt.mkdir()
    result = install_claude_code_plugin_hooks(wt)
    assert result == {"installed": True, "mechanism": "npm_package"}
    settings = json.loads((wt / ".claude" / "settings.json").read_text())
    assert "SessionStart" in settings["hooks"]
    for event in settings["hooks"].values():
        for matcher_block in event:
            for hook in matcher_block["hooks"]:
                assert "${CLAUDE_PLUGIN_ROOT}" not in hook["command"]
                assert str(wt / ".mole-plugin") in hook["command"]
    assert (wt / ".mole-plugin" / "dist" / "cli.js").exists()


def test_install_arm_for_agent_decisions_reports_npm_package_mechanism_on_success(tmp_path, monkeypatch):
    working_pkg = tmp_path / "working_pkg"
    _write_fake_mole_package(working_pkg, working_find_mole=True)
    monkeypatch.setattr("dcbench_eval.arms.install_mole_npm_package", lambda worktree, mole_package=None: working_pkg)
    decisions = tmp_path / "decisions"
    decisions.mkdir()
    (decisions / "D1.md").write_text("rules: never do Z")
    wt = tmp_path / "wt"
    wt.mkdir()
    info = install_arm_for_agent(parse_arm(f"decisions:{decisions}"), wt, "claude_code")
    assert info["plugin_hooks_installed"] is True
    assert info["mechanism"] == "npm_package"
    assert info["instruction_file"] is None
    assert (wt / ".mole-plugin" / "dist" / "cli.js").exists()


def test_install_arm_for_agent_forwards_mole_package_to_the_npm_install(tmp_path, monkeypatch):
    captured = {}

    def fake_install(worktree, mole_package=None):
        captured["mole_package"] = mole_package
        return None

    monkeypatch.setattr("dcbench_eval.arms.install_mole_npm_package", fake_install)
    decisions = tmp_path / "decisions"
    decisions.mkdir()
    (decisions / "D1.md").write_text("x")
    wt = tmp_path / "wt"
    wt.mkdir()
    install_arm_for_agent(parse_arm(f"decisions:{decisions}"), wt, "claude_code", mole_package="/local/mole-code.tgz")
    assert captured["mole_package"] == "/local/mole-code.tgz"


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
