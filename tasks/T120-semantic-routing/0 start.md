---
state: running
owner: unclaimed
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t120-semantic-routing
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T120-semantic-routing
base: 9c0ec45
reviewer:
updated: 2026-11-09 01:00
status: ledger running — Q13 follow-up done (4 log/results.md): fixed governsSummary id-resolution bug (0/79→77/79 semantic-kernel coverage) AND a ground-truth bug found while diagnosing it (12 wrong gt_file labels in semantic-kernel, all now corrected — true baseline R@1 0.375, matches frozen v4.3 bench exactly); re-measured all 4 stage-1 configs + 2 new LLM-listwise configs (k10/k15 haiku, real cost+FA); recommendation: +embedBoost alone, defer governsSummary, k10 if stage-2 included; NEW-repo protocol still frozen, NOT run
next: submit with --report citing 4 log/{prior-art.md,red.txt,recall-dev.md,results.md,protocol-new-repos.md,frozen.sha256}
claimed: 2026-11-08 23:55
---
```notes
T120-semantic-routing      ledger task (rules.md §3 code features)      project tasks
    goal                    raise T53 router recall@1/3/5 on real ADR corpora (B2 v4.3: semantic-kernel 0.375, 17/19 pooled misses = routing) via embeddings/governs-summary doc expansion, behind an opt-in flag; measure cost+latency and the none-case false-alarm rate
    done-when               tests-first red->green for the new flag(s) in packages/decisions; recall@1/3/5 measured per repo on DEV = v3 dev + v4.1 dev + v4.2/v4.3 (labeled seen); a frozen pre-registered protocol for >=2 NEW never-used repos exists (leak-gated per constructed-benchmark-leak-gates) with a code hash, NOT run
    status                  2026-11-08 running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T120-semantic-routing · branch ledger/t120-semantic-routing ·
    next                    worker finishes → ledger move <task> submitted --report … (ledger runs the checks row)
    pinned
    mode                    one worker
    boundary               packages/decisions only (route/bm25/types/mentions); no edits to frozen benchmark keys/held-out labels; prior-art.md before code; repos fetched via GitHub contents API or throwaway shallow clones under scratch, never main
    checks                 npx vitest run packages/decisions && npx tsc -b packages/decisions
    non-goals               not re-litigating B2 significance; not a new benchmark version bump (v4.4); not installing paid embedding APIs
    proof                  tasks/T120-semantic-routing/4 log/{prior-art.md,red*.txt,recall-dev.md,protocol-new-repos.md}
    stop                    never edit a frozen benchmark key/held-out label to make a number look better; never run the new pre-registered NEW-repo eval (orchestrator runs it)
    came from               Q13 (B2 v4.3 17/19 misses routing, semantic-kernel recall 0.375)
    links                   4 log/ledger.md (every transition + its evidence)
    harness
```
