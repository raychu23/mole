"""The Inspect solver that runs the REAL hermes agent against a per-sample git worktree (T90 follow-up:
the FAIL review found nothing in this package imported inspect_ai; this is the piece that does the actual
work mole_ab needs, since hermes -z edits files itself and so cannot run inside Inspect's plain
generate()/ModelAPI boundary -- see hermes_provider.py's docstring for why that boundary doesn't fit here).

Pattern borrowed from inspect-swe's external-agent wrapper (github.com/UKGovernmentBEIS/inspect_swe,
`inspect_swe/_claude_code/agent.py`, used in this repo already by evals/inspect/mole_eval/task.py's
`claude_code()`): an Inspect `@solver` owns the agent's lifecycle (setup, run, teardown) and the SAMPLE's
isolation boundary, while the agent itself (there: Claude Code in a Docker container; here: `hermes -z` in
a dedicated git worktree) does its own file edits and tool calls outside Inspect's model loop. inspect-swe
needs a model BRIDGE because Claude Code calls an LLM API Inspect must intercept to log/score/limit;
`hermes -z --provider anthropic` does not need that bridge because it IS the thing that calls the model
(through Raymond's hermes subscription, per the standing rule), so the solver just runs it as a subprocess
and lets Inspect log the resulting transcript/usage/diff the same way a tool call would be logged.

Isolation: one `git worktree add --detach <pinned commit, default HEAD>` per sample under a temp dir,
removed by the SCORER after scoring (the diff must still be on disk when the scorer runs). Per AGENTS.md:
never write into a live `.mole/` of a real repo -- the worktree is always a throwaway path under
tempfile.mkdtemp(), never the repo's own working tree.
"""
from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

from inspect_ai.model import ChatMessageAssistant
from inspect_ai.solver import Generate, Solver, TaskState, solver

from .arms import ArmConfig, apply_arm, parse_arm

DEFAULT_MODEL = "claude-sonnet-5"
DEFAULT_PROVIDER = "anthropic"
AGENT_TIMEOUT_S = 1200


def make_worktree(repo: Path, commit: str = "HEAD") -> Path:
    wt = Path(tempfile.mkdtemp(prefix="mole_ab-"))
    shutil.rmtree(wt)  # git worktree add refuses an existing non-empty dir; mkdtemp gave us a unique name
    r = subprocess.run(["git", "-C", str(repo), "worktree", "add", "-q", "--detach", str(wt), commit], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"git worktree add failed for {repo} @ {commit}: {r.stderr}")
    return wt


def remove_worktree(repo: Path, wt: Path) -> None:
    subprocess.run(["git", "-C", str(repo), "worktree", "remove", "--force", str(wt)], capture_output=True)
    shutil.rmtree(wt, ignore_errors=True)


def run_hermes(prompt: str, cwd: Path, model: str, provider: str, usage_path: Path, timeout: int = AGENT_TIMEOUT_S) -> tuple[int, str, str, float]:
    # -t "terminal,file" (not "" -- that is hermes_provider.py's text-only mode): this solver's whole point
    # is an agent that can edit files, same tool set run_dcbench.py uses for the identical reason.
    cmd = ["hermes", "-z", prompt, "-m", model, "--provider", provider, "-t", "terminal,file", "--safe-mode",
           "--usage-file", str(usage_path), "--in", str(cwd)]
    t0 = time.time()
    try:
        p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout)
        return p.returncode, p.stdout, p.stderr, time.time() - t0
    except subprocess.TimeoutExpired:
        return -1, "", f"TIMEOUT after {timeout}s", time.time() - t0


def worktree_diff(wt: Path) -> str:
    """Full diff, INCLUDING untracked new files. Plain `git diff` only shows tracked content, so an agent
    that implements a decision entirely inside a newly-created file is invisible to any scorer or
    rescoring reading this diff later -- the exact bug error-analysis-72.md found in dcbench's own scorer
    (60/111 = 54% of T63's failed gotchas, orchestrator-verified 2026-11-04): grep_diff reads plain `git
    diff`, which never shows new-file content. Fix: `git add --intent-to-add --all` (`git add -N`) first --
    per git-add(1), this stages the FACT that a path will be added without staging its bytes, which is
    enough for `git diff` to show the new file's full content as an addition
    (https://git-scm.com/docs/git-add, "--intent-to-add"). Every mole_ab run stores this diff in sample
    metadata, which Inspect's .eval log persists -- so, unlike T63 (whose runs.jsonl kept only
    diffFiles/untracked name lists, never diff text; error-analysis-72.md's "Data available" note), any
    mole_ab run can be rescored later from its log alone.
    """
    subprocess.run(["git", "-C", str(wt), "add", "--intent-to-add", "--all"], capture_output=True)
    r = subprocess.run(["git", "-C", str(wt), "diff"], capture_output=True, text=True)
    return r.stdout


@solver
def hermes_worktree_agent(repo: str, model: str = DEFAULT_MODEL, provider: str = DEFAULT_PROVIDER) -> Solver:
    """repo: path to the real git repo the task operates on; the agent runs in a throwaway worktree off it,
    never the live working tree."""
    repo_path = Path(repo)

    async def solve(state: TaskState, generate: Generate) -> TaskState:
        arm_spec = state.metadata["arm"]
        arm = parse_arm(arm_spec) if isinstance(arm_spec, str) else arm_spec
        commit = state.metadata.get("commit", "HEAD")
        wt = make_worktree(repo_path, commit)
        state.metadata["worktree"] = str(wt)
        state.metadata["repo"] = str(repo_path)
        try:
            prompt = state.input_text
            prompt = apply_arm(arm, wt, prompt)
            usage_path = wt.parent / f"{wt.name}.usage.json"
            rc, out, err, seconds = run_hermes(prompt, wt, model, provider, usage_path)
            state.metadata["agent_rc"] = rc
            state.metadata["agent_seconds"] = round(seconds, 2)
            state.metadata["agent_stdout_tail"] = out[-2000:]
            state.metadata["agent_stderr_tail"] = err[-2000:]
            try:
                state.metadata["usage"] = json.loads(usage_path.read_text()) if usage_path.exists() else {}
            except Exception:  # noqa: BLE001
                state.metadata["usage"] = {}
            state.metadata["diff"] = worktree_diff(wt)
            state.messages.append(ChatMessageAssistant(content=out[-4000:] or f"(hermes exit {rc}, no stdout)"))
        except Exception as e:  # noqa: BLE001 - record and let the scorer see worktree=None for diagnosis
            state.metadata["agent_error"] = str(e)
            raise
        return state

    return solve
