---
state: running
owner: mole-builder-4
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t30-annotated-file-tree
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T30-annotated-file-tree
base: fb240ab
reviewer:
updated: 2026-10-29 06:45
status: ledger running
next: worker finishes → ledger move <task> submitted --report … (ledger runs the checks row)
claimed: 2026-10-29 06:45
---
```notes
T30-annotated-file-tree      ledger task (rules.md §3 code features)      project tasks
    goal                    The big picture on the file tree (3C1 line 675): a VS Code FileDecorationProvider colors files and folders by decision flag with a short badge (decisions in force) propagated to parents, plus an intent card on hover per folder (purpose, end state, tenets it traces to, decisions + exceptions with evidence state, who to ask from approvers + read-backs, your own read state); replaces T26's separate meaning map (D31)
    done-when               1) decorations + intent cards on Mole and on a public repo with decision records (backstage/backstage or alphagov/govuk-aws), 2) M22 proxy tonight: 5 'why' questions about an unfamiliar folder, key labeled before the code, answered by fresh subagents with vs without the tree's output (cards + badges as text), 3 runs each → correct answers per arm, the 3+ junior study kit (questions, order, timing sheet from systems/tool-trials/you-10-min.md) written and left for Raymond (D7), 3) decorations p95 <= 50 ms per folder from cached flags, 4) failure case: a folder with no records shows nothing (no empty cards, no invented purpose), 5) npm run check passes
    status                  2026-10-29 running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T30-annotated-file-tree · branch ledger/t30-annotated-file-tre
    next                    worker finishes → ledger move <task> submitted --report … (ledger runs the checks row)
    pinned
    mode                    code
    boundary                packages/decisions/src/tree/** (pure: folder → flag, badge, intent card) + bench m22*, apps/vscode/src (FileDecorationProvider + folder hover card only), tasks/T30-annotated-file-tree/**
    checks                  npm run check && node packages/decisions/dist/bench/m22.js
    non-goals               no PR comments/bot (D24) · no structure-map work (D23) · prototype/ rejected · no publishing or pushing · Raymond's accounts never used · no paid API or model calls from Mole code · don't edit benchmark keys after the red-tests commit (R2) · shared registries (MCP tool list, CLI usage, workspace deps) tested with toContain, never an exact set
    proof                   runs.jsonl last line with the metric + npm run check output + the red-tests commit sha dated before the first implementation commit + the fresh reviewer's verdict
    stop                    same check failure 3 rounds in a row (R3) · needs Raymond's accounts, paid API spend, people or a product decision (log it in 4 log, move on to the next task)
    came from               USER 2026-10-29 07:10 'im still really unhappy with the stuff about codemaps … making that into some relational graph thing based on human decisions … sharing of core intutive info is hard … has to be done throuhg like q1-1 often' · Decision graph.md · D31
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
