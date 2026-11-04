"""The inspect-swe-based agent option (T93): lets a PUBLIC Mole user with Claude Code or Codex installed
locally (no hermes subscription, no Docker) run `mole_ab` --

    inspect eval evals/inspect/dcbench_eval/task.py@mole_ab -T agent=claude_code ...
    inspect eval evals/inspect/dcbench_eval/task.py@mole_ab -T agent=codex ...

-- using inspect-swe's own maintained external-agent wrappers (github.com/UKGovernmentBEIS/inspect_swe,
`inspect_swe.claude_code()` / `inspect_swe.codex_cli()`, installed as inspect-swe 0.2.72 here; see
`inspect_swe/_claude_code/claude_code.py` and `inspect_swe/_codex_cli/codex_cli.py`'s own docstrings,
read directly from the installed package, for the full option set) rather than hand-rolling a second
agent runner. These wrappers are Inspect `@agent`s: they call `sandbox_agent_bridge()` internally, which
needs an Inspect *sandbox environment* to exec the agent CLI in and to serve the bridged model API from.
Unlike `worktree_agent.py`'s `hermes_worktree_agent` (hermes calls the model itself through the user's own
subscription, so it never touches Inspect's model loop or needs a sandbox at all -- see that module's
docstring), Claude Code/Codex's own API calls ARE intercepted by the bridge and served by whatever
`--model` Inspect is configured with, so the model actually billed for the run is Inspect's `--model`, not
a separate Claude/ChatGPT subscription; Claude Code/Codex themselves are only the harness here.

Sandbox choice: `sandbox="local"` (`inspect_ai.util._sandbox.local.LocalSandboxEnvironment`, registered as
`@sandboxenv(name="local")`) execs directly on the HOST, no Docker -- exactly what a public user with
`claude`/`codex` already on their PATH needs; `version="auto"` (both wrappers' default) then uses that
installed binary rather than trying to download one. This mirrors `evals/inspect/mole_eval/task.py`'s
`claude_code()` usage (T17), which instead uses a Docker sandbox (`sandbox=("docker", compose.yaml)`) --
that choice fits T17's attacker-model threat scenarios needing real isolation; mole_ab's threat model is
"run the user's own repo under their own agent", so the host-local sandbox is the right default, same
tradeoff run_dcbench.py / worktree_agent.py already make for hermes (a per-sample git worktree, not a
container, is the isolation boundary).

Isolation/cleanup: identical contract to `worktree_agent.py` -- `make_worktree`/`remove_worktree`/
`cleanup_sample` are reused as-is; this module only supplies a different way of editing the worktree's
files. `cleanup_sample` (wired as the Task's `cleanup=`) only reads `state.metadata["worktree"]`/["repo"],
so it works for either agent path with no change.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

from inspect_ai.agent import as_solver
from inspect_ai.solver import Generate, Solver, TaskState, solver
from inspect_swe import claude_code, codex_cli

from .arms import parse_arm
from .worktree_agent import make_worktree, worktree_diff

SUPPORTED_AGENTS = {"claude_code", "codex"}


def build_external_agent(agent: str, cwd: str, model_config: str | None = None) -> Any:
    """Builds the inspect_swe Agent for `agent` ("claude_code" | "codex"), rooted at `cwd` (the sample's
    worktree), running unattended (no approval prompts -- both wrappers' own defaults already do this:
    claude_code() with no `permission_mode` uses `--dangerously-skip-permissions`; codex_cli()'s default
    `approval_policy="never"` + `sandbox_mode="danger-full-access"` is the equivalent). `model_config`
    overrides the identity the CLI presents to itself (cosmetic; see each wrapper's own docstring) --
    useful when Inspect's `--model` is something the CLI's own alignment table doesn't recognise."""
    if agent == "claude_code":
        return claude_code(cwd=cwd, version="auto", model_config=model_config)
    if agent == "codex":
        return codex_cli(cwd=cwd, version="auto", model_config=model_config)
    raise ValueError(f"unknown agent {agent!r}; known: {sorted(SUPPORTED_AGENTS)}")


@solver
def external_agent_worktree(repo: str, agent: str = "claude_code", model_config: str | None = None) -> Solver:
    """Same per-sample isolation contract as `hermes_worktree_agent` (one throwaway git worktree per
    sample, same `state.metadata["worktree"/"repo"/"diff"]` keys the scorers already read), but the agent
    doing the editing is Claude Code or Codex (via inspect-swe), run through Inspect's own agent/solver
    boundary (`as_solver`) instead of a bare subprocess -- so Inspect's transcript, token usage and cost
    tracking all work natively here (unlike the hermes path, which has to record its own `--usage-file`
    since hermes never reports through Inspect's model loop at all)."""
    if agent not in SUPPORTED_AGENTS:
        raise ValueError(f"unknown agent {agent!r}; known: {sorted(SUPPORTED_AGENTS)}")
    repo_path = Path(repo)

    async def solve(state: TaskState, generate: Generate) -> TaskState:
        arm_spec = state.metadata["arm"]
        arm = parse_arm(arm_spec) if isinstance(arm_spec, str) else arm_spec
        commit = state.metadata.get("commit", "HEAD")
        wt = make_worktree(repo_path, commit)
        state.metadata["worktree"] = str(wt)
        state.metadata["repo"] = str(repo_path)
        try:
            from .arms import apply_arm

            apply_arm(arm, wt, state.input_text)  # places context in the worktree; the agent discovers
            # it itself (AGENTS.md/.claude files on disk), since -- unlike hermes -- the prompt sent to
            # Claude Code/Codex here is the sample's own input text, not a hand-assembled string: both
            # wrappers read conversation state (`state.messages`), not a return value from this function.
            agent_obj = build_external_agent(agent, cwd=str(wt), model_config=model_config)
            state = await as_solver(agent_obj)(state, generate)
            state.metadata["diff"] = worktree_diff(wt)
        except Exception as e:  # noqa: BLE001 - record and let the scorer see worktree=None for diagnosis
            state.metadata["agent_error"] = str(e)
            raise
        return state

    return solve
