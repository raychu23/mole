---
state: proposed
owner:
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch:
worktree:
base:
reviewer:
updated: 2026-10-29 01:20
status: ledger proposed
next: fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
---
```notes
T23-decision-traces-intake      ledger task (rules.md §3 code features)      project tasks
    goal                    Turn the places design decisions actually happen (Slack threads via Slack MCP, meeting notes, PR threads, agent sessions) into proposed decision records anchored to the functions they're about: a model extracts {decision, alternatives rejected, reason, source link} with provider structured outputs (constrained decoding), Mole anchors it to symbols deterministically, and it lands as a .mole/ proposal you approve or reject (D12); nothing enters memory unapproved
    done-when               1) mole intake <file|slack-thread-url> writes proposals under .mole/proposals/ with source links; 2) M15 bench: 30 decisions labeled by hand from real threads/notes (key before the code) → extraction recall >= 80%, anchor precision >= 90%; 3) every model call uses a JSON schema with strict structured outputs, logged with tokens + cost; 4) failure case: a thread with no decision yields no proposal (no invented decisions: 0 on 10 decision-free threads); 5) npm run check passes
    status                  2026-10-29 proposed
    next                    fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
    pinned
    mode                    code
    boundary
    checks
    non-goals
    proof
    stop
    came from               USER 2026-10-29 06:15 pasted vertical-AI chat ('does this info add anything useful … critically understand and expand') · Vertical AI chat, checked.md · D29
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
