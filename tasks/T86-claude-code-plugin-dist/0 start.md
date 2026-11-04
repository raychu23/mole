---
state: ready
owner: hermes-build
repo:
branch:
worktree:
base:
reviewer:
updated: 2026-11-03 19:01
status: ledger ready
next: worker claims it → ledger move <task> running --orca | --git-worktree | --worktree PATH
---
```notes
T86-claude-code-plugin-dist      ledger task (rules.md §3 code features)      project tasks
    goal                    Make the Claude Code plugin installable outside this repo: plugins/claude-code/.mcp.json and the hook scripts reach ../../packages/... (repo checkout only). Use the official plugin + marketplace format (.claude-plugin/marketplace.json, ${CLAUDE_PLUGIN_ROOT}), make the plugin self-contained (bundled CLI/MCP inside the plugin dir built by a script), add marketplace.json, bump version, test from a clean temp dir: hook scripts with sample stdin + MCP initialize handshake.
    done-when               1 prior-art note from the official docs (fetched, dated) · 2 test first: clean-dir smoke script · 3 plugin.json/marketplace.json validate against the documented schema · 4 export-public allowlist includes what the marketplace needs · 5 npm run check passes
    status                  2026-11-03 ready      owner hermes-build
    next                    worker claims it → ledger move <task> running --orca | --git-worktree | --worktree PATH
    pinned
    mode                    one worker
    boundary                plugins/claude-code/**, .claude-plugin/marketplace.json, scripts/export-public.mjs allowlist, tests
    checks                  npm run check
    non-goals               publishing anything; logins
    proof                   4 log/
    stop                    a plugin that still needs the repo checkout
    came from               USER 11-03 12:40 deployment to vscode extensions, claude code plugins, other distributions; systems/full-build/distribution 11-03.md
    links                   4 log/ledger.md (every transition + its evidence)
    harness
```
