```notes
ledger (newest last, nothing deleted)
    2026-11-04 15:12      new → proposed      A reusable pre-registered A/B experiment system for testing Mole ideas with coding agents (arms, tasks, freeze, runner adapters, scoring, paired stats with inte
    2026-11-04 15:13      proposed → ready      owner hermes-build
    2026-11-04 15:13      ready → running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T90-ab-experiment-system · branch ledger/t90-ab-experiment-system · base ?
    2026-11-04 15:25      correction (Raymond)      build on Inspect AI (evals/inspect/, already started for T17) instead of a new
                           TS package packages/ab; previous agent removed packages/ab (never committed) + the tsconfig.json
                           reference before the disk-full crash; this run continues from evals/inspect/dcbench_eval/
                           (spec.py, stats.py, registry.py, __init__.py, already written)
    2026-11-04 15:42      resumed, finished      added evals/inspect/dcbench_eval/{reanalyze.py, freeze.py, tests/,
                           experiments/{protocol-v2.json, FROZEN-v2.sha256, registry.json}}, docs/experiments.md,
                           4 log/prior-art.md; 26 passed/1 skipped (inspect_ai not in this venv; the skip is the project's
                           existing convention, see mole_eval/tests/test_task_inspect.py); reanalyze.py reproduces
                           results-72.md exactly (7/7 assertions) and adds bootstrap/clustered-SE/Holm intervals it lacked;
                           protocol-v2.json is pre-registered (hashed + frozen, FROZEN-v2.sha256) and NOT run
    2026-11-04 (review)   FAIL (deleg_72653e2b/task-0.log)      nothing in dcbench_eval/ imported inspect_ai;
                           __init__.py cited task.py/hermes_solver.py/scorer.py that did not exist; docs claimed
                           "logs land in Inspect's own format" with no Inspect Task anywhere; freeze.py segfaults
                           when exec'd directly without the venv python (system numpy is a broken arch on this
                           machine); docs/experiments.md's commands not runnable verbatim (no chmod +x)
    2026-11-04 (fix)       follow-up, FAIL -> fixed      added the REAL Inspect integration: hermes_provider.py
                           (@modelapi "hermes", text-only), worktree_agent.py (the solver mole_ab runs: real
                           `hermes -z` in a per-sample git worktree, pattern from inspect-swe's external-agent
                           wrapper), arms.py (none|rules:PATH|decisions:PATH|plugin_pin:SHA:PATH), scorers.py
                           (mole_check_scorer generic + dcbench_scorer), task.py (generic Task `mole_ab`).
                           chmod +x freeze.py/reanalyze.py; docs now say "always use the venv python" (root cause
                           of the segfault: a broken-arch system numpy, not a Mole bug). Proved end to end: 2 real
                           hermes calls against a tiny synthetic repo, real `.eval` log, saved +
                           `inspect log dump` excerpt in 4 log/mole_ab-e2e-proof.{eval,txt}.
                           NEW EVIDENCE mid-task (orchestrator, error-analysis-72.md): dcbench's scorer.ts
                           grep_diff can't see untracked new-file content (60/111, 54%, of T63's failed gotchas).
                           Fixed in dcbench_score.mjs (git add --intent-to-add before diffing, disclosed
                           deviation, scorer.ts unmodified) + worktree_agent.worktree_diff() (same fix, generic).
                           v1 kept as measured (not retracted), cannot be rescored (no saved diff text in v1/v2);
                           every mole_ab run now saves its full diff in the Inspect log so it CAN be rescored.
                           Sample size for protocol-v3 COMPUTED (not copied from v1/v2's uncomputed n=3) via
                           stats.sample_size_for_mde on T63's measured per-task paired-diff SDs: n=21/arm/task
                           for the primary (R-M) pair at mde=15 (vs n=15 A-M, n=12 A-R) -- protocol-v3.json
                           frozen at FROZEN-v3.sha256; v2 kept frozen as a superseded historical record.
                           reanalyze.py now also reads Inspect .eval logs (--inspect-log, analyze_generic).
                           31 passed (dcbench_eval/tests), red captured first at 4 log/red.txt (3 import errors
                           with the new modules removed, collection failure, genuine red).
    2026-11-04 16:44      running → submitted      report: tasks/T90-ab-experiment-system/4 log/prior-art.md, proof 4 log/mole_ab-e2e-proof.eval + .txt, red.txt, evals/inspect pytest 55 · checks exit 0
    2026-11-04 16:44      checks ran: npm run check in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T90-ab-experiment-system → exit 0 (mole steer: inbox for session s4 was not valid JSON (Unterminated string in JSON at position 31 (lin)
    2026-11-04 16:49      submitted → verified      reviewer hermes-subagent deleg_72653e2b FAIL, deleg_50e433f0 FAIL, orchestrator verify (fresh, claude-sonnet-5) · findings: R1 HIGH Inspect named not used -> real Task mole_ab 1ff998f, R2 worktree leak on solver error ->
    2026-11-04 16:49      checks ran: npm run check in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T90-ab-experiment-system → exit 0 (mole steer: inbox for session s4 was not valid JSON (Unterminated string in JSON at position 31 (lin)
    2026-11-04 16:53      verified → integrated      merge 2255366 (main check: 1396 passed, main-check-waveE.txt) · combined checks exit 0
    2026-11-04 16:53      combined checks ran: npm run check in /Users/a1/Desktop/CS Code/Project/Mole → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
```
