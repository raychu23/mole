---
state: ready
owner: mole-builder-4
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t30-annotated-file-tree
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T30-annotated-file-tree
base: fb240ab
reviewer:
updated: 2026-10-29 10:04
status: ledger ready
next: worker claims it → ledger move <task> running --orca | --git-worktree | --worktree PATH
claimed: 2026-10-29 06:45
---
```notes
T30-annotated-file-tree      ledger task (rules.md §3 code features)      project tasks
    goal                    The big picture on the file tree (3C1 line 675): a VS Code FileDecorationProvider colors files and folders by decision flag with a short badge (decisions in force) propagated to parents, plus an intent card on hover per folder (purpose, end state, tenets it traces to, decisions + exceptions with evidence state, who to ask from approvers + read-backs, your own read state); replaces T26's separate meaning map (D31)
    done-when               1) decorations + intent cards on Mole and on a public repo with decision records (backstage/backstage or alphagov/govuk-aws), 2) M22b, harder (Raymond 10-29 'sure t30 harder questions'; the first proxy tied 15/15 vs 15/15 at the ceiling): prior-art.md first (how program-comprehension studies and code question-answering benchmarks choose questions and score them); >= 8 'why' questions about unfamiliar folders whose answers sit only in decision records or intent cards (not derivable from names, paths, code or comments), key labelled before any score; both arms get the same repo with its records, the with arm also gets the tree's badges + cards; fresh subagents, >= 3 runs per arm; report correct answers, tool calls and time per arm; target: more correct with the tree, or the same correctness in <= half the tool calls; the 3+ junior study kit stays for Raymond (D7), 3) decorations p95 <= 50 ms per folder from cached flags, 4) failure case: a folder with no records shows nothing (no empty cards, no invented purpose), 5) npm run check passes
    status                  2026-10-29 ready      Raymond 10-29 10:04 'sure t30 harder questions': done-when 2 replaced by M22b (harder questions, steps + time measured,
    next                    worker claims it → ledger move <task> running --orca | --git-worktree | --worktree PATH
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
