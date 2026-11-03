---
state: integrated
owner: hermes-build
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t77-co-change-view
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T77-co-change-view
base:
reviewer: hermes-subagent deleg_96eab0c0 FAIL, deleg_aebe7ae6 PASS (fresh, claude-sonnet-5)
updated: 2026-11-03 06:52
status: ledger integrated
next: record outcome → ledger move <task> done --outcome … --resources … --prevents …
claimed: 2026-11-03 05:35
---
```notes
T77-co-change-view      ledger task (rules.md §3 code features)      project tasks
    goal                    Show who must talk to whom about which decision from git co-change (logical coupling, Cataldo/Herbsleb socio-technical congruence; code-maat 'coupling' analysis), across CODEOWNERS teams: `mole coupling [--top N] [--json]` + read-only MCP tool, each pair explained by shared commits, owners, and the decisions whose scope covers both files.
    done-when               1 prior-art note (Cataldo et al. socio-technical congruence; code-maat coupling: degree, min revs, max changeset size; Tornhill) · 2 tests first on a fixture with CODEOWNERS · 3 run on a real repo with CODEOWNERS (a public one cloned into scratch, e.g. backstage) top 20 pairs in 4 log with owners + decisions · 4 reuse packages/hotspots' git log/rename handling (one source of truth) · 5 touched packages' tests pass
    status                  2026-11-03 integrated      merge c12580f (main check green: Tests  1268 passed | 19 skipped (1287), mole-build/main-check-waveC.txt) · combined che
    next                    record outcome → ledger move <task> done --outcome … --resources … --prevents …
    pinned
    mode                    one worker
    boundary                packages/hotspots (coupling module) or new packages/coupling, daemon cli, mcp tool, tests
    checks                  npm run check
    non-goals               anything outside boundary
    proof                   4 log/
    stop                    a pair shown without its evidence (shared commits)
    came from               D69; inventory F66 (F65 shipped T70)
    links                   4 log/ledger.md (every transition + its evidence)
    harness
```
