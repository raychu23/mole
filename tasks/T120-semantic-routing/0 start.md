---
state: running
owner: unclaimed
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t120-semantic-routing
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T120-semantic-routing
base: 9c0ec45
reviewer:
updated: 2026-11-09 08:10
status: ledger running — Q13 NEW-repo eval fixed on ledger/t120c-wire-embed (NOT merged): (1) wired embedBoost/changeEmbedding through cascadeCheck + `--embed-route` CLI flag, tests first (prior product gap: feature was unreachable from a real check); (2) Amendment 2 (frozen) corrected the T53-baseline harness (must configure semanticRoute like v4.3's own harness — explains prior run's 0/0) and REJECTED the Amendment-1 64-case set (no-context LLM gate failed violate class 78.3%); (3) rebuilt 33-case set, re-gated (violate/compliant pass; no_decision has a disclosed residual, see rebuild-gate-results.md), ran all 3 arms once — decision: NO IMPROVEMENT SHOWN (B's recall 0.667 < A's 0.750, condition 1 of the pre-registered rule fails outright). embedBoost stays opt-in. Flagged for Raymond: no authority to change the default under this outcome.
next: Raymond review of ledger/t120c-wire-embed (merge decision); a larger-n re-run of the NEW-repo eval (closer to Amendment 1's 64-case scale, both violate AND no_decision classes properly gated) would be needed before any stronger embedBoost claim on new repos
claimed: 2026-11-08 23:55
---
```notes
T120-semantic-routing      ledger task (rules.md §3 code features)      project tasks
    goal                    raise T53 router recall@1/3/5 on real ADR corpora (B2 v4.3: semantic-kernel 0.375, 17/19 pooled misses = routing) via embeddings/governs-summary doc expansion, behind an opt-in flag; measure cost+latency and the none-case false-alarm rate
    done-when               tests-first red->green for the new flag(s) in packages/decisions; recall@1/3/5 measured per repo on DEV = v3 dev + v4.1 dev + v4.2/v4.3 (labeled seen); a frozen pre-registered protocol for >=2 NEW never-used repos exists (leak-gated per constructed-benchmark-leak-gates) with a code hash; NEW-repo eval RUN (ledger/t120c-wire-embed): NO IMPROVEMENT SHOWN
    status                  2026-11-09 running      ledger/t120c-wire-embed (product-gap fix + amendment 2 + rebuilt eval, not merged) · also ledger/t120b-new-repo-eval (first run, superseded)
    next                    Raymond reviews/merges ledger/t120c-wire-embed; decides whether a larger-n re-run is worth it
    pinned
    mode                    one worker
    boundary               packages/decisions only (route/bm25/types/mentions/cascade); no edits to frozen benchmark keys/held-out labels; prior-art.md before code; repos fetched via GitHub contents API or throwaway shallow clones under scratch, never main
    checks                 npx vitest run packages/decisions && npx tsc -b packages/decisions
    non-goals               not re-litigating B2 significance; not a new benchmark version bump (v4.4); not installing paid embedding APIs
    proof                  tasks/T120-semantic-routing/4 log/{prior-art.md,red*.txt,recall-dev.md,protocol-new-repos.md,protocol-new-repos-amendment-2.md,rebuild-gate-results.md,results-new-repos-v2.md,bundle-size.md}
    stop                    never edit a frozen benchmark key/held-out label to make a number look better
    came from               Q13 (B2 v4.3 17/19 misses routing, semantic-kernel recall 0.375)
    links                   4 log/ledger.md (every transition + its evidence)
    harness
```
