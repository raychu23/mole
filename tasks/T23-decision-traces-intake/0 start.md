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
    goal                    Agents interrogate, people write (nuanced.dev, Ayman Nadeem 10-28: AI-generated specs get approved passively; Raymond 10-29: 'similar to my sort of gronded vision'; D38). When a PR, agent session or thread changes code governed by decisions, or a person writes a new record, Mole gathers the evidence (diff hunks, linked PR or issue, transcript excerpts with ids, past fixes, tests) and asks the author up to 3 pointed questions + assumption checks on the person's own text (no alternatives considered, scope not anchored to code, contradicts tenet X, cites code that has changed since). Shown in the VS Code view (T34) and the PR check (T32). Mole never writes the why: a model, if enabled, may only phrase questions over facts code found (R6); the default path is deterministic. Replaces the earlier 'model extracts and drafts records' plan
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
