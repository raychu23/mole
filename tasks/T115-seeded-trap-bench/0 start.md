---
status (11-08)   PHASE 1 DONE (Q9, queue item): seeded-trap design + protocol-v5.json frozen + smoked +
                  16-run arm-A base-rate pilot RUN + ANALYSED. Pooled 6/16 = 37.5% (Wilson [0.185, 0.614]),
                  >= the pre-registered 30% gate -> GATE PASSED. Driven almost entirely by SEED-002
                  (75%); SEED-001 scored 0/8 (same failure mode as dcbench's own crisp tasks). Results:
                  context/product-plan/systems/metrics-proof/productivity/results-v5.md + this task's
                  4 log/results-v5.md (identical). Phase 2 (R vs M-block) is orchestrator-dispatched per
                  the brief, not run in this pass.
state: phase-1-done, gate-passed
owner: hermes-build (subagent, T115 dispatch)
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t115-seeded-trap-bench
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T115-seeded-trap-bench
base: 5a64ec7
reviewer: not yet requested
updated: 2026-11-08
status: evals/inspect/dcbench_eval/experiments/protocol-v5.json written + frozen (sha256
         974d562c1378ab1b940367819046a6eb3a748eae0a29120d286a1343bd3f66ce, freeze.py --check passes) ·
         NEW fixture repo + tasks + runner + scorer (all gitignored, context/ only, per convention) ·
         scorer hand-verified on violating + clean hand-crafted diffs before freezing (4 log/scorer-smoke.md) ·
         1 real smoke run (SEED-001, arm A) before the full pilot · full 16-run pilot (2 tasks x 8 epochs,
         arm A) run to completion, all status ok · analysed exactly per the frozen decision rule
next: orchestrator reviews results-v5.md with a fresh challenger, then dispatches phase 2 (powered R vs
      M-block on this fixture: new .mole/decisions for D-201/D-202, new CLAUDE.md arm, new spec v5.1,
      sized from SEED-002's observed 75% rather than the diluted pooled 37.5% -- see results-v5.md
      "what it means")
claimed: 2026-11-08
---
```notes
T115-seeded-trap-bench     ledger task (Q9, from v4.2's "seeded-trap benchmark next" finding)   project tasks
    goal                    Seeded-trap benchmark for blocking (D102): tasks where the repo already
                            contains a deprecated pattern an agent would naturally copy, with a decision +
                            rules: block forbidding it. Pre-register: arm A (no context) base rate must be
                            >= 30% on a pilot before the R vs M-block comparison; then powered R vs
                            M-block on violation rate + fix-after-block + task points.
    phase 1 (this pass)     design (prior art), pre-register protocol-v5.json (>=30% gate), freeze, run the
                            arm-A base-rate pilot, STOP with the pilot result + gate verdict. Phase 2 (R vs
                            M-block) is explicitly NOT run here -- the orchestrator dispatches it once the
                            gate passes.
    prior art               tasks/T115-seeded-trap-bench/4 log/prior-art.md: SWE-bench (Jimenez et al.
                            2310.06770, real latent repo state), SemSeed (Patra & Pradel, FSE 2021,
                            nearby-context imitation), "When LLMs Lag Behind" (Ashik et al. 2604.09515,
                            evolving-API knowledge conflicts), BugPilot (Microsoft, 2510.19898, bugs as a
                            feature-work side effect). 4 dated sources.
    fixture                 context/product-plan/systems/metrics-proof/productivity/seeded-trap-v5/{repo/,
                            tasks.json} (gitignored, context/ only, per AGENTS.md/brief.md convention --
                            matches how run_dcbench_v42.py/score-v42.mjs/results-v41.md/results-v42.md live
                            only in the main checkout, not on any branch). repo pinned commit
                            31e1443f12f075fd2963a3f5ef59fb736ecc00d7. 2 tasks (SEED-001 date formatter,
                            SEED-002 loading indicator), each with 2 sibling files already using an
                            undocumented deprecated symbol, prompt invites consistency without naming it.
    runner + scorer         context/.../scripts/run_seeded_trap_v5.py (NEW file, structurally copies
                            run_dcbench_v42.py: fresh worktree per run, hermes -z, resumable jsonl,
                            --dry-run) + score_seeded_v5.py (NEW file, plain Python regex-over-diff, hand
                            smoke-tested against a violating and a clean hand-written diff before
                            freezing -- 4 log/scorer-smoke.md). Neither touches dcbench, scratch/dcbench*,
                            run_dcbench_v4.py/v42.py, or score.mjs/score-v42.mjs in any way.
    frozen spec              evals/inspect/dcbench_eval/experiments/protocol-v5.json + protocol-v5.sha256
                            (git-tracked, committed on this branch). spec.py/freeze.py reused UNCHANGED.
    result                   pooled 6/16 = 37.5%, Wilson 95% CI [0.185, 0.614] -- GATE PASSED (>= 30%).
                            SEED-001 0/8 (gate would have FAILED on this task alone), SEED-002 6/8 = 75%.
                            Full numbers + losses-first analysis: results-v5.md.
    checks                   freeze.py --check evals/inspect/dcbench_eval/experiments/protocol-v5.json
                            passes · 1 real smoke run (hermes -z, SEED-001, arm A) before the pilot ·
                            16/16 pilot runs status ok, 0 agent_error, 0 score errors
    non-goals               launching R vs M-block on this fixture (phase 2, orchestrator-dispatched);
                            editing any frozen v2/v3/v4/v4.1/v4.2 spec, run_dcbench_v4.py/v42.py,
                            score.mjs/score-v42.mjs; touching scratch/dcbench or scratch/dcbench-v4 (neither
                            exists on this host right now; not recreated for this task); npm run check (no
                            TS package touched)
    came from                results-v42.md's "what it means -> next" line (Q3), queued as Q9 by the
                            orchestrator (queue.json), dispatched per queue/brief.md
    links                    4 log/prior-art.md, 4 log/scorer-smoke.md, 4 log/results-v5.md, 4 log/raw/
                            (runs-v5.jsonl, smoke-v5.jsonl),
                            context/product-plan/systems/metrics-proof/productivity/results-v5.md,
                            evals/inspect/dcbench_eval/experiments/protocol-v5.json
    harness
```
