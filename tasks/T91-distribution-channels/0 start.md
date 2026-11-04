---
state: submitted
owner: hermes-build
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t91-distribution-channels
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T91-distribution-channels
base:
reviewer:
updated: 2026-11-04 16:57
status: ledger submitted
next: fresh reviewer → ledger move <task> verified --reviewer … --findings …
claimed: 2026-11-04 15:13
---
```notes
T91-distribution-channels      ledger task (rules.md §3 code features)      project tasks
    goal                    Get Mole into more channels developers already use, beyond npm/VS Code/Open VSX/Claude Code marketplace/MCP registry: ranked by reach x effort with evidence, then build every one that needs no credentials (e.g. GitHub Action for the Marketplace, MCP directories, Cursor/Gemini/Codex configs, community plugin marketplaces, Homebrew tap, Docker MCP catalog, remote MCP)
    done-when               channels.md ranked with dated sources · each buildable channel built + tested locally · submissions that need Raymond's account listed as one checklist with exact steps · nothing pushed or published by the builder
    status                  2026-11-04 submitted      report: tasks/T91-distribution-channels/channels.md, proof 4 log/action-local-run.txt, red.txt · checks exit 0
    next                    fresh reviewer → ledger move <task> verified --reviewer … --findings …
    pinned
    mode                    one worker
    boundary                release/, scripts/, apps/, plugins/, docs/ and new channel folders in the Mole repo
    checks                  npm run check
    non-goals               anything outside boundary
    proof                   4 log/
    stop                    any publish/push/login · any claim not traced
    came from               USER 11-04 'more distibruiiton channels even our own mcp'
    links                   4 log/ledger.md (every transition + its evidence)
    harness
```
