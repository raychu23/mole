```notes
ledger (newest last, nothing deleted)
    2026-10-29 03:59      new → proposed      Team phase B (Team mode.md §5-6): a GitHub App + small TypeScript service + PostgreSQL that gives a 10-100 person team what files alone can't: webhook ingest (H
    2026-10-29 15:39      proposed → ready      owner mole-builder-9
    2026-10-29 15:47      ready → running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T33-team-server · branch ledger/t33-team-server · base 54ad899
    2026-10-29 17:54      running → submitted      report: packages/server (new): webhook ingest (HMAC verify, ack p95 1-80ms, dedupe on X-GitHub-Delivery) -> pg-boss queue -> Postgres index rebuilt from .mole/ in real git (org-scoped advisory lock) with decision graph v
    2026-10-29 17:54      checks ran: npm run check && node packages/server/dist/bench/m25.js in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T33-team-server → exit 0 ([m25] mcp leak check done 0)
    2026-10-29 18:11      submitted → running      changes requested: Fresh review round 1 (P0 must-fix): (1) tasks/T33-team-server/4 log/prior-art.md does not exist despite R0 requiring it before any commit and despite source files citing it by section and the handoff n
```
