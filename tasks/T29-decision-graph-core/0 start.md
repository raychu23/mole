---
state: proposed
owner:
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch:
worktree:
base:
reviewer:
updated: 2026-10-29 02:50
status: ledger proposed
next: fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
---
```notes
T29-decision-graph-core      ledger task (rules.md §3 code features)      project tasks
    goal                    The decision graph behind the code: .mole/tenets.md, .mole/decisions/*.md (MADR front matter: status, door, traces_to, scope paths/symbols, Kruchten relations, overridden_by, evidence, approver, source), .mole/intent/<folder>.md and .mole/incidents/*.md loaded into the context graph; citator-style flags computed by code (red superseded or orphaned; yellow conflicting proposal, scope changed since the approver last confirmed, evidence missing or failing, or a parent tenet/decision yellow/red; green accepted + anchored + evidence passing; grey proposed) and propagated along traces_to/overrides/cites; build_graph.py on decisions.jsonl is the working sample
    done-when               1) mole decisions [--json] lists every decision with flag + reasons + file:line; 2) M21 bench, key labeled before the code: 20 planted changes across Mole (.mole records for the daemon idle rules + 5 others) and two public decision-record folders (backstage/backstage docs/architecture-decisions, alphagov/govuk-aws docs/architecture/decisions) → flag recall >= 90%, false flags <= 10%; 3) flag recompute for 1,000 decisions after a commit <= 1 s, 0 model calls; 4) failure case: a record with a scope path that no longer exists → red 'orphaned', never silently green; 5) npm run check passes
    status                  2026-10-29 proposed
    next                    fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
    pinned
    mode                    code
    boundary
    checks
    non-goals
    proof
    stop
    came from               USER 2026-10-29 07:10 'im still really unhappy with the stuff about codemaps … making that into some relational graph thing based on human decisions … sharing of core intutive info is hard … has to be done throuhg like q1-1 often' · Decision graph.md · D31
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
