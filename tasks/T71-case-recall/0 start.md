---
state: submitted
owner: hermes-build
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t71-case-recall
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T71-case-recall
base:
reviewer:
updated: 2026-11-03 04:29
status: ledger submitted
next: fresh reviewer → ledger move <task> verified --reviewer … --findings …
claimed: 2026-11-03 02:53
---
```notes
T71-case-recall      ledger task (rules.md §3 code features)      project tasks
    goal                    Given a new proposal or decision draft, recall similar past decisions/incidents as questions with evidence (Klein recognition-primed decision; resembles relation), via the retrieval method that wins on a frozen held-out set against a named stock baseline (BM25 from T53 route/bm25.ts; also try title+rationale fields, MMR) - build a custom matcher only if it beats the baseline.
    done-when               1 prior-art note (Klein RPD, case-based reasoning Aamodt & Plaza 1994, BM25/MMR, how ai-memory/Graphiti retrieve) · 2 frozen eval set built from real public ADR corpora already in the repo (metrics-proof corpora: superseded/related ADR pairs as relevance labels), dev/held-out split, sha256 before scoring · 3 tests first · 4 `mole recall <text|record> --json` + read-only MCP tool; output says 'similar case, check whether it applies', never asserts causation · 5 held-out recall@5/MRR vs baseline reported once, losses first
    status                  2026-11-03 submitted      report: tasks/T71-case-recall/2 insights.md, proof 4 log/results.md · checks exit 0
    next                    fresh reviewer → ledger move <task> verified --reviewer … --findings …
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
