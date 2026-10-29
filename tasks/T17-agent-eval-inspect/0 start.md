---
state: submitted
owner: mole-builder-2 (Hermes chat)
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t17-agent-eval-inspect
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T17-agent-eval-inspect
base: d53d3bd
reviewer:
updated: 2026-10-29 06:43
status: ledger submitted
next: fresh reviewer → ledger move <task> verified --reviewer … --findings …
claimed: 2026-10-29 05:44
---
```notes
T17-agent-eval-inspect      ledger task (rules.md §3 code features)      project tasks
    goal                    End-to-end agent eval: with Inspect AI + Inspect SWE's claude_code() in a Docker sandbox, measure whether Claude Code with Mole's hooks (T15) repeats a planted regression less often than without, on the B1/B3 cases
    done-when               1) an Inspect task set built from B1 + B3 (task prompt that tempts the regression + a scorer that runs the guarding test); 2) two arms (no Mole · Mole hooks + MCP) × n runs each, n set before running; 3) report: regression rate per arm with a 95% interval, tokens and time per run, in tasks/T17-agent-eval-inspect/4 log/; 4) failure case: sandbox can't reach the model → clear error, no partial score; 5) needs Raymond's go on API spend before the full run
    status                  2026-10-29 submitted      report: branch ledger/t17-agent-eval-inspect @1b0a35d (red 4dfd168): evals/inspect = Inspect AI task with Inspect SWE cl
    next                    fresh reviewer → ledger move <task> verified --reviewer … --findings …
    pinned
    mode                    code
    boundary                evals/inspect/** (new, Python), tasks/T17-agent-eval-inspect/**
    checks                  python3 -m pytest evals/inspect/tests -q && npm run check
    non-goals               no PR comments/bot (D24) · no structure-map work (D23) · prototype/ rejected · no publishing or pushing · Raymond's accounts never used · don't edit benchmark keys after the red-tests commit (R2) · the FULL paid A/B run waits for Raymond's go on API spend: build the harness + a 2-sample dry run only
    proof                   harness + scorer tests + a 2-sample dry run log, the full run's n and stopping rule written before it runs
    stop                    same check failure 3 rounds in a row (R3) · needs Raymond's accounts, paid API spend or a product decision · Docker or the Inspect sandbox can't start on this Mac (log the error, stop)
    came from               USER 2026-10-28 21:25 'also whats the current tools being used maybe also use more advantaced current industry tools maybe the ml ops tools stuff actually relevant ot industry jobs. we;ll see .' · D26 OPEN · Agentic workflow + integrations.md §11
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
