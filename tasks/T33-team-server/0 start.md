---
state: proposed
owner:
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch:
worktree:
base:
reviewer:
updated: 2026-10-29 03:59
status: ledger proposed
next: fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
---
```notes
T33-team-server      ledger task (rules.md §3 code features)      project tasks
    goal                    Team phase B, built now on established open-source designs (USER 10-29 15:30 'build full system based on establisseh dopen soruce repos or big company systs or startups'; D34 amended): a GitHub App backend in TypeScript + PostgreSQL that gives a 10-100 person team what repo files alone can't. Webhook ingest with @octokit/webhooks (HMAC, ack within GitHub's 10 s, dedupe on X-GitHub-Delivery, idempotent by commit SHA) → pg-boss queue (Postgres-backed, no Redis) → a Postgres index REBUILT from the .mole/ files in git (git stays the source of truth) with graph relations (decisions, code, tests, people, agents) traversed by recursive CTEs; check runs computed per push; question routing (records first, else the CODEOWNERS owner); a transactional outbox for every notification; row-level security per org; a remote MCP server (MCP TypeScript SDK, streamable HTTP, OAuth 2.1 per the 2025-06-18 auth spec); OpenTelemetry spans on every request and job (collector config in deploy/), eval runs in MLflow format (T16/T17); deploy/ with Dockerfile + docker-compose (postgres, otel-collector, jaeger, mlflow). R0 prior art: GitHub webhook best practices, Backstage catalog ingestion (processors + refresh loop), Sourcegraph, transactional outbox (Richardson), Google Code Search/Kythe indexing
    done-when               1) M25 replay: 1,000 recorded webhook deliveries incl. 10% duplicates and shuffled order → 0 duplicate effects, index equal to a from-scratch rebuild from git, 0 lost notifications (outbox); 2) permission leak test: a user without read access to a repo sees 0 of its records through API, MCP and Slack (key written before code); 3) p95 webhook ack < 1 s, push → check run < 60 s, question → answer-or-route < 2 s; 4) reads and read-backs never reach the server unless the person shares them; 5) failure case: GitHub outage or missed deliveries → nightly reconcile from the git history fixes the index; 6) only after the phase A pilot shows records answering questions (D34); 7) npm run check + docker build pass
    status                  2026-10-29 proposed
    next                    fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
    pinned
    mode                    code
    boundary
    checks
    non-goals
    proof
    stop
    came from               USER 2026-10-29 03:50 'also how abt the team integratn part doign this knowledge agents stuff w a github and few diff membs … there has to be exisitng syst that does that right … wat it take us to build that as plan taking inspo from larger companie systems' · Team mode.md · D34
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
