---
state: running
owner: mole-builder-9
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t33-team-server
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T33-team-server
base: 54ad899
reviewer:
updated: 2026-10-29 18:11
status: ledger running
next: worker finishes → ledger move <task> submitted --report … (ledger runs the checks row)
claimed: 2026-10-29 15:47
---
```notes
T33-team-server      ledger task (rules.md §3 code features)      project tasks
    goal                    Team phase B, built now on established open-source designs (USER 10-29 15:30 'build full system based on establisseh dopen soruce repos or big company systs or startups'; D34 amended): a GitHub App backend in TypeScript + PostgreSQL that gives a 10-100 person team what repo files alone can't. Webhook ingest with @octokit/webhooks (HMAC, ack within GitHub's 10 s, dedupe on X-GitHub-Delivery, idempotent by commit SHA) → pg-boss queue (Postgres-backed, no Redis) → a Postgres index REBUILT from the .mole/ files in git (git stays the source of truth) with graph relations (decisions, code, tests, people, agents) traversed by recursive CTEs; check runs computed per push; question routing (records first, else the CODEOWNERS owner); a transactional outbox for every notification; row-level security per org; a remote MCP server (MCP TypeScript SDK, streamable HTTP, OAuth 2.1 per the 2025-06-18 auth spec); OpenTelemetry spans on every request and job (collector config in deploy/), eval runs in MLflow format (T16/T17); deploy/ with Dockerfile + docker-compose (postgres, otel-collector, jaeger, mlflow). R0 prior art: GitHub webhook best practices, Backstage catalog ingestion (processors + refresh loop), Sourcegraph, transactional outbox (Richardson), Google Code Search/Kythe indexing
    done-when               1) M25 replay: 1,000 recorded webhook deliveries incl. 10% duplicates and shuffled order → 0 duplicate effects, index equal to a from-scratch rebuild from git, 0 lost notifications (outbox), 2) permission leak test: a user without read access to a repo sees 0 of its records through API and MCP (key written before code), 3) p95 webhook ack < 1 s, push → check run computed < 60 s (posted to a recorded fake GitHub API), question → answer-or-route < 2 s, 4) reads and read-backs never reach the server unless the person shares them, 5) failure case: missed deliveries → reconcile from git history fixes the index, 6) every request and job emits OpenTelemetry spans (in-memory exporter test), eval runs written in MLflow format, 7) remote MCP over streamable HTTP with OAuth 2.1 works with the MCP SDK client (token required, scoped per org), 8) npm run check passes, deploy/ Dockerfile + docker-compose.yml written, docker build only if Docker is already running
    status                  2026-10-29 running      changes requested: Fresh review round 1 (P0 must-fix): (1) tasks/T33-team-server/4 log/prior-art.md does not exist despi
    next                    worker finishes → ledger move <task> submitted --report … (ledger runs the checks row)
    pinned
    mode                    code
    boundary                packages/server/** (new), deploy/** (new), packages/*/src read-only (import exported functions, export a helper with a one-line change only), root package.json + package-lock.json (workspace deps only), tasks/T33-team-server/**
    checks                  npm run check && node packages/server/dist/bench/m25.js
    non-goals               no paid API or model calls from Mole code (a model only behind an interface, tests use recorded fixtures) · no publishing or pushing · Raymond's accounts never used (no GitHub App registration, no Slack workspace, no marketplace) · prototype/ rejected · don't edit benchmark keys after the red-tests commit (R2) · shared registries (MCP tool list, CLI usage, workspace deps, extension package.json contributes) tested with toContain, never an exact set · never start Docker Desktop (disk ~6 GB free): local Postgres via /opt/homebrew/bin/pg_ctl in a temp dir or PGlite · kill processes by pid only, never pkill -f · no real GitHub App, OAuth provider or cloud deploy: recorded payloads, a local test OAuth issuer, a fake GitHub API
    proof                   runs.jsonl last line with the metric + npm run check output + the red-tests commit dated before the first implementation commit + the fresh reviewer's verdict
    stop                    same check failure 3 rounds in a row (R3) · needs Raymond's accounts, paid API spend, people or a product decision (log it in 4 log, move on to the next task)
    came from               USER 2026-10-29 03:50 'also how abt the team integratn part doign this knowledge agents stuff w a github and few diff membs … there has to be exisitng syst that does that right … wat it take us to build that as plan taking inspo from larger companie systems' · Team mode.md · D34
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
