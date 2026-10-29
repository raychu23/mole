"""What each arm adds to Claude Code in the sandbox (pure data; task.py applies it).

none: nothing. mole: the T15 hooks (plugins/claude-code/hooks/hooks.json, with ${CLAUDE_PLUGIN_ROOT} resolved to the tool
copy at /opt/mole) as project settings in /repo/.claude/settings.json, plus the Mole MCP server over stdio.
No credentials: only sandbox paths; the model is reached through Inspect's bridge.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[3]
HOOKS_JSON = REPO_ROOT / "plugins" / "claude-code" / "hooks" / "hooks.json"
TOOL = "/opt/mole"
SUBJECT = "/repo"


def arm_config(arm: str, tool_root: str = TOOL, repo: str = SUBJECT) -> dict[str, Any]:
    if arm == "none":
        return {"settings": None, "mcp": [], "env": {}}
    if arm != "mole":
        raise ValueError(f"unknown arm {arm!r}")
    plugin_root = f"{tool_root}/plugins/claude-code"
    raw = HOOKS_JSON.read_text().replace("${CLAUDE_PLUGIN_ROOT}", plugin_root)
    hooks = json.loads(raw)["hooks"]
    env = {
        "MOLE_BIN": f"{tool_root}/packages/daemon/dist/cli.js",
        # unattended run: nobody reads the Stop hook's systemMessage, so hand Mole's questions to Claude (T15 option)
        "MOLE_STOP_CONTINUE": "1",
        "CLAUDE_PLUGIN_DATA": "/tmp/mole-plugin-data",
    }
    return {
        "settings": {"hooks": hooks, "env": env},
        "mcp": [{"name": "mole", "command": "node", "args": [f"{tool_root}/packages/mcp/dist/cli.js"],
                 "env": {"MOLE_ROOT": repo, "MOLE_STATE_DIR": "/tmp/mole-mcp-state"}}],
        "env": env,
    }
