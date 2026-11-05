## Summary
Exact command to launch the full 48-run pilot (NOT run by this task -- prepare/freeze/smoke only, per the
brief). Detached, logs to scratch, resumable (skips run ids already in the output file, so a kill + restart
picks up where it left off). Run from the MAIN repo (or this task's worktree -- both have the same script
and point at the same pinned `scratch/dcbench-v4` copy).

## Launch command

```sh
mkdir -p "/Users/a1/Desktop/CS Code/Project/Mole/tasks/T97-benchmark-v4-blocking/4 log/raw"
screen -dmS t97-v4-pilot bash -c '
python3 "/Users/a1/Desktop/CS Code/Project/Mole/context/product-plan/systems/metrics-proof/productivity/scripts/run_dcbench_v4.py" \
  --epochs 3 \
  --tasks TASK-001,TASK-003,TASK-004,TASK-006,TASK-008,TASK-009,TASK-012,TASK-013 \
  --arms R,M-block \
  --out "/Users/a1/Desktop/CS Code/Project/Mole/tasks/T97-benchmark-v4-blocking/4 log/raw/runs-v4.jsonl" \
  > /Users/a1/.hermes/cache/scratch/dcbench-v4/pilot-run.log 2>&1
'
```

Check progress any time with `screen -r t97-v4-pilot` (detach again with `Ctrl-A D`), or
`tail -f /Users/a1/.hermes/cache/scratch/dcbench-v4/pilot-run.log`.

If it dies partway (disk, network, a crash), relaunch the SAME command -- `run_dcbench_v4.py` skips any
`run_id` already present in `runs-v4.jsonl`, so it resumes rather than re-running completed samples.

## Cost / size (as pre-registered in protocol-v4.json)
- 2 arms (R, M-block) x 8 tasks x 3 epochs = **48 scored runs**.
- At v1's measured ~10 min/run (results-mj.md): **~8 hours** wall time.
- MDE at this n (3 runs/arm/task): **~75 points** (not powered for a real effect; this is a pilot, not a
  confirmatory design -- see `protocol-v4.json`'s `sample_size_arithmetic` and `4 log/evidence.md`).
- Token/cost estimate from the smoke run (2 runs): ~$0.70/run-pair average observed (R $1.06, M-block
  $0.37) -- 24 run-pairs ~= $17-35 total, rough order of magnitude only (TASK-001 was the smoke task; other
  tasks' prompts/diffs will vary).

## Before launching
- Re-check `df -h /System/Volumes/Data` (Wave G rule: stop under 6 GB free; dcbench-v4 itself used <1 MB
  this task, each run worktree is transient and removed in the script's `finally:`).
- Confirm no other agent is mid-edit on `plugins/claude-code/scripts/*` or `packages/daemon` (a mid-run
  merge changes the hooks under this pilot's feet -- `run_dcbench_v4.py` always calls the MAIN repo's
  current `plugins/claude-code/scripts/stop.mjs` + `packages/daemon/dist/cli.js`, not a pinned copy of the
  Mole tool itself, matching v1's own known deviation rather than re-fixing it here -- a change mid-run
  should be treated as a NEW protocol version, per `protocol-v4.json`'s `stop_rules`).
