---
state: proposed
owner:
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch:
worktree:
base:
reviewer:
updated: 2026-11-08 23:54
status: ledger proposed
next: fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
---
```notes
T120-semantic-routing      ledger task (rules.md §3 code features)      project tasks
    goal                    raise T53 router recall@1/3/5 on real ADR corpora (B2 v4.3: semantic-kernel 0.375, 17/19 pooled misses = routing) via embeddings/governs-summary doc expansion, behind an opt-in flag; measure cost+latency and the none-case false-alarm rate
    done-when               tests-first red->green for the new flag(s) in packages/decisions; recall@1/3/5 measured per repo on DEV = v3 dev + v4.1 dev + v4.2/v4.3 (labeled seen); a frozen pre-registered protocol for >=2 NEW never-used repos exists (leak-gated per constructed-benchmark-leak-gates) with a code hash, NOT run
    status                  2026-11-08 proposed
    next                    fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
    pinned
    mode                    one worker
    boundary
    checks
    non-goals
    proof
    stop                    never edit a frozen benchmark key/held-out label to make a number look better; never run the new pre-registered NEW-repo eval (orchestrator runs it)
    came from               Q13 (B2 v4.3 17/19 misses routing, semantic-kernel recall 0.375)
    links                   4 log/ledger.md (every transition + its evidence)
    harness
```
