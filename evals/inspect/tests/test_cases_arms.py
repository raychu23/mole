"""Samples from the key, and the two arms' Claude Code configuration (pure Python)."""
import json
from pathlib import Path

from mole_eval.arms import arm_config
from mole_eval.cases import load_key, samples

REPO_ROOT = Path(__file__).resolve().parents[3]


def test_samples_cross_cases_with_arms_and_only_the_arm_differs():
    key = load_key()
    ss = samples(key)
    assert [s["id"] for s in ss] == ["B3-tidy-none", "B3-tidy-mole", "B3-review-none", "B3-review-mole"]
    by_case = {}
    for s in ss:
        by_case.setdefault(s["metadata"]["case"], set()).add(s["input"])
    assert all(len(prompts) == 1 for prompts in by_case.values())
    assert samples(key, case_ids=["B3-review"]) == ss[2:]


def test_none_arm_has_no_mole():
    c = arm_config("none")
    assert c["settings"] is None and c["mcp"] == [] and c["env"] == {}


def test_mole_arm_uses_the_t15_hook_scripts_and_the_mcp_server():
    c = arm_config("mole")
    hooks = json.loads((REPO_ROOT / "plugins/claude-code/hooks/hooks.json").read_text())["hooks"]
    assert set(c["settings"]["hooks"]) == set(hooks)
    for event, groups in hooks.items():
        want = [h["command"].split("/")[-1].strip('"') for g in groups for h in g["hooks"]]
        got = [h["command"] for g in c["settings"]["hooks"][event] for h in g["hooks"]]
        assert len(got) == len(want) and all(w in g and "/opt/mole/plugins/claude-code/scripts/" in g for w, g in zip(want, got))
    assert c["env"]["MOLE_STOP_CONTINUE"] == "1"
    assert [m["name"] for m in c["mcp"]] == ["mole"]
    assert c["mcp"][0]["args"] == ["/opt/mole/packages/mcp/dist/cli.js"]


def test_no_credentials_in_either_arm():
    for arm in ("none", "mole"):
        blob = json.dumps(arm_config(arm))
        for bad in ("ANTHROPIC_API_KEY", ".hermes", "~/.claude", "/Users/", "/root/.claude"):
            assert bad not in blob
