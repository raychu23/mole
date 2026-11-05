"""The generic Inspect Task `mole_ab` (T90 follow-up to the FAIL review): parameterised by repo, a JSONL
dataset of task prompts, named arms (context variants) and a scorer -- so any Mole user can ask "does
adding decision X change what my agent does?" against their OWN repo, not just dcbench.

    inspect eval evals/inspect/dcbench_eval/task.py -T repo=/path/to/repo \
        -T dataset=/path/to/tasks.jsonl -T arms=none,decisions=.mole/decisions -T scorer=mole_check

dataset JSONL: one object per line, {"id": "...", "prompt": "..."} (plus any extra keys, kept as sample
metadata -- dcbench_scorer reads "task_id" this way).

arms: comma-separated ArmConfig strings (see arms.py): none | rules:PATH | decisions:PATH |
plugin_pin:SHA:PATH. Every (dataset row) x (arm) pair becomes one Sample, same prompt, same model, same
pinned commit -- the only thing that differs between arms is the context placed in front of the agent,
exactly run_dcbench.py's A/R/M design generalised.

scorer: "mole_check" (generic, any repo -- scorers.mole_check_scorer) or "dcbench" (scorers.dcbench_scorer,
needs -T dcbench_repo=PATH too).
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from inspect_ai import Task, task
from inspect_ai.dataset import MemoryDataset, Sample

# `inspect eval evals/inspect/dcbench_eval/task.py@mole_ab ...` loads this file by PATH (SourceFileLoader,
# no package context -- see inspect_ai/_util/module.py), so a relative `from .scorers import ...` fails
# with "No module named '<path>'" (confirmed: tasks/T90-ab-experiment-system/4 log/). Same fix reanalyze.py
# already uses: put dcbench_eval's parent on sys.path and import it as the real top-level package, so its
# OWN internal relative imports (worktree_agent.py's `from .arms import ...`) still resolve normally.
EVAL_DIR = Path(__file__).resolve().parents[1]
if str(EVAL_DIR) not in sys.path:
    sys.path.insert(0, str(EVAL_DIR))

from dcbench_eval.external_agent import SUPPORTED_AGENTS, external_agent_worktree  # noqa: E402
from dcbench_eval.scorers import dcbench_scorer, mole_check_scorer  # noqa: E402
from dcbench_eval.worktree_agent import (  # noqa: E402
    DEFAULT_MODEL,
    DEFAULT_PROVIDER,
    cleanup_sample,
    hermes_worktree_agent,
    prune_stale_worktrees,
)

TIME_LIMIT_S = 1800
DOCKER_COMPOSE_PATH = EVAL_DIR / "dcbench_eval" / "compose.yaml"


def load_dataset(path: str) -> list[dict]:
    rows = [json.loads(line) for line in Path(path).read_text().splitlines() if line.strip()]
    for r in rows:
        if "id" not in r or "prompt" not in r:
            raise ValueError(f"mole_ab dataset row missing 'id' or 'prompt': {r}")
    return rows


def build_samples(rows: list[dict], arm_specs: list[str], commit: str = "HEAD") -> list[Sample]:
    out = []
    for row in rows:
        for arm in arm_specs:
            meta = {k: v for k, v in row.items() if k not in ("id", "prompt")}
            meta.update({"arm": arm, "commit": commit, "row_id": row["id"]})
            out.append(Sample(id=f"{row['id']}-{arm}", input=row["prompt"], metadata=meta))
    return out


@task
def mole_ab(
    repo: str,
    dataset: str,
    arms: str | list[str] = "none,decisions:.mole/decisions",
    scorer: str = "mole_check",
    model: str = DEFAULT_MODEL,
    provider: str = DEFAULT_PROVIDER,
    commit: str = "HEAD",
    dcbench_repo: str | None = None,
    mole_bin: str | None = None,
    agent: str = "claude_code",
    agent_model_config: str | None = None,
    sandbox: str = "docker",
    mole_package: str | None = None,
) -> Task:
    """agent: "claude_code" (DEFAULT -- real Claude Code via inspect-swe's maintained external-agent
    wrapper, no hermes subscription needed) | "codex" (same idea, OpenAI's Codex CLI) | "hermes" (opt-in
    only: runs `hermes -z` through a hermes subscription; raises a clear error naming `agent=claude_code`/
    `codex` instead of a raw FileNotFoundError if `hermes` is not on PATH -- see worktree_agent.run_hermes).
    T93 review FAIL fix #4: this used to default to "hermes", which public users without a hermes
    subscription cannot run at all; claude_code/codex need only the CLI itself, already on most developers'
    machines.

    sandbox: only consulted for agent="claude_code"/"codex" (hermes never needs a sandbox -- see
    worktree_agent.py's docstring). "docker" (DEFAULT, T93 review FAIL fix #3): Inspect's "local" sandbox
    execs sandbox_agent_bridge() directly on the host, which inspect-ai's own sandbox tool-injection code
    only implements for Linux (`Tool support injection is not implemented for OS: Darwin` on macOS -- see
    external_agent.py's docstring); "docker" (this repo's evals/inspect/dcbench_eval/compose.yaml, a small
    Debian + git + node22 image) runs a real Linux container instead and works on any host Docker runs on.
    "local" is still available (faster, no Docker) for a Linux host/CI runner where the limitation above
    does not apply.

    mole_package: T93 round-2 review HIGH fix -- only consulted for a 'decisions' arm under agent=
    claude_code. A locally built `release/mole-code` tarball path (`node tools/build.mjs && npm pack`
    there) or an http(s) URL for the real `mole-code` npm package (D97: CLI + MCP + Claude Code plugin,
    dist/ included) that gets installed INSIDE the sample's worktree before the agent runs, so the plugin's
    SessionStart/PreToolUse/Stop hooks actually resolve the Mole CLI (previously a bare source copy with no
    dist/ made every hook silently no-op while still reporting success). None defaults to the public GitHub
    latest-release tarball (arms.DEFAULT_MOLE_PACKAGE_URL; must include the D102 blocking hooks, checked by the preflight) until `mole-code` is published to the npm registry.
    """
    rows = load_dataset(dataset)
    arm_list = arms if isinstance(arms, list) else [a.strip() for a in arms.split(",")]
    arm_specs = [a.strip() for a in arm_list if a.strip()]
    samples = build_samples(rows, arm_specs, commit=commit)
    # T90 round-2 review fix: sweep stale `mole_ab-*` worktrees left behind by a previous run that crashed
    # before any per-sample cleanup could run (see worktree_agent.py's module docstring). Once per Task
    # build, before any sample starts. T93 round-2 review MEDIUM fix: "stale" now means "no live-run lock
    # (pid) owns it" (prune_stale_worktrees checks this first); max_age_s is only the fallback floor for a
    # worktree with no lock file at all (one made before that fix, or whose lock write failed) -- kept at an
    # hour for that legacy case, same reasoning as before (mole_ab samples are bounded by AGENT_TIMEOUT_S
    # plus scoring, so anything still unlocked after an hour is not a concurrently-running eval).
    prune_stale_worktrees(Path(repo), max_age_s=3600)
    if scorer == "mole_check":
        chosen_scorer = mole_check_scorer(mole_bin=mole_bin, root=repo)
    elif scorer == "dcbench":
        if not dcbench_repo:
            raise ValueError("scorer='dcbench' needs -T dcbench_repo=PATH")
        chosen_scorer = dcbench_scorer(dcbench_repo=dcbench_repo)
    else:
        raise ValueError(f"unknown scorer {scorer!r}; known: mole_check, dcbench")
    if agent == "hermes":
        chosen_solver = hermes_worktree_agent(repo=repo, model=model, provider=provider)
        chosen_sandbox = None
    elif agent in SUPPORTED_AGENTS:
        if sandbox == "docker":
            # see compose.yaml's own comment: it bind-mounts ${MOLE_AB_REPO_DIR} (set here, read by
            # `docker compose` when Inspect builds the sandbox) so worktrees created under
            # <repo>/.mole_ab_worktrees are visible inside the container at the identical host path.
            repo_abs = str(Path(repo).resolve())
            os.environ["MOLE_AB_REPO_DIR"] = repo_abs
            worktrees_root = str(Path(repo_abs) / ".mole_ab_worktrees")
            chosen_solver = external_agent_worktree(repo=repo, agent=agent, model_config=agent_model_config, worktrees_root=worktrees_root, mole_package=mole_package)
            chosen_sandbox = ("docker", str(DOCKER_COMPOSE_PATH))
        elif sandbox == "local":
            chosen_solver = external_agent_worktree(repo=repo, agent=agent, model_config=agent_model_config, mole_package=mole_package)
            chosen_sandbox = "local"  # exec directly on the host against the user's own claude/codex binary
        else:
            raise ValueError(f"unknown sandbox {sandbox!r}; known: docker, local")
    else:
        raise ValueError(f"unknown agent {agent!r}; known: hermes, {', '.join(sorted(SUPPORTED_AGENTS))}")
    return Task(
        dataset=MemoryDataset(samples),
        solver=chosen_solver,
        scorer=chosen_scorer,
        cleanup=cleanup_sample,
        sandbox=chosen_sandbox,
        time_limit=TIME_LIMIT_S,
    )
