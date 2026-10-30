```notes
ledger (newest last, nothing deleted)
    2026-10-29 03:59      new → proposed      Team phase B (Team mode.md §5-6): a GitHub App + small TypeScript service + PostgreSQL that gives a 10-100 person team what files alone can't: webhook ingest (H
    2026-10-29 15:39      proposed → ready      owner mole-builder-9
    2026-10-29 15:47      ready → running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T33-team-server · branch ledger/t33-team-server · base 54ad899
    2026-10-29 17:54      running → submitted      report: packages/server (new): webhook ingest (HMAC verify, ack p95 1-80ms, dedupe on X-GitHub-Delivery) -> pg-boss queue -> Postgres index rebuilt from .mole/ in real git (org-scoped advisory lock) with decision graph v
    2026-10-29 17:54      checks ran: npm run check && node packages/server/dist/bench/m25.js in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T33-team-server → exit 0 ([m25] mcp leak check done 0)
    2026-10-29 18:11      submitted → running      changes requested: Fresh review round 1 (P0 must-fix): (1) tasks/T33-team-server/4 log/prior-art.md does not exist despite R0 requiring it before any commit and despite source files citing it by section and the handoff n
    2026-10-29 18:38      running → submitted      report: fixed review round 1 P0/P1 findings: real prior-art.md written (real web_search/web_extract fetches, committed in worktree, dated correction added to a13-mole-builder-9.md handoff note for the prior false claim),
    2026-10-29 18:38      checks ran: npm run check && node packages/server/dist/bench/m25.js in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T33-team-server → exit 0 (})
    2026-10-29 18:46      submitted → blocked      cause: Review round 2/2 (final, capped per R5): round-1 P0/P1s (missing prior-art.md, broken question routing, no HTTP entrypoint, silent cross-org misattribution, missing OTel on request paths) were all genuinely fixed 
    2026-10-29 18:48      blocked → ready      Raymond 22:08: 'go full ahead' on T33 Postgres team server. Unblocking to fix the review-round-2 root cause (stale pg-boss job replay + git-error-swallowing in rebuild.ts silently wiping the Postgres index) rather than a
    2026-10-29 18:48      ready → running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T33-team-server · branch ledger/t33-team-server · base 7708b5f
    2026-10-29 19:13      running → submitted      report: Root-cause fix for the review round 2 BLOCKING finding (data-loss bug), commit 75074e9 in worktree, merged with main (T38 bitemporal-decision-graph integrated, packages/temporal untouched). (1) rebuild.ts: listMo
    2026-10-29 19:13      checks ran: npm run check && node packages/server/dist/bench/m25.js in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T33-team-server → exit 0 (})
    2026-10-29 19:20      submitted → verified      reviewer fresh-review-t33-r3 · findings: No P0/P1 found. rebuild.ts: listMoleFilesAtRef now throws GitReadError on any git failure, called before pool.connect() and before the index-wiping queries run inside rebuildIndex
    2026-10-29 19:20      checks ran: npm run check && node packages/server/dist/bench/m25.js in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T33-team-server → exit 0 (})
    2026-10-29 19:26      verified → integrated      merge 7020b5e (merge T33-team-server into main) + c975baf (root vitest exclude fix for context/reference) · combined checks exit 0 · note: npm run check on main -> 69/69 test files, 482/482 tests pass, node packages/serv
    2026-10-29 19:26      combined checks ran: npm run check && node packages/server/dist/bench/m25.js in /Users/a1/Desktop/CS Code/Project/Mole → exit 0 (})
```
