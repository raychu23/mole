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
T24-agent-claim-check      ledger task (rules.md §3 code features)      project tasks
    goal                    Check what an agent says it did against what it did: parse an agent's final answer for claims ('tests pass', 'fixed X', 'updated file Y', 'committed') and verify each against its own transcript (tool calls + their results, from T18's run states) and the git state; flag claims with no or contrary evidence (3C1 line 672: 'verificatn: sure thing u tell it to do actually done')
    done-when               1) mole claims <run> lists each claim → evidence (tool call id, exit code, commit) → supported / unsupported / contradicted; deterministic matchers first, a model only to split the final answer into claims (structured outputs); 2) M16 bench: 40 final answers from Hermes + Claude Code sessions, labeled before the code (incl. the builder chat's own self-corrected 'exit 0' runs.jsonl line) → recall >= 90% of unsupported/contradicted claims, false flags <= 10%; 3) Stop-hook output names the unsupported claims in one line each; 4) failure case: an answer with no checkable claims → 'nothing to check', exit 0; 5) npm run check passes
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
