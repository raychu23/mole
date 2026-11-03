---
state: ready
owner: hermes-build
repo:
branch:
worktree:
base:
reviewer:
updated: 2026-11-03 02:53
status: ledger ready
next: worker claims it → ledger move <task> running --orca | --git-worktree | --worktree PATH
---
```notes
T71-case-recall      ledger task (rules.md §3 code features)      project tasks
    goal                    Given a new proposal or decision draft, recall similar past decisions/incidents as questions with evidence (Klein recognition-primed decision; resembles relation), via the retrieval method that wins on a frozen held-out set against a named stock baseline (BM25 from T53 route/bm25.ts; also try title+rationale fields, MMR) - build a custom matcher only if it beats the baseline.
    done-when               1 prior-art note (Klein RPD, case-based reasoning Aamodt & Plaza 1994, BM25/MMR, how ai-memory/Graphiti retrieve) · 2 frozen eval set built from real public ADR corpora already in the repo (metrics-proof corpora: superseded/related ADR pairs as relevance labels), dev/held-out split, sha256 before scoring · 3 tests first · 4 `mole recall <text|record> --json` + read-only MCP tool; output says 'similar case, check whether it applies', never asserts causation · 5 held-out recall@5/MRR vs baseline reported once, losses first
    status                  2026-11-03 ready      owner hermes-build
    next                    worker claims it → ledger move <task> running --orca | --git-worktree | --worktree PATH
    pinned
    mode                    one worker
    boundary                packages/decisions (new recall/), daemon cli, mcp tool, tests, eval set under context/product-plan/systems/metrics-proof/case-recall/
    checks                  npm run check
    non-goals               anything outside boundary
    proof                   4 log/
    stop                    custom matcher does not beat BM25 on held-out -> ship BM25, say so
    came from               inventory F61; backlog case-recall; D90 human graph
    links                   4 log/ledger.md (every transition + its evidence)
    harness
```
