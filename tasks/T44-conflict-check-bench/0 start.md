---
state: ready
owner: t44-bench
repo:
branch:
worktree:
base:
reviewer:
updated: 2026-11-01 17:51
status: ledger ready
next: worker claims it → ledger move <task> running --orca | --git-worktree | --worktree PATH
---
```notes
T44-conflict-check-bench      ledger task (rules.md §3 code features)      project tasks
    goal                    M2 resume metric: does Mole flag changes that break an approved team decision? precision/recall/false-alarm rate + $/tokens/p95 ms per check vs LLM reviewer with same decisions, RAG review, linter rules, no check, on a frozen labelled set (Backstage ADRs + Rust RFC decisions).
    done-when               1 prior-art.md (>=5 dated primary sources: SWR-Bench, code-review benchmarks, ADR/architecture conformance checking, LLM-judge cost papers) · 2 protocol + labels frozen and hashed before any arm runs, ~60 changes half breaking · 3 Mole arm uses only shipped code (packages/decisions scope/guard + packages/reasoning), gaps implemented as a reviewed product change, not bench-only glue · 4 all arms run, results.json/results.md with Wilson/bootstrap CIs, cost + latency, loss-first · 5 held-out split untouched while tuning
    status                  2026-11-01 ready      owner t44-bench
    next                    worker claims it → ledger move <task> running --orca | --git-worktree | --worktree PATH
    pinned
    mode                    one worker
    boundary                context/product-plan/systems/metrics-proof/m2-conflict/** + any product change in its own ledger task
    checks                  npm run check
    non-goals               no product code changes in this task (a found gap becomes a new ledger task proposal, not a patch here) ·
                            not claiming the ~60-case target if time forces a smaller frozen set — say the real N ·
                            Rust RFC arm optional, Backstage ADRs is the required corpus
    proof                   m2-conflict/4 log/prior-art.md (>=5 dated sources) · m2-conflict/protocol.md + its sha256 frozen before any
                            arm runs · m2-conflict/{dev,heldout}.json cases with real diffs + labels · m2-conflict/results.json +
                            results.md (precision/recall/false-alarm with CIs, cost, latency, loss-first) · ledger.md log of transitions
    stop                    if the Mole arm cannot run fairly on shipped code alone (e.g. checkrun.ts's hardcoded 'success' conclusion),
                            stop that arm, write the gap as a proposed ledger task, and report the other arms honestly rather than
                            patching product code inside this task
    came from               D92/§5 test standards + verifier metrics 11-01.md; USER 11-01 'do whatever needed next'
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
