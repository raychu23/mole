# T110-history-replay-bench (Q4) -- H2-style real-history benchmark

goal      v2 fixes a review FAIL on v1 (positives were scored against the FINAL MERGED/already-fixed PR
          diff instead of the commit the human's ADR comment was anchored to) and widens the repo search
          per the queue brief's "Added 11-08" instructions. Full goal: Q4 in
          `context/product-plan/systems/queue/queue.json` + brief at `systems/queue/brief.md`.
done-when  defect fixed + v1 kept as a recorded failed attempt; widen search logged (repos tried, queries,
          yield reported honestly even if short of target); v2 case set frozen by sha256 BEFORE any arm;
          T53/reviewer/RAG/T46-cascade run once; results-v2.md losses-first with Wilson CIs + McNemar where
          n allows + per-failure (routing vs check) analysis. DONE.
status    VERIFIED (this task's own run; v2 review FAIL #2 fixed 2026-11-08 -- not yet independently
          re-reviewed). v2 n=11 (4 positive/7 negative, backstage/backstage only). Widen search (41 repos,
          ~128 queries, `4 log/search_log_v2.txt`) found 0 ADDITIONAL confirmed positives beyond the
          original 4 -- the >=30 target is NOT met, reported honestly. All 4 arms run once, no significance
          claim (n far below power target), McNemar computed but flagged uninformative. 2026-11-08: fixed
          run_t46_cascade_v2.mjs's checkStep() ignoring compiled patterns' `in:` glob scope
          (DEFECT_V2_FILESCOPE.md); check-only re-run (no recompile); T46 cascade numbers in results-v2.md
          corrected in place (recall 1.000->0.250, false-alarm 0.429->0.143).
next      Q6 (T112-b2-powered, this task covers "the first half") still needs either a genuinely larger
          real-history set (a different mining strategy than keyword/comment search -- this task's finding
          is that AI review bots now do a large share of what a human ADR citation used to look like, and
          most ADR-keeping repos don't have explicit violation call-outs at all) or falls back to
          constructed cases with the v3 power target.

## Evidence

```notes
defect      DEFECT.md (what was wrong, how it was found, the fix)
v1 (failed) v1-failed-attempt/ -- protocol.md, cases_h2.json, frozen.sha256, results.md, search_log.txt,
            run/ -- UNCHANGED, kept as the recorded failed attempt.
search v2   4 log/search_log_v2.txt (41 repos, ~128 queries, every total_count + the specific rejection
            reason for every non-zero hit followed up)
protocol v2 protocol_v2.md (defect fix, widen search method + honest yield, case set, arm list), frozen
            BEFORE any arm: frozen_v2.sha256 (protocol_v2.md, cases_h2_v2.json, 4 log/search_log_v2.txt,
            DEFECT.md)
case set v2 cases_h2_v2.json (11 cases: 4 pre-fix positives + 4 paired-fixed negatives + 3 same-file
            negatives carried from v1, diff + real ADR text + verbatim human signal quote + label)
run scripts run/run_t53_v2.mjs (T53), run/run_arms_v2.py (reviewer + RAG, hermes -z claude-sonnet-5),
            run/run_t46_cascade_v2.mjs (NEW: compile-at-capture + zero-LLM check, T46 pattern)
raw output  run/arm_t53_v2.json, run/arm_reviewer_v2.json, run/arm_rag_v2.json,
            run/arm_t46_cascade_v2.json, run/compiled_adrs_v2.json
scored      run/scored_v2.json (Wilson CIs via evals/inspect/dcbench_eval/stats.py's wilson())
write-up    results-v2.md (losses first, per-case table, per-failure routing-vs-check analysis, limits)
```
