---
state: running
owner: hermes-build
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t92-agent-compliance-hooks
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T92-agent-compliance-hooks
base:
reviewer:
updated: 2026-11-04 15:40
status: ledger running
next: worker finishes → ledger move <task> submitted --report … (ledger runs the checks row)
claimed: 2026-11-04 15:40
---
```notes
T92-agent-compliance-hooks      ledger task (rules.md §3 code features)      project tasks
    goal                    Make Mole's Claude Code hooks enforce accepted decisions using the hooks contract Anthropic documents: Stop blocks (decision block + reason, bounded retries) on crisp-rule violations by default, PreToolUse denies an edit that introduces one; by-meaning matches stay advisory; plus CLI --help matches the commands, AGENTS.md precedence sentence, README CI snippet
    done-when               prior-art (Anthropic hooks docs fetched + dated, how cc hooks projects do blocking) · tests first: a seeded violation makes stop.mjs emit a block decision and pre-tool-use.mjs deny; no loop past the retry cap; opt-out env works · --help lists every dispatched subcommand (test derives from the dispatcher) · npx vitest on plugins/claude-code + daemon green
    status                  2026-11-04 running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T92-agent-compliance-hooks · branch ledger/t92-agent-complianc
    next                    worker finishes → ledger move <task> submitted --report … (ledger runs the checks row)
    pinned
    mode                    one worker
    boundary                plugins/claude-code, release/mole-code hook copies, packages/daemon/src/cli.ts help text, scripts/public-README.md, docs/
    checks                  npm run check
    non-goals               anything outside boundary
    proof                   4 log/
    stop                    blocking on by-meaning (model/heuristic) matches · touching the pinned M+J copy
    came from               D102, UX research 11-04
    links                   4 log/ledger.md (every transition + its evidence)
    harness
```
