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
    agent: str = "hermes",
    agent_model_config: str | None = None,
) -> Task:
    """agent: "hermes" (default here -- runs `hermes -z` through the user's own hermes subscription, no
    sandbox needed) | "claude_code" | "codex" (run the real Claude Code / Codex CLI via inspect-swe's
    maintained external-agent wrappers, in a "local" Inspect sandbox -- i.e. directly on the host against
    whatever `claude`/`codex` binary is already on PATH, no Docker, no hermes subscription; see
    external_agent.py's docstring for exactly how and why). PUBLIC USERS WITHOUT A HERMES SUBSCRIPTION
    SHOULD PASS `agent=claude_code` OR `agent=codex`; "hermes" stays the default here only so existing
    internal callers of this function are unaffected -- public docs lead with `-T agent=claude_code`."""
    rows = load_dataset(dataset)
    arm_list = arms if isinstance(arms, list) else [a.strip() for a in arms.split(",")]
    arm_specs = [a.strip() for a in arm_list if a.strip()]
    samples = build_samples(rows, arm_specs, commit=commit)
    # T90 round-2 review fix: sweep stale `mole_ab-*` worktrees left behind by a previous run that crashed
    # before any per-sample cleanup could run (see worktree_agent.py's module docstring). Once per Task
    # build, before any sample starts; a worktree younger than this is presumably still a live sample of a
    # concurrently-running eval against the same repo, so it is left alone (max_age_s=0 removes anything
    # already orphaned -- registered but stale -- not something still in flight). A generous 1h floor:
    # mole_ab samples are a single `hermes -z` run bounded by AGENT_TIMEOUT_S (20min) plus scoring, so
    # anything still registered after an hour is from a run that is no longer making progress, not a
    # concurrently-running eval against the same repo.
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
        chosen_solver = external_agent_worktree(repo=repo, agent=agent, model_config=agent_model_config)
        chosen_sandbox = "local"  # exec directly on the host (no Docker) against the user's own claude/codex binary
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
