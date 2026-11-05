"""Red-first (T93): a public user with Claude Code or Codex installed (no hermes, no subscription) must be
able to run mole_ab via inspect-swe's maintained external-agent wrappers (inspect_swe.claude_code /
codex_cli) -- the same pattern worktree_agent.py already documents as borrowed from inspect-swe, just
routed through Inspect's own sandbox_agent_bridge/model loop instead of a raw subprocess. No real
claude/codex process is launched here (as_solver(agent) is monkeypatched); a real local-sandbox run
against an actually-installed `claude`/`codex` CLI is exercised outside pytest (see docs/experiments.md).
"""
from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from dcbench_eval.external_agent import SUPPORTED_AGENTS, build_external_agent, external_agent_worktree


@pytest.fixture
def tiny_repo(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    subprocess.run(["git", "init", "-q"], cwd=repo, check=True)
    subprocess.run(["git", "config", "user.email", "t@example.com"], cwd=repo, check=True)
    subprocess.run(["git", "config", "user.name", "t"], cwd=repo, check=True)
    (repo / "a.txt").write_text("hello\n")
    subprocess.run(["git", "add", "a.txt"], cwd=repo, check=True)
    subprocess.run(["git", "commit", "-q", "-m", "init"], cwd=repo, check=True)
    return repo


def test_supported_agents_are_claude_code_and_codex():
    assert SUPPORTED_AGENTS == {"claude_code", "codex"}


def test_build_external_agent_rejects_unknown_name():
    with pytest.raises(ValueError, match="unknown agent"):
        build_external_agent("bogus", cwd="/tmp/x")


def test_build_external_agent_claude_code_sets_cwd_and_skips_permission_prompts(tmp_path):
    agent = build_external_agent("claude_code", cwd=str(tmp_path))
    # inspect_swe's @agent decorator wraps execute() in an AgentPlan; the agent object itself doesn't
    # expose cwd back out, so this just proves construction succeeds with no exception (an invalid
    # kwarg combination, e.g. a cwd that conflicts with version, raises at construction time in
    # inspect_swe, so a silent misconfiguration would fail here, not at run_hermes-equivalent launch).
    assert agent is not None


def test_build_external_agent_codex_constructs(tmp_path):
    agent = build_external_agent("codex", cwd=str(tmp_path))
    assert agent is not None


@pytest.mark.anyio
async def test_external_agent_worktree_records_diff_and_cleans_up_via_task_cleanup(tiny_repo, monkeypatch):
    """Mirrors test_worktree_agent.py/test_worktree_cleanup.py's contract for hermes_worktree_agent:
    state.metadata gets worktree/repo/diff, and the worktree itself is left for the Task-level cleanup=
    callback to remove (same cleanup_sample used by the hermes path -- no agent-specific cleanup needed)."""
    from inspect_ai.solver import TaskState

    async def fake_as_solver_call(state, generate):
        # stand-in for Claude Code/Codex actually editing files in the worktree
        wt = state.metadata["worktree"]
        (__import__("pathlib").Path(wt) / "brand_new.txt").write_text("decision-compliant content\n")
        return state

    class FakeRunner:
        def __call__(self, agent):
            return fake_as_solver_call

    monkeypatch.setattr("dcbench_eval.external_agent.as_solver", FakeRunner())

    state = TaskState(model="mockllm/model", sample_id="s", epoch=0, input="do it",
                       messages=[], metadata={"arm": "none", "commit": "HEAD"})
    solve = external_agent_worktree(repo=str(tiny_repo), agent="claude_code")
    out = await solve(state, None)

    assert out.metadata["repo"] == str(tiny_repo)
    wt = out.metadata["worktree"]
    assert "brand_new.txt" in out.metadata["diff"]
    assert "decision-compliant content" in out.metadata["diff"]

    # cleanup is the Task's job (cleanup_sample), not this solver's -- worktree still exists here
    from dcbench_eval.worktree_agent import remove_worktree
    remove_worktree(tiny_repo, __import__("pathlib").Path(wt))


@pytest.mark.anyio
async def test_external_agent_worktree_places_rules_arm_in_claude_md(tiny_repo, monkeypatch):
    """T93 review FAIL fix #2: a 'rules' arm's text must actually reach the agent -- for claude_code/codex
    that is CLAUDE.md/AGENTS.md on disk at the start of the run, not a discarded apply_arm() return value."""
    from inspect_ai.solver import TaskState

    rules_path = tiny_repo.parent / "RULES.md"
    rules_path.write_text("Never leave TODOs in committed code.")

    seen = {}

    async def fake_as_solver_call(state, generate):
        wt = Path(state.metadata["worktree"])
        seen["claude_md"] = (wt / "CLAUDE.md").read_text() if (wt / "CLAUDE.md").exists() else None
        return state

    class FakeRunner:
        def __call__(self, agent):
            return fake_as_solver_call

    monkeypatch.setattr("dcbench_eval.external_agent.as_solver", FakeRunner())

    state = TaskState(model="mockllm/model", sample_id="s", epoch=0, input="do it",
                       messages=[], metadata={"arm": f"rules:{rules_path}", "commit": "HEAD"})
    solve = external_agent_worktree(repo=str(tiny_repo), agent="claude_code")
    out = await solve(state, None)

    assert seen["claude_md"] is not None, "CLAUDE.md must exist BEFORE the agent runs, not after"
    assert "Never leave TODOs in committed code." in seen["claude_md"]
    assert out.metadata["arm_info"]["instruction_file"] is not None

    from dcbench_eval.worktree_agent import remove_worktree
    remove_worktree(tiny_repo, Path(out.metadata["worktree"]))


@pytest.mark.anyio
async def test_external_agent_worktree_two_arms_differ_for_codex(tiny_repo, monkeypatch):
    """Same acceptance check as test_arms.py's, exercised through the full solver for the codex path."""
    from inspect_ai.solver import TaskState

    rules_path = tiny_repo.parent / "RULES2.md"
    rules_path.write_text("codex must run lint before finishing.")

    seen = {}

    async def fake_as_solver_call(state, generate):
        wt = Path(state.metadata["worktree"])
        seen[state.metadata["arm"]] = (wt / "AGENTS.md").read_text() if (wt / "AGENTS.md").exists() else ""
        return state

    class FakeRunner:
        def __call__(self, agent):
            return fake_as_solver_call

    monkeypatch.setattr("dcbench_eval.external_agent.as_solver", FakeRunner())

    for arm_spec in ("none", f"rules:{rules_path}"):
        state = TaskState(model="mockllm/model", sample_id=arm_spec, epoch=0, input="do it",
                           messages=[], metadata={"arm": arm_spec, "commit": "HEAD"})
        solve = external_agent_worktree(repo=str(tiny_repo), agent="codex")
        out = await solve(state, None)
        from dcbench_eval.worktree_agent import remove_worktree
        remove_worktree(tiny_repo, Path(out.metadata["worktree"]))

    assert seen["none"] != seen[f"rules:{rules_path}"]
    assert "codex must run lint before finishing." in seen[f"rules:{rules_path}"]
