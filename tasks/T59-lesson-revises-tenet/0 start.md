---
state: integrated
owner: hermes-build
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t59-lesson-revises-tenet
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T59-lesson-revises-tenet
base: 86631d3
reviewer: hermes-subagents deleg_6e3ca1c0, deleg_06b5fca1, deleg_359c3a22 (fresh, claude-sonnet-5); round-3 message-only fixes parent-verified
updated: 2026-11-02 19:26
status: ledger integrated
next: record outcome → ledger move <task> done --outcome … --resources … --prevents …
claimed: 2026-11-02 19:04
---
```notes
T59-lesson-revises-tenet      ledger task (rules.md §3 code features)      project tasks
    goal                    Double-loop learning (Argyris & Schon 1977; backlog double-loop; all relations 11-01 learned_from + revises): a lesson record .mole/lessons/<id>.md (learned_from incidents, revises a tenet, proposed wording, owner) becomes a DRAFT tenet revision on a mole-proposals branch (T56): mole-proposals lesson --repo R --lesson L --path P creates the branch from HEAD, rewrites only that tenet in .mole/tenets.md there, commits on the proposal branch, and reports every decision that traces_to the tenet (file:line) for re-review. Approved tenets never change; approval = merging the branch.
    done-when               1 tests first (red) · 2 the approved checkout, index and refs other than the new proposal branch are unchanged · 3 the draft commit changes only the target tenet section and names the lesson + incidents · 4 report lists every decision tracing to the tenet with file:line, and a lesson with no owner, no learned_from incident or an unknown tenet is refused with a clear error · 5 replay on Mole's own .mole (tenet-3 + incident 2026-10-27) in a temp clone · 6 npm run check
    status                  2026-11-02 integrated      merge b8f075f (main check 989 pass, /Users/a1/.hermes/cache/scratch/mole-build/main-check-t59.txt) · combined checks exi
    next                    record outcome → ledger move <task> done --outcome … --resources … --prevents …
    pinned
    mode                    one worker
    boundary                packages/proposals/src/lesson.ts (new), proposals cli.ts + index.ts, tests; reads .mole via @mole/decisions
    checks                  npm run check
    non-goals               auto-merge or auto-approve · LLM-written tenet text · NodeKind changes · UI
    proof                   4 log/replay.txt
    stop                    any write outside the new proposal branch/worktree
    came from               Hermes chat 11-02 'get started building ... one by one'; backlog double-loop
    links                   4 log/ledger.md (every transition + its evidence)
    harness
```
