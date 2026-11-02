---
state: ready
owner: t53-builder
repo:
branch:
worktree:
base:
reviewer:
updated: 2026-11-02 05:27
status: ledger ready
next: worker claims it → ledger move <task> running --orca | --git-worktree | --worktree PATH
---
```notes
T53-semantic-routing      ledger task (rules.md §3 code features)      project tasks
    goal                    Route each change to the decisions it touches by MEANING, not file paths: a cheap router reads the change summary (files + hunks, clipped) against a compact index of every decision (id, title, 1-2 line summary, area) and returns the governing decisions; then the existing cascade checks only those (one batched call). Fair baseline = AI given every decision (RAG arm, M2 v2 recall 1.00, FA 0.21, $0.0255/check). Prior art first: semantic routers (aurelio-labs/semantic-router), RouteLLM, BM25 + LLM rerank (e.g. RankGPT arXiv 2304.09542), Agentless localization.
    done-when               1 prior-art note with dated sources · 2 failing tests first · 3 router API returns ids + confidence + cost; zero-LLM BM25 stage first, LLM stage only if needed · 4 on M2 v2 DEV: routing accuracy >= 0.85, end-to-end recall >= 0.90, false alarms <= RAG's 0.21, cost/check <= 30% of RAG · 5 held-out run once, reported vs T49 + RAG + LLM reviewer · 6 npm run check
    status                  2026-11-02 ready      owner t53-builder
    next                    worker claims it → ledger move <task> running --orca | --git-worktree | --worktree PATH
    pinned
    mode                    one worker
    boundary                packages/decisions/src/route/** + cascade wiring + tests
    checks                  npm run check
    non-goals               no change to check/pr-check.ts scope/content anchor matching itself, no embeddings/vector DB, no change to compile-at-capture draft flow, RAG/llm-reviewer arms untouched
    proof                   context/product-plan/systems/metrics-proof/m2-conflict/v2/t53-results.md with dev-tuned + held-out-once numbers vs T49/RAG/llm-reviewer
    stop                    if BM25-only cannot reach done-when 4's thresholds on dev even after tuning k/weights, stop and report the gap before spending the LLM-stage budget on held-out
    came from               USER 11-01 'yes do' (next 1); T49/T52 routing 0.36/0.21
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
