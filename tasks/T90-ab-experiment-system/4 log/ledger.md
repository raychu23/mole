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
```
