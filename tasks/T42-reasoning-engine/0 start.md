---
state: ready
owner: reasoning-builder
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch:
worktree:
base:
reviewer:
updated: 2026-11-01 16:19
status: ledger ready
next: worker claims it → ledger move <task> running --orca | --git-worktree | --worktree PATH
---
```notes
T42-reasoning-engine      ledger task (rules.md §3 code features)      project tasks
    goal                    Build Mole's reasoning engine (human-graph W4/W6 core): new package packages/reasoning in TypeScript computing grounded semantics over an argument framework (args + attacks), a value/audience filter (Bench-Capon VAF: an attack succeeds unless the attacked argument's value is preferred by the audience), labels in/out/undecided with an explanation path (which in-argument defeats it), and incremental re-evaluation on edits that matches full recomputation; plus a CLI (JSON stdin -> JSON stdout) so evals can call it.
    done-when               1) vitest suite: Nixon diamond (grounded empty), chains, even/odd cycles, self-attack, audience cases from Bench-Capon examples, explanation paths; 2) oracle gate: same fixtures through an independent reference (Carneades-4 dung solver via go if installable, else TweetyProject SimpleGroundedReasoner via java, else a documented second independent implementation) agree 100%; 3) randomized property test: incremental == full recompute on >=500 random edit sequences; 4) p95 evaluation time on 10k-argument random graphs reported; 5) npm run check passes on main
    status                  2026-11-01 ready      owner reasoning-builder
    next                    worker claims it → ledger move <task> running --orca | --git-worktree | --worktree PATH
    pinned
    mode                    code
    boundary                packages/reasoning/**, tsconfig.json reference, tasks/T42*/**
    checks                  npm run check
    non-goals               no preferred/stable semantics in production (NP-hard; toy fixtures only) · no LLM calls in the engine · no store/Postgres changes · no edits to other packages
    proof                   vitest output + oracle agreement table + property-test log + p95 table in 4 log/
    stop                    same check failure 3 rounds · oracle disagreement that cannot be explained
    came from               USER 11-01 'well make the fixes then … wjhy isnt reasoning engine running.' · plan update 11-01 §8 · research/consolidation-semantics/memo.md
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
