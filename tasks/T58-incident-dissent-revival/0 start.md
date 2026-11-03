---
state: verified
owner: hermes-build
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t58-incident-dissent-revival
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T58-incident-dissent-revival
base: 8b7680b
reviewer: hermes-subagents deleg_27342d20, deleg_21ad1cbf, deleg_9d69be3e (FAIL rounds, fixed/redesigned) + deleg_0f06e1fc PASS (fresh, claude-sonnet-5)
updated: 2026-11-02 19:03
status: ledger verified
next: merge → ledger move <task> integrated --merge … (ledger reruns checks in the repo)
claimed: 2026-11-02 18:21
---
```notes
T58-incident-dissent-revival      ledger task (rules.md §3 code features)      project tasks
    goal                    Incidents revive recorded dissent (plan update 11-01 §6 steps 1-5, backlog incident-reopen): mole incident suggest <id> lists the losing arguments (label out) an incident may vindicate, with evidence (shared decision/scope + text similarity, Graphiti get_edge_invalidation_candidates idea, no LLM); mole incident accept|dismiss <id> --argument <A> records the person's choice in the incident record; an accepted incident becomes an Argdown argument attacking the dissent's attackers, so the engine reinstates the dissent and the decision turns contested/defeated. Never changes a decision's status by itself.
    done-when               1 tests first (red) · 2 suggest is read-only, deterministic, each candidate carries the evidence (decision, scope or text overlap) · 3 accept writes only .mole/incidents/<id>.md + .mole/arguments/incidents.argdown, dismiss writes only the incident record; both idempotent · 4 after accept, evaluate shows the dissent in and the decision contested or defeated, with the incident as the reason · 5 real-ADR replay: one python-tuf or log4brains decision with a recorded rejected option + a written incident goes holds -> contested · 6 npm run check
    status                  2026-11-02 verified      reviewer hermes-subagents deleg_27342d20, deleg_21ad1cbf, deleg_9d69be3e (FAIL rounds, fixed/redesigned) + deleg_0f06e1f
    next                    merge → ledger move <task> integrated --merge … (ledger reruns checks in the repo)
    pinned
    mode                    one worker
    boundary                packages/decisions/src/incidents/** (new), packages/decisions/src/graph.ts loadIncidents (read new fields), decisions cli.ts + index.ts exports, one line in packages/daemon/src/cli.ts, tests
    checks                  npm run check
    non-goals               automatic status flips · LLM matching · double-loop tenet revision (next task) · UI · Postgres
    proof                   4 log/replay.txt (real ADR holds -> contested) + test output
    stop                    a fresh reviewer finds a status changed without a person's accept
    came from               Hermes chat 11-02 'get started building ... one by one'; backlog incident-reopen
    links                   4 log/ledger.md (every transition + its evidence)
    harness
```
