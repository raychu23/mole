---
state: integrated
owner: t54-builder
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t54-engine-in-check
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T54-engine-in-check
base: f6d9af5
reviewer: hermes-subagents deleg_15f56175, deleg_e17ab4d3, deleg_e03f57e3, deleg_48978bd8 (FAIL rounds, fixed) + deleg_0df50eb1 adjudication PASS (fresh, claude-sonnet-5)
updated: 2026-11-02 18:25
status: ledger integrated
next: record outcome → ledger move <task> done --outcome … --resources … --prevents …
claimed: 2026-11-02 10:50
---
```notes
T54-engine-in-check      ledger task (rules.md §3 code features)      project tasks
    goal                    Put the reasoning engine (packages/reasoning, T42) and the argument links (T48: supports/attacks/undercuts, Argdown) into the change-check path, so a flagged change is judged against the decision's argument chain (objections answered/standing, team value order) rather than its text alone; makes resume B2's 're-runs the team's argument chain' true. Prior art first: Carneades proof standards (Gordon & Walton), ASPIC+ / abstract argumentation for requirements & design rationale (e.g. argumentation-based design rationale checking), ArgLLMs (arXiv 2405.02079).
    done-when               1 prior-art note · 2 failing tests first · 3 cascade verdict carries the engine's labels for the decision's arguments (which still stand) and uses them in the judge prompt or rules · 4 M2 v2 re-run (dev tuned, held-out once): recall and false alarms no worse than T53 (0.96 / 0.05 all-61), report any change · 5 npm run check
    status                  2026-11-02 integrated      merge 3a0f2d1 (main check 960 pass, /Users/a1/.hermes/cache/scratch/mole-build/main-check-t54.txt) · combined checks exi
    next                    record outcome → ledger move <task> done --outcome … --resources … --prevents …
    pinned
    mode                    one worker
    boundary                packages/decisions/src/cascade/** + packages/decisions/src/argdown/** (new derive module) + reasoning wiring + tests
    checks                  npm run check
    non-goals               no proof-standard layer in packages/reasoning (Carneades-style burden of proof), no PCS/inference-rule support in the Argdown parser, no bipolar/gradual (ArgLLMs QBAF) evaluator -- grounded Dung semantics only, no hand-authored .mole/arguments/*.argdown files added to the bench corpora, no change to T53's semantic routing or T49's batched-escalation mechanics beyond the escalation prompt's own text
    proof                   tasks/T54-engine-in-check/4 log/prior-art.md (dated) + failing-then-green tests for the new derive module and its cascade wiring + context/product-plan/systems/metrics-proof/m2-conflict/v2/t54-results.md (dev-tuned, held-out once) vs T53's t53-results.md
    stop                    stop and ask Raymond if npm run check regresses any pre-T54 test, or if the M2 v2 held-out run shows recall or false-alarm rate worse than T53's all-61 (0.96 / 0.05) without a clear, documented reason
    came from               USER 11-02 'all needed mentioned'; S6 blocker #244 B2 wording
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
