---
state: running
owner: hermes-build
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t83-collaboration-spike
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T83-collaboration-spike
base:
reviewer:
updated: 2026-11-03 07:04
status: ledger running
next: worker finishes → ledger move <task> submitted --report … (ledger runs the checks row)
claimed: 2026-11-03 07:04
---
```notes
T83-collaboration-spike      ledger task (rules.md §3 code features)      project tasks
    goal                    W11 later, D93 build everything: before choosing any CRDT, measure whether concurrent edits to decision records actually happen and what conflicts look like. Mine real repos' ADR/decision folders (backstage, govuk-aws, adr-tools corpora in packages/decisions/bench/corpora plus 3+ public repos with docs/adr and many contributors) for edits to the same record on parallel branches (merge commits whose parents both touched the record), classify conflicts (same field vs different fields vs body), and compare with what git's 3-way merge already resolves. Recommend: git merge only / field-level merge driver / CRDT (Automerge or Yjs), with evidence.
    done-when               1 prior-art note (Kleppmann et al. local-first 2019, Automerge/Yjs docs, git merge drivers) · 2 mining script committed + output in 4 log with counts per repo · 3 recommendation with the decisive numbers · 4 if a field-level merge driver is recommended, a tested prototype `mole merge-driver` behind a .gitattributes example, else none
    status                  2026-11-03 running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T83-collaboration-spike · branch ledger/t83-collaboration-spik
    next                    worker finishes → ledger move <task> submitted --report … (ledger runs the checks row)
    pinned
    mode                    one worker
    boundary                context/product-plan/systems/full-build/ notes + packages/decisions (merge driver only if recommended), tests
    checks                  npm run check
    non-goals               anything outside boundary
    proof                   4 log/
    stop                    recommending a CRDT without measured concurrent edits
    came from               backlog collaboration; inventory F64; W11
    links                   4 log/ledger.md (every transition + its evidence)
    harness
```
