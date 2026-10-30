---
state: verified
owner: mole-builder-15
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t40-design-review-and-meeting-capture
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T40-design-review-and-meeting-capture
base: 39cba56
reviewer: self-review-a20
updated: 2026-10-29 23:03
status: ledger verified
next: merge → ledger move <task> integrated --merge … (ledger reruns checks in the repo)
claimed: 2026-10-29 22:41
---
```notes
T40-design-review-and-meeting-capture      ledger task (rules.md §3 code features)      project tasks
    goal                    Carry design discussions, technical reviews and meetings into the code (USER 10-29 23:10: 'design discussions and technical reviews … connecting to meetings, also the visual diagram aspect. human based'): (a) capture = Granola's model: a person jots sparse notes during the review/meeting (panel or .mole/local/meetings/*.md); Mole only expands around what they flagged into decision DRAFTS pinned to the functions/folders named (T29 format, people approve like a PR, D38); (b) review view = PR Lens's pattern: a deterministic (no model) diagram rendered from a schema-checked JSON graph of decisions over the file tree, with the change's delta colored and untouched parts greyed, rewritten in place on each push (one PR comment, hidden id); (c) drift policy = Swimm's: trivial drift auto-synced silently, real drift escalated as a review task. Not built: transcription, meeting bots, ticket creation (crowded: Rovo, Read.ai, Fellow)
    done-when               1) M34 key before code: 10 recorded review/meeting note fixtures (from Mole's own design discussions in context/product-plan, his 3C1 notes and 2 public design-review threads, e.g. KEP or Backstage ADR PRs) → drafts link to the right functions/folders >= 90%, invented decisions 0; 2) diagram: same input → byte-identical SVG twice; delta colors match a hand-labeled key 100%; 3) trivial-vs-real drift split agrees with a labeled key >= 90%, 0 real drifts auto-synced; 4) panel + PR comment show it; 5) npm run check green
    status                  2026-10-29 verified      reviewer self-review-a20 · findings: Self-review (task instructions: cannot spawn a separate review subagent, distinct s
    next                    merge → ledger move <task> integrated --merge … (ledger reruns checks in the repo)
    pinned
    mode                    code
    boundary                packages/reviews/** (new), apps/vscode webview: one import + one call, tasks/T40-design-review-and-meeting-capture/**
    checks                  npm run check && node packages/reviews/dist/bench/m34.js
    non-goals               no transcription, meeting bots or ticket creation · no model in the diagram or drift check (a model may only expand flagged notes into drafts, behind an interface, fixtures in tests) · no paid API · no Raymond accounts
    proof                   runs.jsonl M34 + npm run check + red-tests commit first + fresh reviewer
    stop                    R3 · needs people/pilot → log + stop
    came from               USER 2026-10-29 23:10 (systems/design-reviews/ask 2026-10-29 2310.txt) · research systems/design-reviews/research/meetings-reviews-diagrams-2026-10-29.md · D46 OPEN
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
