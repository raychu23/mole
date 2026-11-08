## Summary

Pre-registered v4.2 base-rate pilot (protocol `evals/inspect/dcbench_eval/experiments/protocol-v4.2.json`,
frozen `protocol-v4.2.sha256` f9d0adae…, verified unedited before this analysis). Single arm (A: dcbench
Config A as shipped — no CLAUDE.md, no `.mole/`, no Mole hooks at all), 2 tasks (TASK-001, TASK-013), 8
epochs each = 16 runs, model claude-sonnet-5 via `hermes -z --safe-mode`, dcbench pin `9f507ce`. Raw:
`tasks/T107-benchmark-v42-base-rate/4 log/raw/runs-v4.2.jsonl`, 16 rows, all `status: "ok"`.

**Pooled result: 0 of 16 runs made the crisp violation, Wilson 95% CI [0.047, 0.146].** Upper bound is below
the pre-registered 20% threshold, so per the decision rule written in `protocol-v4.2.json` before any run:
**dcbench's two crisp tasks do not produce the mistake often enough, with no context at all, for this
benchmark to usefully test a blocking mechanism that only fires on that mistake. Next step: a seeded-trap
benchmark**, not a powered R vs M-block comparison.

This is the clean (non-ambiguous) outcome the protocol's `sample_size_arithmetic` anticipated in advance:
0/16 was the leading-prior scenario named there, as opposed to the "ambiguous middle" (1-3/16) that would
have needed a larger n to resolve.

```notes
results v4.2   (raw tasks/T107-benchmark-v42-base-rate/4 log/raw/runs-v4.2.jsonl, 16 rows, all status ok ·
               model claude-sonnet-5 via hermes --safe-mode · dcbench pin 9f507ce · Mole not invoked (arm A) ·
               scorer score-v42.mjs, intent-to-add + arm-setup-file exclusion, inert for arm A's own data)
    primary (TASK-001 + TASK-013, 8 epochs, arm A only, n = 16 pooled)
        TASK-001 (D-001 CalendarRange import)    0/8 violated, Wilson 95% CI [0.079, 0.245]
        TASK-013 (D-005 PulseLoader import)      0/8 violated, Wilson 95% CI [0.079, 0.245]
        POOLED                                   0/16 violated, Wilson 95% CI [0.047, 0.146]
        decision rule (pre-registered)           pooled upper bound 0.146 < 0.20 -> SEEDED-TRAP BENCHMARK NEXT
    context (not the primary metric, descriptive only)
        points                                   TASK-001 66.7% (8/8 runs identical) · TASK-013 100% (8/8)
        mergeReady                               TASK-001 0/8 · TASK-013 8/8 (alternating run order in the raw file:
                                                 odd epochs TASK-001 false, even epochs TASK-013 true)
        TASK-001 D-001 gotcha detail              passed=false on all 8 runs, but failCheckMatched=false too: the
                                                 agent did not add the optional date-range filter at all (no
                                                 CalendarRange import either) -- same pattern v4.1 found in both
                                                 its arms (0/8 R, 0/8 M-block added it with arm A's own 0/8)
        cost                                      $17.55 total / 16 runs, mean $1.10/run · 49.76M input + 437.8K
                                                 output tokens (cache-read heavy: 48.9M of the 49.76M input tokens
                                                 were cache reads, consistent with dcbench's large seed repo)
        wall time                                 6832.1s total, mean 427.0s/run (~7.1 min)

losses first
    base rate is near zero                   0/16 crisp violations at n=16 -> dcbench's organic gotcha rate for
                                             this model cannot power a blocking (D102) comparison without an
                                             unaffordable sample size; the mechanism this benchmark exists to test
                                             (Stop:block firing on a crisp violation) will almost never fire here
    TASK-001's optional feature skipped      0/8 runs added the date-range filter at all (not a violation, but a
                                             capability gap: points capped at 66.7% because D-001's optional
                                             pass-check never fires either, matching v4.1's R/M-block finding)
    CI still has real width                  pooled upper bound 0.146 is comfortably under 0.20, but is not 0: a
                                             true rate as high as ~14.6% cannot be ruled out at this n; the
                                             decision rule only needed the upper bound under the threshold, not a
                                             point estimate of exactly zero

what it means
    With no project context at all, claude-sonnet-5 essentially never makes dcbench's two crisp mistakes
    (CalendarRange, PulseLoader) on TASK-001/TASK-013 -- 0/16, Wilson upper bound 0.146. Per the protocol's
    pre-written decision rule, dcbench's organic gotcha rate is too low to usefully test Mole's blocking
    hooks (D102): v4.1's null result (0/32 crisp violations in R and M-block) is now explained, not
    resolved -- the mistake rarely happens with this model regardless of context, so a blocking mechanism
    built to catch it has nothing to exercise on this benchmark's existing tasks.
    -> next: build a SEEDED-TRAP benchmark (a task that embeds an existing deprecated pattern the agent must
       avoid copying, rather than relying on dcbench's organic gotcha rate) before any further R vs M-block
       comparison is run. Queued for the orchestrator as item Q9.

claims
    allowed     "in a pre-registered 16-run base-rate pilot (arm A, no context), claude-sonnet-5 made the
                 dcbench crisp mistake 0/16 times, Wilson 95% CI upper bound 0.146 -- below the pre-registered
                 20% threshold, so the next step is a seeded-trap benchmark, not a powered blocking comparison"
    forbidden   any claim that Mole's blocking (D102) helps or hurts productivity or compliance (this spec has
                no M-block arm); any claim this pins down the true base rate precisely (CI upper bound is 0.146,
                not a point estimate of exactly 0)
```
