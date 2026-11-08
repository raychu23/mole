# T110-history-replay-bench (Q4) -- H2-style real-history benchmark

goal      Mine REAL merged PRs with a REAL human signal (not a model) tying them to an ADR, plus matched
          same-file negatives; pre-register + freeze by sha256 BEFORE any arm runs; run T53 Mole / RAG /
          reviewer / linter once; report recall/false-alarm with Wilson CIs, losses first. Full goal: Q4 in
          `context/product-plan/systems/queue/queue.json` + brief at `systems/queue/brief.md`.
done-when  search logged + reproducible, case set + protocol frozen before any arm, 4 arms run once,
          results.md written losses-first, numbers cite their source file. DONE.
status    VERIFIED (this task's own run, not independently reviewed yet). n=7 (4 positive/3 negative,
          backstage/backstage only) -- far below the pre-registered power target (~415-440): run
          descriptively per Q4's own instruction, no significance claim made.
next      Q6 (T112-b2-powered) is the queue's next lever for a bigger set. A follow-up could broaden the
          repo search (more ADR-keeping OSS repos, explicit bot-exclusion built into the search from the
          start) to grow real-case n before resorting to constructed cases again.

## Evidence

```notes
search            4 log/search_log.txt (every gh api query + its total_count, ~45 queries/6 repos + 1
                  global pass), prior-art.md
protocol          protocol.md (positive/negative definitions, power calc, arm definitions), frozen before
                  any arm: frozen.sha256 (protocol.md, cases_h2.json, 4 log/search_log.txt)
case set          cases_h2.json (7 cases, diff + real ADR text + verbatim human signal quote + label)
run scripts       run/run_t53_h2.mjs (T53, main's built packages/decisions/dist), run/run_arms_h2.py
                  (reviewer + RAG, hermes -z claude-sonnet-5), run/run_linter_h2.py (v3's compile_rule(),
                  zero model calls)
raw arm output    run/arm_t53_h2.json, run/arm_reviewer_h2.json, run/arm_rag_h2.json, run/arm_linter_h2.json
scored            run/scored_h2.json (Wilson CIs via evals/inspect/dcbench_eval/stats.py's wilson())
write-up          results.md (losses first, per-case table, limits)
```
