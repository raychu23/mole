---
state: running
owner: mole-builder-4
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t29-decision-graph-core
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T29-decision-graph-core
base: 491dd7e
reviewer:
updated: 2026-10-29 05:08
status: ledger running
next: worker finishes → ledger move <task> submitted --report … (ledger runs the checks row)
claimed: 2026-10-29 05:08
---
```notes
T29-decision-graph-core      ledger task (rules.md §3 code features)      project tasks
    goal                    The decision graph behind the code: .mole/tenets.md, .mole/decisions/*.md (MADR front matter: status, door, traces_to, scope paths/symbols, Kruchten relations, overridden_by, evidence, approver, source), .mole/intent/<folder>.md and .mole/incidents/*.md loaded into the context graph; citator-style flags computed by code (red superseded or orphaned; yellow conflicting proposal, scope changed since the approver last confirmed, evidence missing or failing, or a parent tenet/decision yellow/red; green accepted + anchored + evidence passing; grey proposed) and propagated along traces_to/overrides/cites; build_graph.py on decisions.jsonl is the working sample
    done-when               1) mole decisions [--json] lists every decision with flag + reasons + file:line; 2) M21 bench, key labeled before the code: 20 planted changes across Mole (.mole records for the daemon idle rules + 5 others) and two public decision-record folders (backstage/backstage docs/architecture-decisions, alphagov/govuk-aws docs/architecture/decisions) → flag recall >= 90%, false flags <= 10%; 3) flag recompute for 1,000 decisions after a commit <= 1 s, 0 model calls; 4) failure case: a record with a scope path that no longer exists → red 'orphaned', never silently green; 5) npm run check passes
    status                  2026-10-29 running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T29-decision-graph-core · branch ledger/t29-decision-graph-cor
    next                    worker finishes → ledger move <task> submitted --report … (ledger runs the checks row)
    pinned
    mode                    code
    boundary                packages/decisions/** (new), .mole/ (Mole's own tenets, decisions, intent records: the bench fixtures), packages/daemon/src/cli.ts (register the subcommand with one import + one call only), packages/mcp/src (new mole_decisions tool only), tasks/T29-decision-graph-core/**
    checks                  npm run check && node packages/decisions/dist/bench/m21.js
    non-goals               no PR comments/bot (D24) · no structure-map work (D23) · prototype/ rejected · no publishing or pushing · Raymond's accounts never used · no paid API or model calls from Mole code · don't edit benchmark keys after the red-tests commit (R2) · shared registries (MCP tool list, CLI usage, workspace deps) tested with toContain, never an exact set
    proof                   runs.jsonl last line with the metric + npm run check output + the red-tests commit sha dated before the first implementation commit + the fresh reviewer's verdict
    stop                    same check failure 3 rounds in a row (R3) · needs Raymond's accounts, paid API spend, people or a product decision (log it in 4 log, move on to the next task)
    came from               USER 2026-10-29 07:10 'im still really unhappy with the stuff about codemaps … making that into some relational graph thing based on human decisions … sharing of core intutive info is hard … has to be done throuhg like q1-1 often' · Decision graph.md · D31
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
