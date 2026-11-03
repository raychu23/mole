---
state: running
owner: hermes-build
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t69-one-store
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T69-one-store
base:
reviewer:
updated: 2026-11-03 01:54
status: ledger running
next: worker finishes → ledger move <task> submitted --report … (ledger runs the checks row)
claimed: 2026-11-03 01:54
---
```notes
T69-one-store      ledger task (rules.md §3 code features)      project tasks
    goal                    One authoritative decision store: the team server writes and reads decisions through @mole/temporal (tenant-scoped current + as-of) instead of its own second Postgres model; plus a runnable deployment (docker compose: postgres + team server, env-configured). First the F62 spike: real Graphiti on the same small corpus if runnable here, else NOT RUN with reason.
    done-when               1 prior-art note (Graphiti bi-temporal edges, XTDB/Datomic as-of, ai-memory) · 2 spike result or NOT RUN recorded · 3 tests first: a server-approved revision is readable via temporal current + asOf for its tenant only · 4 server PR-check latency test unchanged · 5 docker compose up -> health endpoint answers (or documented why docker is unavailable) · 6 server + temporal tests pass
    status                  2026-11-03 running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T69-one-store · branch ledger/t69-one-store · base ?
    next                    worker finishes → ledger move <task> submitted --report … (ledger runs the checks row)
    pinned
    mode                    one worker
    boundary                packages/server, packages/temporal, deploy/ (new), tests
    checks                  npm run check
    non-goals               anything outside boundary
    proof                   4 log/
    stop                    PR-check latency regresses -> keep separate + reconciliation job, documented
    came from               D50, backlog store-spike + store-join; inventory F62 F63; USER 11-03 strong system deployment
    links                   4 log/ledger.md (every transition + its evidence)
    harness
```
