"""Red-first (T90 follow-up): the `hermes` Inspect model provider must register under @modelapi and call
the documented command. No real model call here (subprocess.run is monkeypatched); a real end-to-end run
is proven separately in tasks/T90-ab-experiment-system/4 log/."""
from __future__ import annotations

import subprocess

import pytest

inspect_ai = pytest.importorskip("inspect_ai")

from inspect_ai.model import get_model  # noqa: E402

import dcbench_eval.hermes_provider as hermes_provider  # noqa: E402,F401 (registers "hermes" on import)


def test_hermes_provider_is_registered_and_callable(monkeypatch):
    captured = {}

    def fake_run(cmd, capture_output=None, text=None, timeout=None):
        captured["cmd"] = cmd
        return subprocess.CompletedProcess(cmd, 0, stdout="42", stderr="")

    monkeypatch.setattr(subprocess, "run", fake_run)
    model = get_model("hermes/claude-sonnet-5", config=inspect_ai.model.GenerateConfig())
    assert model is not None
    cmd = captured  # populated lazily on first generate(); registration alone must not call hermes
    assert "cmd" not in cmd


@pytest.mark.anyio
async def test_hermes_provider_generate_calls_cli_and_returns_output(monkeypatch):
    from inspect_ai.model import ChatMessageUser, GenerateConfig
    from inspect_ai.tool import ToolChoice

    captured = {}

    def fake_run(cmd, capture_output=None, text=None, timeout=None):
        captured["cmd"] = cmd
        return subprocess.CompletedProcess(cmd, 0, stdout="the answer is 42\n", stderr="")

    monkeypatch.setattr(subprocess, "run", fake_run)
    model = get_model("hermes/claude-sonnet-5", config=GenerateConfig())
    out = await model.api.generate([ChatMessageUser(content="what is 6*7?")], [], "none", GenerateConfig())
    assert out.completion.strip() == "the answer is 42"
    cmd = captured["cmd"]
    assert cmd[:2] == ["hermes", "-z"]
    assert "--safe-mode" in cmd
    assert "--provider" in cmd and "anthropic" in cmd
