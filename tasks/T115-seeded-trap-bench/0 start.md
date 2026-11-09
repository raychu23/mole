---
status (11-08)   PHASE 2 DONE (Q9, queue item): step 1 (protocol-v5.1.json, 2 new SEED-002-style traps,
                  SEED-003/SEED-004, same design principle, different domains) RUN + ANALYSED -- BOTH
                  FAILED the pre-registered per-task 30% gate (0/8 each, Wilson CI [0, 0.324]). Only
                  SEED-002 (phase 1) clears this gate, so only 1 of {SEED-002,SEED-003,SEED-004} passes --
                  below the ">=2 tasks" threshold protocol-v5.1.json's own decision rule requires. STEP 2
                  (R vs M-block, protocol-v5.2.json) WAS NOT RUN and protocol-v5.2.json was never written,
                  per that same pre-registered rule. Results: context/product-plan/systems/metrics-proof/
                  productivity/results-v52.md + this task's 4 log/results-v52.md (identical).
state: phase-2-done, step1-gate-failed, step2-not-run
owner: hermes-build (subagent, T115 phase-2 dispatch)
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t115b-seeded-trap-phase2
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T115b-seeded-trap-phase2
base: f7fd002 (main, at dispatch)
reviewer: not yet requested
updated: 2026-11-08
status: evals/inspect/dcbench_eval/experiments/protocol-v5.1.json written + frozen (sha256
         2c6eb84e1b43bef579669ab1bc61c3261692b1c2a6b47e88e577c96efc09ef76, freeze.py --check passes) ·
         2 new fixture sibling-trap pairs committed to the seeded-trap-v5 fixture repo (new pin
         bf79b8e2f761ebfd4c38d7084c02c2def15b5183, parent 31e1443f, file-additions only) · scorer
         hand-verified against both new tasks before freezing (4 log/scorer-smoke-v51.md) · 16-run
         arm-A pilot (SEED-003 + SEED-004, 8 epochs each) run to completion, all status ok · analysed
         exactly per the frozen decision rule -- GATE FAILED on both new tasks · protocol-v5.2.json
         deliberately NOT written (pre-registered gate for step 2 was not met)
next: orchestrator reviews results-v52.md with a fresh challenger. If Q9 continues: either (a) a fresh
      round of SEED-00x trap design testing whether the modern replacement's accessibility/semantic
      self-evidence (not just "unlabeled legacy component + 2 siblings") is the active ingredient
      (results-v52.md "what it means"), or (b) report that this seeded-trap substrate, as designed so
      far, reliably produces only 1 usable base-rate task (SEED-002) and stop here.
claimed: 2026-11-08
---
```notes
T115-seeded-trap-bench     ledger task (Q9, from v4.2's "seeded-trap benchmark next" finding)   project tasks
    goal                    Seeded-trap benchmark for blocking (D102): tasks where the repo already
                            contains a deprecated pattern an agent would naturally copy, with a decision +
                            rules: block forbidding it. Phase 1: base rate pilot + pooled 30% gate.
                            Phase 2 step 1 (this pass): add 2-3 more SEED-002-style traps (same principle,
                            different domains), pre-register a NEW per-task 30% gate (v5.1), freeze, run
                            arm A 8 epochs each, keep only tasks that pass. Phase 2 step 2 (conditional,
                            only if >=2 tasks pass): pre-register R vs M-block (v5.2) BEFORE running it,
                            power from the observed base rate, run interleaved, analyse losses first.
    phase 1 (prior pass)    pooled 6/16 = 37.5% GATE PASSED; SEED-001 0/8, SEED-002 6/8=75% (asymmetric).
                            tasks/T115-seeded-trap-bench/4 log/results-v5.md.
    phase 2 step 1 (this)   2 NEW tasks added to the fixture repo (new pin bf79b8e2f761ebfd4c38d7084c02c2
                            def15b5183): SEED-003 (icon-action buttons: legacy ActionIcon <span> vs modern
                            IconButton <button aria-label>, siblings Toolbar.tsx/RowActions.tsx, new file
                            ToolbarMenu.tsx) and SEED-004 (row status indicators: legacy StatusTag
                            colour-only <span> vs modern StatusBadge role="status", siblings
                            TicketRow.tsx/TaskRow.tsx, new file ProjectRow.tsx). Pre-registered
                            protocol-v5.1.json (per-task >=30% gate, NOT pooled -- phase 1's own losses
                            flagged a pooled gate as a property of a 2-task mix, not of every task in it),
                            frozen BEFORE any run, scorer hand-smoked against both new tasks first
                            (4 log/scorer-smoke-v51.md), then 16 real runs (8 epochs x 2 tasks, arm A,
                            hermes -z --safe-mode claude-sonnet-5). RESULT: SEED-003 0/8, SEED-004 0/8 --
                            BOTH FAIL the per-task gate (same failure mode as phase 1's SEED-001).
    phase 2 step 2          NOT RUN. Decision rule (protocol-v5.1.json, frozen 2026-11-08, before this
                            run): step 2 needs >=2 tasks clearing the gate across {SEED-002 (already
                            cleared, phase 1), SEED-003, SEED-004}. Only SEED-002 cleared (1 < 2) ->
                            step 2 does not run on this fixture. protocol-v5.2.json was never written.
                            No CLAUDE.md arm, no .mole/decisions D-20x records, no M-block runs exist.
    runner + fixture         NEW run_seeded_trap_v51.py (context/.../scripts/, byte-identical to
                            run_seeded_trap_v5.py except PIN/TASKS/RUNS -- that frozen file is untouched),
                            score_seeded_v5.py REUSED UNCHANGED (generic over tasks.json). Fixture repo's
                            new commit only ADDS files (8 new .tsx files: 2 legacy, 2 modern, 4 siblings);
                            SEED-001/SEED-002's own files and tasks.json entries byte-identical to phase 1.
    frozen spec              evals/inspect/dcbench_eval/experiments/protocol-v5.1.json + .sha256
                            (git-tracked, committed on this branch). protocol-v5.json (phase 1) untouched.
    result                   SEED-003 0/8 (Wilson [0, 0.324]), SEED-004 0/8 (Wilson [0, 0.324]) -- both
                            GATE FAILED. Full numbers + losses-first analysis: 4 log/results-v52.md.
    checks                   freeze.py --check evals/inspect/dcbench_eval/experiments/protocol-v5.1.json
                            passes · scorer hand-smoked against both tasks (violating + clean diff each)
                            before freezing · 16/16 real pilot runs status ok, 0 agent_error, 0 score
                            errors · 2 dry-run smoke rows excluded from the scored analysis
    non-goals                running R vs M-block / writing protocol-v5.2.json (step 2's own pre-registered
                            gate was not met); editing protocol-v2/v3/v4/v4.1/v4.2/v5.json, run_dcbench_v4
                            .py/v42.py, run_seeded_trap_v5.py, score.mjs/score-v42.mjs/score_seeded_v5.py
                            (all untouched); touching scratch/dcbench or scratch/dcbench-v4 (neither
                            exists on this host; not recreated); npm run check (no TS package touched)
    came from                results-v5.md's "what it means -> next" line (Q9 phase 2, orchestrator
                            dispatch note, queue/brief.md "Added 11-08")
    links                    4 log/scorer-smoke-v51.md, 4 log/results-v52.md,
                            context/product-plan/systems/metrics-proof/productivity/results-v52.md,
                            context/.../seeded-trap-v5/raw/runs-v51.jsonl,
                            evals/inspect/dcbench_eval/experiments/protocol-v5.1.json
    harness
```
