---
state: built, needs review
owner: wave-g-agent-g3
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t98-server-slo
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T98-server-slo
base: 980e6a6
status: built, not yet reviewed or integrated
next: adversarial review (sdlc 4-verify/4-adversarial-review), then ledger integrate
---
```notes
T98-server-slo          wave G task G3 (backend-engineering evidence, recruiter + real users)
    goal                 packages/server (webhook intake, pg-boss queue, transactional outbox,
                          OAuth MCP, OTel) -> production reliability: graceful SIGTERM shutdown,
                          outbox relay actually wired into the running server (retry + backoff
                          + dead-letter), /healthz + /readyz split from /health, request
                          timeouts. Load-tested on this Mac with real numbers, machine specs
                          stated, SLO targets vs measured kept separate.
    done-when             see docs/server-slo.md Audit table (4/4 picked gaps fixed + tested)
                          + 4 log/load.md (3-phase load test: webhook ack, decisions query,
                          queue-drain throughput) + 4 log/green.txt (every touched test file
                          passes individually) + 4 log/red.txt (tsc fails against pre-change
                          index.ts/outbox.ts -- proves the new tests aren't vacuous)
    status                2026-11-05 built on branch ledger/t98-server-slo, NOT merged/reviewed.
                          npx tsc -b packages/server clean. Every test file in
                          packages/server/test passes individually (webhook/outbox/health/
                          crash-restart/index/index-temporal-e2e/rebuild/rebuild-git-failure/
                          checkrun/decisionStore/questions/telemetry/rls/oauth/crypto specs).
    boundary              packages/server/src/{index,outbox,checkRunSink,db}.ts,
                          packages/server/test/{outbox,health,crash-restart,index,
                          index-temporal-e2e}.spec.ts, docs/server-slo.md,
                          tasks/T98-server-slo/**, root package.json (autocannon devDep,
                          unused in the end -- see Found/not-fixed #tooling in docs/server-slo.md)
    non-goals             no real GitHub App, no Docker, no paid API, no Raymond accounts
    found-not-fixed        synchronous git subprocess calls throughput-bound the job queue to
                          <1/sec (measured); pg-boss queues are global across the Postgres
                          instance (cross-deploy/cross-test job contention, reproduced on
                          unmodified main too); migrations stay idempotent-not-versioned;
                          no Prometheus /metrics -- all in docs/server-slo.md "Found, not fixed"
    came from             Wave G brief G3 (briefs/G-wave.md), Raymond 11-04 "come up with new
                          tasks based on established goals ... great product for recruiter
                          like backend engineering"
    links                 docs/server-slo.md (full audit + prior art + findings)
                          tasks/T98-server-slo/4 log/{red,green,load}.txt|md
    harness               hermes
```
