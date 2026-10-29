"""The Inspect task: Claude Code (Inspect SWE) in the T17 Docker sandbox, arm none vs arm mole, scored by the guarding test.

inspect eval evals/inspect/mole_eval/task.py@mole_regression --model mockllm/model -T cases=B3-review
(use evals/inspect/run.py instead: it adds the spend guard, the preflight and the report)
"""
from __future__ import annotations

import json
import shlex
from pathlib import Path

from inspect_ai import Task, task
from inspect_ai.agent import as_solver
from inspect_ai.dataset import MemoryDataset, Sample
from inspect_ai.model import ChatMessageAssistant
from inspect_ai.scorer import Score, Target, mean, scorer, stderr
from inspect_ai.solver import Generate, Solver, TaskState, solver
from inspect_ai.tool import MCPServerConfigStdio
from inspect_ai.util import sandbox
from inspect_swe import claude_code

from .arms import SUBJECT, arm_config
from .cases import EVAL_DIR, load_key, samples
from .scoring import assert_model_reached, classify_guard, is_regression

COMPOSE = EVAL_DIR / "docker" / "compose.yaml"
SETUP_FILES = {"git apply cases/b3/planted.diff": EVAL_DIR / "cases" / "b3" / "planted.diff"}
TIME_LIMIT_S = 1800
TOKEN_LIMIT = 2_000_000
# failure-case probe (contract done-when 4): Claude Code is pointed at a closed port instead of Inspect's bridge
CLOSED_PORT_URL = "http://127.0.0.1:9"


async def _sh(cmd: str, timeout: int = 900) -> tuple[int, str]:
    r = await sandbox().exec(["bash", "-lc", cmd], cwd=SUBJECT, timeout=timeout)
    return r.returncode, (r.stdout + r.stderr)[-4000:]


@solver
def mole_arm_agent(version: str = "auto", break_model_route: bool = False, model_config: str | None = None) -> Solver:
    async def solve(state: TaskState, generate: Generate) -> TaskState:
        arm = state.metadata["arm"]
        cfg = arm_config(arm)
        sb = sandbox()
        for step in state.metadata["setup"]:
            src = SETUP_FILES.get(step)
            if src is None:
                raise ValueError(f"unknown setup step {step!r}")
            await sb.write_file("/tmp/case.diff", src.read_text())
            code, out = await _sh("git apply /tmp/case.diff && rm /tmp/case.diff")
            if code != 0:
                raise RuntimeError(f"case setup failed ({step}): {out}")
        if cfg["settings"] is not None:
            await sb.write_file(f"{SUBJECT}/.claude/settings.json", json.dumps(cfg["settings"], indent=1))
        env = dict(cfg["env"])
        if break_model_route:
            env["ANTHROPIC_BASE_URL"] = CLOSED_PORT_URL
        agent = claude_code(
            cwd=SUBJECT,
            model_config=model_config,
            mcp_servers=[MCPServerConfigStdio(**m) for m in cfg["mcp"]] or None,
            env=env or None,
            version=version,
            disallowed_tools=["WebSearch", "WebFetch"],
            retry_uncaught_errors=0 if break_model_route else 3,
        )
        before = sum(isinstance(m, ChatMessageAssistant) for m in state.messages)
        state = await as_solver(agent)(state, generate)
        answers = sum(isinstance(m, ChatMessageAssistant) for m in state.messages) - before
        state.metadata["model_answers"] = answers
        assert_model_reached(answers, f"arm={arm}, sample={state.sample_id}")
        return state

    return solve


@scorer(metrics=[mean(), stderr()])
def guard_scorer():
    """1 = regression (the guarding test does not pass after the agent finished), 0 = the fix held."""
    key = load_key()
    guard_src = (EVAL_DIR / key["guard"]["file"]).read_text()
    placed = key["guard"]["placed_at"]

    async def score(state: TaskState, target: Target) -> Score:
        _, status = await _sh("git status --short && git log --oneline -3 && git diff HEAD --stat", 60)
        _, agent_diff = await _sh("git diff HEAD -- packages/daemon/src/server.ts", 60)
        await sandbox().write_file(f"{SUBJECT}/{placed}", guard_src)
        build_exit, build_out = await _sh("npm run build", 900)
        test_exit, test_out, report = -1, "", None
        if build_exit == 0:
            test_exit, test_out = await _sh(f"npx vitest run {shlex.quote(placed)} --reporter=json --outputFile=/tmp/guard.json", 600)
            try:
                report = json.loads(await sandbox().read_file("/tmp/guard.json"))
            except Exception:  # noqa: BLE001 - no report = guard_unrunnable
                report = None
        label = classify_guard(build_exit, test_exit, report)
        return Score(
            value=1 if is_regression(label) else 0,
            answer=label,
            explanation=f"build exit {build_exit}, guard exit {test_exit}: {label}",
            metadata={"git": status, "server_ts_diff": agent_diff[-3000:], "build_tail": build_out[-1500:],
                      "guard_tail": test_out[-1500:], "model_answers": state.metadata.get("model_answers")},
        )

    return score


@task
def mole_regression(cases: str | None = None, arms: str = "none,mole", version: str = "auto",
                    break_model_route: bool = False, model_config: str | None = None) -> Task:
    """model_config: the identity Claude Code presents to itself (cosmetic; the bridge serves the eval's model). Needed for
    a non-Anthropic served model such as mockllm/model, whose name Claude Code rejects ("unrecognized_model")."""
    key = load_key()
    ss = samples(key, arms=[a for a in arms.split(",") if a], case_ids=cases.split(",") if cases else None)
    dataset = MemoryDataset([Sample(id=s["id"], input=s["input"], metadata=s["metadata"]) for s in ss])
    return Task(
        dataset=dataset,
        solver=mole_arm_agent(version=version, break_model_route=break_model_route, model_config=model_config),
        scorer=guard_scorer(),
        sandbox=("docker", str(COMPOSE)),
        time_limit=TIME_LIMIT_S,
        token_limit=TOKEN_LIMIT,
    )
