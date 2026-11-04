#!/usr/bin/env python3
"""Inspect custom model provider: routes Inspect's model API through `hermes -z` (the Hermes CLI,
subscription -- never a paid API key, per standing rule).

Follows Inspect AI's documented Model API Extensions mechanism exactly:
https://inspect.aisi.org.uk/extensions-model-api.html (fetched 2026-11-04) -- a class deriving from
`ModelAPI` with an async `generate()`, registered by a function decorated with `@modelapi(name=...)`.
Registration is in-process here (dcbench_eval is not a published package with a setuptools entry point;
the docs' "Model Registration" section is for that case). `task.py` imports this module before `inspect
eval` resolves `hermes/<model>`, which is enough for `@modelapi` to add it to Inspect's registry.

Usage:
    inspect eval evals/inspect/dcbench_eval/task.py -T repo=... --model hermes/claude-sonnet-5

Scope: this provider is for TEXT prompt -> TEXT completion samples only (e.g. a scorer/judge call, or a
task whose "agent" is just answering a question about a diff already on disk). It is NOT what runs
dcbench: `hermes -z` is a full agent that reads/edits/tests files, not a chat completion -- there is no
"message in, text out" boundary for Inspect's generate() to wrap without reimplementing hermes's own tool
loop. For "the agent must edit files in a worktree", `worktree_agent.py`'s solver is the one mole_ab uses
(see its docstring for the inspect-swe pattern it follows). This module exists so `mole_ab` arms/scorers
that only need a single hermes text completion (e.g. a model-judge scorer) have a real, documented Inspect
integration point too, and so `inspect eval ... --model hermes/MODEL` works standalone for any user whose
task is a plain text eval (Inspect's own Task abstraction, not dcbench).
"""
from __future__ import annotations

import subprocess
from typing import Any

from inspect_ai.model import (
    ChatMessage,
    GenerateConfig,
    ModelAPI,
    ModelOutput,
    ModelUsage,
)
from inspect_ai.model._registry import modelapi
from inspect_ai.tool import ToolChoice, ToolInfo

DEFAULT_PROVIDER = "anthropic"
DEFAULT_TIMEOUT_S = 900


def _render_prompt(input: list[ChatMessage]) -> str:
    """hermes -z takes one prompt string; render the chat messages Inspect built for us into one text
    block (role-labelled) rather than dropping system/earlier-turn content on the floor."""
    parts = []
    for m in input:
        text = m.text if hasattr(m, "text") else str(m.content)
        role = getattr(m, "role", "user")
        parts.append(text if role == "user" and len(input) == 1 else f"[{role}] {text}")
    return "\n\n".join(parts)


class HermesModelAPI(ModelAPI):
    """Wraps `hermes -z PROMPT -m MODEL --provider anthropic -t "" --safe-mode` as an Inspect ModelAPI.

    `-t ""` disables hermes's own tools (this provider is for text completions; see module docstring),
    `--safe-mode` matches the standing rule for unattended runs. model_args:
      provider   hermes --provider value (default: anthropic)
      timeout    subprocess timeout in seconds (default: 900)
    """

    def __init__(
        self,
        model_name: str,
        base_url: str | None = None,
        api_key: str | None = None,
        api_key_vars: list[str] | None = None,
        config: GenerateConfig = GenerateConfig(),
        **model_args: Any,
    ) -> None:
        super().__init__(model_name, base_url, api_key, api_key_vars or [], config)
        self.provider = model_args.get("provider", DEFAULT_PROVIDER)
        self.timeout = int(model_args.get("timeout", DEFAULT_TIMEOUT_S))

    async def generate(
        self,
        input: list[ChatMessage],
        tools: list[ToolInfo],
        tool_choice: ToolChoice,
        config: GenerateConfig,
    ) -> ModelOutput:
        prompt = _render_prompt(input)
        cmd = ["hermes", "-z", prompt, "-m", self.model_name, "--provider", self.provider, "-t", "", "--safe-mode"]
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=self.timeout)
        except subprocess.TimeoutExpired as e:
            return ModelOutput.from_content(model=self.model_name, content=f"[hermes timeout after {self.timeout}s: {e}]", stop_reason="model_length")
        completion = proc.stdout.strip() if proc.returncode == 0 else f"[hermes exit {proc.returncode}: {proc.stderr[-2000:]}]"
        output = ModelOutput.from_content(model=self.model_name, content=completion)
        output.usage = ModelUsage(input_tokens=0, output_tokens=0, total_tokens=0)  # hermes -z prints no token usage on stdout
        return output


@modelapi(name="hermes")
def hermes() -> type[ModelAPI]:
    return HermesModelAPI
