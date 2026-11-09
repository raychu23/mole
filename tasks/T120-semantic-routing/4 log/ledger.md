```notes
ledger (newest last, nothing deleted)
    2026-11-08 23:54      new → proposed      raise T53 router recall@1/3/5 on real ADR corpora (B2 v4.3: semantic-kernel 0.375, 17/19 pooled misses = routing) via embeddings/governs-summary doc expansion, 
    2026-11-08 23:54      proposed → ready      owner unclaimed
    2026-11-08 23:55      ready → running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T120-semantic-routing · branch ledger/t120-semantic-routing · base 9c0ec45
    2026-11-09 01:00      running (Q13 follow-up)      found+fixed governsSummary id-resolution bug (0/206→205/206 keys resolved on the real raw hermes outputs, semantic-kernel 0/79→77/79) AND a ground-truth bug found while diagnosing it (12 of semantic-kernel's 16 cases had the wrong gt_file, all substring-matched to one generic boilerplate decision — corrected via each case's own adr_id); re-measured bm25/+embed/+governs/+both stage-1 on DEV+SEEN with corrected data, added 2 new LLM-listwise configs (k10/k15, haiku, real cost+FA, not the recall@k ceiling artifact); recommendation in 4 log/results.md: +embedBoost alone for the NEW-repo eval, defer governsSummary, k10 if stage-2 included — NEW-repo protocol still frozen, NOT run
```
