---
state: proposed
owner:
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch:
worktree:
base:
reviewer:
updated: 2026-10-28 22:22
status: ledger proposed
next: fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
---
```notes
T17-agent-eval-inspect      ledger task (rules.md §3 code features)      project tasks
    goal                    End-to-end agent eval: with Inspect AI + Inspect SWE's claude_code() in a Docker sandbox, measure whether Claude Code with Mole's hooks (T15) repeats a planted regression less often than without, on the B1/B3 cases
    done-when               1) an Inspect task set built from B1 + B3 (task prompt that tempts the regression + a scorer that runs the guarding test); 2) two arms (no Mole · Mole hooks + MCP) × n runs each, n set before running; 3) report: regression rate per arm with a 95% interval, tokens and time per run, in tasks/T17-agent-eval-inspect/4 log/; 4) failure case: sandbox can't reach the model → clear error, no partial score; 5) needs Raymond's go on API spend before the full run
    status                  2026-10-28 proposed
    next                    fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
    pinned
    mode                    code
    boundary
    checks
    non-goals
    proof
    stop
    came from               USER 2026-10-28 21:25 'also whats the current tools being used maybe also use more advantaced current industry tools maybe the ml ops tools stuff actually relevant ot industry jobs. we;ll see .' · D26 OPEN · Agentic workflow + integrations.md §11
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
