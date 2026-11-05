## Summary
Exact command to launch the full protocol-v4.1 pilot (NOT run by this task -- prepare/freeze/smoke only,
per the brief). Detached (`screen -dmS`), logs to scratch, resumable (skips run ids already present in the
output file, so a kill + restart picks up where it left off). Uses the UPDATED runner's `--full-v41`
schedule: crisp tasks (TASK-001/D-001, TASK-013/D-005) x 8 epochs first, then the other 6 tasks x 1 epoch,
interleaved by arm within each -- 44 runs total, per `protocol-v4.1.json`.

Supersedes the previous (v4) launch command in this file's git history: v4's command used `--epochs 3`
across all 8 tasks uniformly and resolved Mole from the live repo. Round-1 review (deleg_b40d00a6, task-1)
required both changes before any scored run; see `4 log/evidence.md` for the full FIX writeup.

## Pre-flight (re-check immediately before launching; main keeps moving tonight)
```sh
df -h /System/Volumes/Data   # Wave G rule: stop under 6 GB free
test -f "/Users/a1/.hermes/cache/scratch/dcbench-v4/mole-pinned/dist/cli.js" && echo "pinned CLI present"
grep -q crispViolationsForOverlay "/Users/a1/.hermes/cache/scratch/dcbench-v4/mole-pinned/scripts/lib.mjs" && echo "D102 marker present in pinned Mole"
python3 "/Users/a1/Desktop/CS Code/Project/Mole/evals/inspect/dcbench_eval/freeze.py" --check \
  "/Users/a1/Desktop/CS Code/Project/Mole/evals/inspect/dcbench_eval/experiments/protocol-v4.1.json"
```
Mole is PINNED (requirement 2 of the review): the M arm's hooks + CLI resolve from
`scratch/dcbench-v4/mole-pinned` (built from main @ `e4eafe21e0b5f7e83fd91b85124ece2c0dbdac3f`, tarball
sha256 `f0bbc96596d5102bfb9ebcf21cf6c0129d4d9164b53f6b9bb2fc20a92f2f4ea1`), NOT the live repo -- T96/T98
merging into `packages/daemon`/`packages/server` tonight cannot change this pilot's hooks mid-run. If a
newer main is wanted for the real run, rebuild the pin FIRST (`cd release/mole-code && node tools/build.mjs
&& npm pack`, reinstall into `mole-pinned/`, update its `SOURCE.json`) -- that is a NEW pin, not a live-repo
fallback, and per `protocol-v4.1.json`'s `stop_rules` is treated the same as a stop-and-restart condition if
it happens mid-run.

## Launch command
```sh
mkdir -p "/Users/a1/Desktop/CS Code/Project/Mole/tasks/T97-benchmark-v4-blocking/4 log/raw"
screen -dmS t97-v4.1-pilot bash -c '
python3 "/Users/a1/Desktop/CS Code/Project/Mole/context/product-plan/systems/metrics-proof/productivity/scripts/run_dcbench_v4.py" \
  --full-v41 \
  --out "/Users/a1/Desktop/CS Code/Project/Mole/tasks/T97-benchmark-v4-blocking/4 log/raw/runs-v4.1.jsonl" \
  > /Users/a1/.hermes/cache/scratch/dcbench-v4/pilot-run-v4.1.log 2>&1
'
```

Check progress any time with `screen -r t97-v4.1-pilot` (detach again with `Ctrl-A D`), or
`tail -f /Users/a1/.hermes/cache/scratch/dcbench-v4/pilot-run-v4.1.log`.

If it dies partway (disk, network, a crash), relaunch the SAME command -- `run_dcbench_v4.py --full-v41`
skips any `run_id` already present in `runs-v4.1.jsonl`, so it resumes rather than re-running completed
samples.

## Cost / size (as pre-registered in protocol-v4.1.json)
- Primary: 2 arms (R, M-block) x 2 crisp tasks (TASK-001, TASK-013) x 8 epochs = **32 scored runs**.
- Secondary: 2 arms x 6 other tasks x 1 epoch = **12 scored runs**.
- **44 scored runs total**, interleaved by arm, crisp tasks first (per the budget in the brief and
  `protocol-v4.1.json`'s `sample_size_arithmetic`).
- At v1's measured ~10 min/run (results-mj.md): **~7.3 hours** wall time, inside the brief's ~8h ceiling.
- Primary-outcome MDE at n=8 runs/arm/task on dcbench points: **~46 points** (not powered for a real
  effect; a pilot, not a confirmatory design -- see `protocol-v4.1.json`'s `sample_size_arithmetic`).
- Token/cost estimate from the TASK-013 smoke pair (real billed usage): R $1.39 (3.9M in / 33.4K out, 44
  API calls, 405.5s), M-block $0.61 (1.1M in / 22.8K out, 21 API calls, 251.9s) -- M-block ran roughly
  half the cost and time of R this pair, the same direction v1 and the v4 TASK-001 smoke found. At ~$2.00
  per run-pair, 22 run-pairs ~= $44 total, rough order of magnitude only (costs vary per task/prompt).

## Analysis after the run
```sh
python3 -c "
import json, sys
sys.path.insert(0, '/Users/a1/Desktop/CS Code/Project/Mole/evals/inspect/dcbench_eval')
# load raw/runs-v4.1.jsonl, split TASK-001/TASK-013 (primary) vs the other 6 (secondary),
# run fisher_exact + newcombe_diff on violation-at-end, paired_permutation_test on points --
# see protocol-v4.1.json's analysis_plan for the exact method per outcome.
"
```
(No single reanalyze.py entry point exists yet for the v4.1 primary/secondary split -- `reanalyze.py`'s
`analyze()`/`analyze_generic()` cover the all-8-task case; the crisp-tasks-only primary outcomes (violation-
at-end rate, Stop-block fire rate, fix-after-block rate) need a short new script reading `runs-v4.1.jsonl`
directly, per `protocol-v4.1.json`'s `analysis_plan`. Writing that script is in scope for whoever runs and
analyzes the pilot, not for this prepare/freeze/smoke task.)
