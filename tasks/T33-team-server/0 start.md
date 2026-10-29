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
    goal                    Team phase B (Team mode.md §5-6): a GitHub App + small TypeScript service + PostgreSQL that gives a 10-100 person team what files alone can't: webhook ingest (HMAC check, answer within GitHub's 10 s, queue, dedupe on X-GitHub-Delivery, idempotent by commit SHA), a Postgres index REBUILT from the .mole/ files in git (git stays the source of truth), question routing (records first, else the CODEOWNERS owner via Slack or GitHub; the answer drafted as a record PR, T23/T31), check runs from the App, a remote MCP server with OAuth 2.1 sign-in, a per-folder team page (owners, open questions, flags; never per-person scores), transactional outbox for every notification, row-level security per org, one Docker image
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
