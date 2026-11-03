---
state: integrated
owner: codex-capture
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: build/t51-capture-1102
worktree: /Users/a1/.hermes/cache/scratch/mole-build/T51
base: 0029416
reviewer: hermes-subagent deleg_aea3aa68 (fresh, claude-sonnet-5)
updated: 2026-11-02 18:15
status: ledger integrated
next: record outcome → ledger move <task> done --outcome … --resources … --prevents …
claimed: 2026-11-02 16:54
---
```notes
T51-capture-cli-dedupe      ledger task (rules.md §3 code features)      project tasks
    goal                    adr-tools-style record workflow (mole decision new / supersede / link writing both sides atomically) + Graphiti-style deterministic fuzzy dedupe (exact + MinHash/LSH, no LLM stage) for multi-source records. Source: Project/Mole/context/product-plan/systems/core-audit/capture-records-schema.md top 3-4.
    done-when               1 failing tests first · 2 supersede updates both records in one write · 3 near-duplicate imports flagged, not merged silently · 4 npm run check
    status                  2026-11-02 integrated      merge 68a0af7 (main check 925 pass, /Users/a1/.hermes/cache/scratch/mole-build/main-check-t51-r2.txt) · combined checks
    next                    record outcome → ledger move <task> done --outcome … --resources … --prevents …
    pinned
    mode                    one worker
    boundary                packages/decisions/src/cli.ts plus capture modules/tests, no edits to cascade, argdown, reasoning or shared manifests without reporting
    checks                  npm run check
    non-goals               No commits/push/deploy, no model APIs, no runtime .mole writes in main, no silent duplicate merge, no new dependency unless justified and approved.
    proof                   5 fetched primary sources and fit analysis, observed red/green test output, CLI smoke checks and rollback/recovery tests.
    stop                    Stop on data loss/ambiguous transactions or inability to keep main unchanged, report repeated failures rather than loosening tests.
    came from               core audit 11-01
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
