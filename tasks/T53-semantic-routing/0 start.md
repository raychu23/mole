---
state: proposed
owner:
repo:
branch:
worktree:
base:
reviewer:
updated: 2026-11-02 05:22
status: ledger proposed
next: fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
---
```notes
T53-semantic-routing      ledger task (rules.md §3 code features)      project tasks
    goal                    Route each change to the decisions it touches by MEANING, not file paths: a cheap router reads the change summary (files + hunks, clipped) against a compact index of every decision (id, title, 1-2 line summary, area) and returns the governing decisions; then the existing cascade checks only those (one batched call). Fair baseline = AI given every decision (RAG arm, M2 v2 recall 1.00, FA 0.21, $0.0255/check). Prior art first: semantic routers (aurelio-labs/semantic-router), RouteLLM, BM25 + LLM rerank (e.g. RankGPT arXiv 2304.09542), Agentless localization.
    done-when               1 prior-art note with dated sources · 2 failing tests first · 3 router API returns ids + confidence + cost; zero-LLM BM25 stage first, LLM stage only if needed · 4 on M2 v2 DEV: routing accuracy >= 0.85, end-to-end recall >= 0.90, false alarms <= RAG's 0.21, cost/check <= 30% of RAG · 5 held-out run once, reported vs T49 + RAG + LLM reviewer · 6 npm run check
    status                  2026-11-02 proposed
    next                    fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
    pinned
    mode                    one worker
    boundary                packages/decisions/src/route/** + cascade wiring + tests
    checks                  npm run check
    non-goals
    proof
    stop
    came from               USER 11-01 'yes do' (next 1); T49/T52 routing 0.36/0.21
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
