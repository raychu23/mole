---
state: ready
owner: t52-builder
repo:
branch:
worktree:
base:
reviewer:
updated: 2026-11-01 21:51
status: ledger ready
next: worker claims it → ledger move <task> running --orca | --git-worktree | --worktree PATH
---
```notes
T52-grounded-capture      ledger task (rules.md §3 code features)      project tasks
    goal                    Raise decision ROUTING accuracy (T49 M2 v2: 0.36, the recall ceiling) by grounding compile-at-capture in the real repo: give the drafting model a repo map (Aider repo-map / ctags-style symbol list) + code search hits for the decision's key terms, require every drafted scope path to exist and every content anchor to match at least one current line, auto-reject drafts that don't verify, and keep person approval. Prior art: Aider repo map, SWE-agent/Agentless file localization (localize-then-repair), T46 compile/.
    done-when               1 prior-art note (Aider repo-map, Agentless localization arXiv 2407.01489, SWE-agent ACI) · 2 failing tests first · 3 drafted paths verified to exist + anchors verified to match before a draft is offered · 4 on M2 v2 DEV: routing accuracy >= 0.80 with no human edits, recall up without false alarms above LLM reviewer's · 5 held-out run once, reported vs T49 numbers · 6 npm run check
    status                  2026-11-01 ready      owner t52-builder
    next                    worker claims it → ledger move <task> running --orca | --git-worktree | --worktree PATH
    pinned
    mode                    one worker
    boundary                packages/decisions/src/compile/** + tests
    checks                  npm run check
    non-goals               check/ and cascade/ (T49 owns them), no change to the check-time (zero-LLM) path, no new runtime deps (tree-sitter) unless git ls-files/git grep prove insufficient, no merge/push
    proof                   tasks/T52-grounded-capture/4 log/prior-art.md + new compile tests (red then green) + M2 v2 dev routing-accuracy table + one held-out run reported vs T49 (0.36/0.32/0.39)
    stop                    if routing accuracy on DEV does not clear T49's 0.36 after grounding + verification, report the real number and why, do not keep tuning past M2 v2's frozen case set
    came from               T49 result 11-01: routing accuracy 0.36 is the recall ceiling
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
