## Summary

This is the pre-registered v4.1 pilot (protocol `evals/inspect/dcbench_eval/experiments/protocol-v4.1.json`, frozen before any scored run). It tests Mole as it ships now, with the hooks that block a crisp rule violation (D102), against R: the same decisions pasted into CLAUDE.md. It ran 44 runs, all ok, with arms interleaved, overnight 11-04 22:34 → 11-05 ~03:50. The Mole build was pinned (mole-code from main e4eafe2, tarball sha256 f0bbc965…).

**The blocking hooks were never needed.** On the two tasks where a crisp rule exists (TASK-001: no deprecated CalendarRange import; TASK-013: no deprecated PulseLoader), **no run in either arm made the violation**: 0 of 16 R runs and 0 of 16 Mole runs. So the Stop hook blocked 0 times and nothing had to be fixed. The pilot cannot say whether blocking helps, because the mistake it blocks did not happen.

On points, the arms are close and nothing is significant. On the two crisp tasks R scored 89.6% and Mole 83.3%. The gap is TASK-001, where R added the date-range filter (with the right component) in 3 of 8 runs and Mole in 0 of 8. Across all 8 tasks Mole scored 77.2% and R 75.4% (paired permutation on task means, p = 0.5). Mole used 12% fewer tokens (39.6 M vs 45.1 M), the same direction as v1.

What's open: measure how often the agent makes the crisp mistake with no context at all (arm A on TASK-001/013). If it never does, dcbench cannot test blocking, and a benchmark with seeded crisp traps is needed.

```notes
results v4.1   (raw tasks/T97-benchmark-v4-blocking/4 log/raw/runs-v4.1.jsonl 44 rows, all status ok · model claude-sonnet-5
                via hermes · dcbench pin 9f507ce · Mole pinned e4eafe2 · scorer = v3 fix, intent-to-add, full diffs saved)
    primary (TASK-001 + TASK-013, 8 epochs x 2 arms = 32 runs)
        (a) crisp violation left at end     R 0/16 · M-block 0/16 · Fisher p = 1.0 · Newcombe diff 0.0 [-0.154, 0.154]
        (b) Stop-hook blocks                0/16 M-block runs · resumes 0 · fix-after-block n/a (denominator 0)
        (c) points on the 2 crisp tasks      R 89.6% · M-block 83.3% · paired permutation on task means p = 1.0 (n = 2)
            Holm over (a), (c)               1.0, 1.0
        TASK-001 detail                      R 79.2% (merge-ready 3/8) · M-block 66.7% (0/8)
                                             difference = D-001's pass check (adds an import of DateRangePicker):
                                             R 3/8 runs added date filtering with DateRangePicker; M-block 0/8 added it at all
                                             (no run in either arm imported CalendarRange)
        TASK-013 detail                      R 100% (8/8) · M-block 100% (8/8)
    secondary (all 8 tasks, descriptive, 1 epoch on the 6 non-crisp tasks)
        per-run mean points                  R 75.4% · M-block 77.2% · merge-ready R 13/22 · M 11/22
        task means R / M                     001 79.2/66.7 · 003 0/40 · 004 0/0 · 006 25/25 · 008 0/100 · 009 100/100
                                             012 100/100 · 013 100/100
        paired permutation (8 task means)    M - R = +15.9 pts · p = 0.5 (exact) · driven by n = 1 tasks 008 and 003
    cost                                     tokens R 45.1 M · M 39.6 M (-12%) · mean wall s R 301 · M 291 · Stop hook 16.5 s mean
    scorer check (post hoc, recorded here)   the M arm's .mole/decisions files appear as new files in the diff (R's CLAUDE.md
                                             does not); re-ran every grep_diff pass/fail check on the diff without .mole/ and
                                             CLAUDE.md: 0 of all checks change → no score affected

losses first
    blocking never exercised              0 violations in 32 crisp-task runs → no evidence for or against D102 on dcbench
    TASK-001                               Mole skipped the optional date filter every time (0/8 vs 3/8), lower points
    pilot power                            MDE ~46 pts at n = 8 per arm per task (protocol); everything here is descriptive

what it means
    v1's CalendarRange failures do not recur with the fixed scorer: error-analysis-72.md already found most v1 "violations"
    were scorer artefacts. The agent (sonnet-5) does not make dcbench's crisp mistake here, with or without Mole.
    → next: base rate with no context (arm A on TASK-001/013, 8 epochs each, pre-register as v4.2) · if ~0, build a
      benchmark with seeded crisp traps (an existing deprecated pattern the agent must not copy) before claiming
      anything about blocking

claims
    allowed     "in a pre-registered 44-run pilot the blocking hooks never fired: the agent made 0 crisp violations in
                 either arm; Mole used 12% fewer tokens"
    forbidden   any claim that blocking improves compliance or productivity
```
