---
state: proposed
owner: hermes-build
repo:
branch:
worktree:
base:
reviewer:
updated: 2026-11-03 19:00
status: ledger proposed
next: fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
---
```notes
T85-mole-cli-bundle      ledger task (rules.md §3 code features)      project tasks
    goal                    One installable `mole` CLI + MCP server for people outside this repo: a single public npm package bundled with esbuild (same approach as apps/vscode/esbuild.mjs, which already bundles the daemon), exposing `mole` (daemon CLI) and `mole-mcp` (MCP stdio server) bins; native deps (better-sqlite3) handled the way the vsix does or made optional with a clear message; name chosen after checking npm availability, reversible. Not published: npm pack + install the tarball into a clean temp dir + run the bins and an MCP initialize handshake from there.
    done-when               1 prior-art note (how comparable CLIs ship a bundled TS monorepo) · 2 test first: pack, install into a clean dir, run bins · 3 tarball size + node engines stated · 4 README install section · 5 npm run check passes
    status                  2026-11-03 proposed
    next                    fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
    pinned
    mode                    one worker
    boundary                packages/cli-dist (new) or scripts/dist, root package.json scripts, README, tests
    checks                  npm run check
    non-goals               publishing anything; logins
    proof                   4 log/
    stop                    publishing to npm or claiming it works outside the repo without the clean-dir test
    came from               USER 11-03 12:40 deployment to vscode extensions, claude code plugins, other distributions; systems/full-build/distribution 11-03.md
    links                   4 log/ledger.md (every transition + its evidence)
    harness
```
