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
T30-annotated-file-tree      ledger task (rules.md §3 code features)      project tasks
    goal                    The big picture on the file tree (3C1 line 675): a VS Code FileDecorationProvider colors files and folders by decision flag with a short badge (decisions in force) propagated to parents, plus an intent card on hover per folder (purpose, end state, tenets it traces to, decisions + exceptions with evidence state, who to ask from approvers + read-backs, your own read state); replaces T26's separate meaning map (D31)
    done-when               1) decorations + intent cards on Mole and on a public repo with decision records; 2) M22: the 10-minute catch-up sheet (systems/tool-trials/you-10-min.md) turned into 5 'why' questions about an unfamiliar folder, 3+ juniors with vs without the annotated tree, n and order fixed before → time to 5 correct answers + correctness; 3) decorations p95 <= 50 ms per folder from cached flags; 4) failure case: a folder with no records shows nothing (no empty cards, no invented purpose); 5) npm run check passes
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
