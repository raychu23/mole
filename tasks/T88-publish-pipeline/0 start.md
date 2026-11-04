---
state: verified
owner: hermes-build
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t88-publish-pipeline
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T88-publish-pipeline
base:
reviewer: hermes-subagent deleg_74258246 FAIL, deleg_0ecbf02b PASS (fresh, claude-sonnet-5)
updated: 2026-11-04 01:56
status: ledger verified
next: merge → ledger move <task> integrated --merge … (ledger reruns checks in the repo)
claimed: 2026-11-03 22:26
---
```notes
T88-publish-pipeline      ledger task (rules.md §3 code features)      project tasks
    goal                    Everything publishing needs except Raymond's tokens (D100): VS Code extension 0.5.0 with T64-T85 features (rebuild, install-check, CHANGELOG), one `scripts/publish-all.sh` that builds then publishes mole-code to npm, the vsix to the VS Code Marketplace and Open VSX, and the MCP registry entry, each token read from a hidden prompt (never echoed, never stored), with a --dry-run that does every step except the final publish calls; MCP registry server.json (official schema, npm package mole-code, mole-mcp); a GitHub Actions workflow building the team-server container to GHCR on tag; release notes. Nothing published by the builder.
    done-when               1 prior-art: official docs for vsce, ovsx, npm publish (provenance), MCP registry server.json + mcp-publisher, GHCR (fetched, dated) · 2 publish-all.sh --dry-run passes end to end on this machine (npm publish --dry-run, vsce package, ovsx verify where possible, server.json schema-validated) · 3 vsix 0.5.0 install-check passes · 4 workflow lint (actionlint if available, else yaml parse) · 5 npm run check passes
    status                  2026-11-04 verified      reviewer hermes-subagent deleg_74258246 FAIL, deleg_0ecbf02b PASS (fresh, claude-sonnet-5) · findings: CRITICAL npm toke
    next                    merge → ledger move <task> integrated --merge … (ledger reruns checks in the repo)
    pinned
    mode                    one worker
    boundary                apps/vscode (version, CHANGELOG), scripts/publish-all.sh, server.json, .github/workflows/release-container.yml, release notes
    checks                  npm run check
    non-goals               publishing, logins
    proof                   4 log/
    stop                    any token typed, echoed or stored; any real publish
    came from               USER 11-03 22:20: distribution all the way, publicly accessible, easy demos + intros, sell the USPs; D98-D100
    links                   4 log/ledger.md (every transition + its evidence)
    harness
```
