```notes
ledger (newest last, nothing deleted)
    2026-11-02 05:22      new → proposed      Route each change to the decisions it touches by MEANING, not file paths: a cheap router reads the change summary (files + hunks, clipped) against a compact ind
    2026-11-02 05:27      proposed → ready      owner t53-builder
    2026-11-02 05:27      ready → running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T53-semantic-routing · branch ledger/t53-semantic-routing · base ffd1d93
    2026-11-02 06:09      running → submitted      report: packages/decisions/src/route/{bm25,index-text,route,types,index}.ts (own BM25 + listwise LLM router) + cascade.ts semanticRoute wiring (additive routing + escalation). Tests first: route-bm25.test.ts (8), route.t
    2026-11-02 06:09      checks ran: npm run check in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T53-semantic-routing → exit 0 (at new Promise (<anonymous>))
    2026-11-02 06:18      submitted → verified      reviewer reviewer-T53-r1 (deleg_c0f42eec task 0) · findings: done-when 4 dev gates missed and accepted as deviation: routing 0.71 < 0.85, cost 43% > 30% of RAG, P2 tokenizer drops non-ASCII-letter tokens (CJK), P2 listwi
    2026-11-02 06:18      checks ran: npm run check in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T53-semantic-routing → exit 0 (at new Promise (<anonymous>))
```
