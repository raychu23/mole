## Summary
Exact command to launch the full protocol-v4.2 base-rate pilot (NOT run by this task -- prepare, freeze,
smoke-test, hand off the command, per the brief). Detached (`screen -dmS`), logs to scratch, resumable
(skips run ids already present in the output file). Uses the new runner's `--full-v42` schedule: arm A
only, TASK-001 and TASK-013, 8 epochs each, interleaved by task -- **16 runs total**, per
`protocol-v4.2.json`.

## Pre-flight (re-check immediately before launching)
```sh
df -h /System/Volumes/Data   # stop under 4 GB free
test -f "/Users/a1/.hermes/cache/scratch/dcbench-v4/mole-pinned/dist/cli.js" && echo "pinned CLI present (unused by arm A, but run_dcbench_v42.py's shared guard still requires it)"
python3 "/Users/a1/Desktop/CS Code/Project/Mole/evals/inspect/dcbench_eval/freeze.py" --check \
  "/Users/a1/Desktop/CS Code/Project/Mole/evals/inspect/dcbench_eval/experiments/protocol-v4.2.json"
```
Arm A needs no CLAUDE.md, no `.mole/`, no Mole hooks at all -- it is dcbench Config A as shipped. The
pinned dcbench repo (`scratch/dcbench-v4/repo`, commit `9f507ce0a6ef61124aca90cc4e17fb80592a5e4e`) is
reused READ-ONLY from the v4.1 pilot; this pilot does not rebuild or touch it.

## Launch command
```sh
mkdir -p "/Users/a1/Desktop/CS Code/Project/Mole/tasks/T107-benchmark-v42-base-rate/4 log/raw"
screen -dmS t107-v4.2-pilot bash -c '
python3 "/Users/a1/Desktop/CS Code/Project/Mole-worktrees/T107-benchmark-v42-base-rate/context/product-plan/systems/metrics-proof/productivity/scripts/run_dcbench_v42.py" \
  --full-v42 \
  --out "/Users/a1/Desktop/CS Code/Project/Mole/tasks/T107-benchmark-v42-base-rate/4 log/raw/runs-v4.2.jsonl" \
  > /Users/a1/.hermes/cache/scratch/t107-pilot-run-v4.2.log 2>&1
'
```

Check progress any time with `screen -r t107-v4.2-pilot` (detach again with `Ctrl-A D`), or
`tail -f /Users/a1/.hermes/cache/scratch/t107-pilot-run-v4.2.log`.

If it dies partway (disk, network, a crash), relaunch the SAME command -- `run_dcbench_v42.py --full-v42`
skips any `run_id` already present in `runs-v4.2.jsonl`, so it resumes rather than re-running completed
samples.

NOTE: the runner's own `TASK_DIR`/`RAW`/`RUNS` constants already point at
`tasks/T107-benchmark-v42-base-rate/4 log/raw/runs-v4.2.jsonl` by default, so `--out` above is redundant
with running it from the worktree directly -- it is spelled out explicitly here only so the command is
correct regardless of which checkout (main repo vs this ledger worktree) it is launched from, since
`context/` (where the runner lives) is gitignored and NOT present in a fresh clone of `main` until copied
there the same way this task copied it from the T97 worktree.

## Cost / size (as pre-registered in protocol-v4.2.json)
- Arm A only x 2 tasks (TASK-001, TASK-013) x 8 epochs = **16 scored runs**.
- Measured smoke-run wall time (this task's own real run, TASK-001, arm A): **490.3s** (~8.2 min), $1.42
  (4.29M in / 31.8K out tokens, 56 API calls -- note: this single run's agent chose to run its own test
  suite / install steps inside the worktree, which is why token usage and wall time ran higher than
  v4.1's R/M-block smoke pairs on the same seed repo; see `4 log/evidence.md`).
- At ~490s/run x 16 runs = **~2.2 hours** wall time if run serially (the runner is NOT parallelized across
  runs), well inside a single overnight window; no interleaving needed (single arm).
- Rough cost at the smoke run's $1.42/run: ~16 x $1.42 ~= **$23 total**, order of magnitude only (costs
  vary per run; TASK-013 may differ from TASK-001).
- Disk: each run's worktree (observed 699 MB for the one real smoke run, because dcbench is a Next.js
  project and the agent may run `npm install`/build steps) is removed in the runner's own `finally` block
  immediately after scoring -- confirmed by this task's smoke run (worktree gone, `git worktree list`
  clean, disk recovered from 4.5 GB back to 5.2+ GB within seconds of the run finishing). Re-check free
  disk before launching (pre-flight above) and periodically during a long run regardless.

## Analysis after the run
```sh
python3 - <<'EOF'
import json, sys, types
# stats.py imports scipy/statsmodels at module scope; wilson()/newcombe_diff() only need stdlib math.
# This machine's global numpy install is architecture-mismatched (x86_64 wheel under arm64 python) and
# scipy/statsmodels are not installed at all -- confirmed while preparing this task. Shim minimal stand-ins
# so stats.py imports without a real scientific-Python stack; only wilson() is actually called below.
for name in ("scipy", "scipy.stats", "statsmodels", "statsmodels.stats",
             "statsmodels.stats.multitest", "statsmodels.stats.power", "numpy"):
    sys.modules.setdefault(name, types.ModuleType(name))
sys.modules["scipy.stats"].bootstrap = lambda *a, **k: None
sys.modules["scipy.stats"].permutation_test = lambda *a, **k: None
sys.modules["statsmodels.stats.multitest"].multipletests = lambda *a, **k: None
sys.modules["statsmodels.stats.power"].TTestPower = object
sys.modules["numpy"].asarray = lambda x, dtype=None: list(x)
sys.modules["numpy"].mean = lambda x, axis=0: sum(x) / len(x)
sys.path.insert(0, "/Users/a1/Desktop/CS Code/Project/Mole/evals/inspect/dcbench_eval")
import stats

runs = [json.loads(l) for l in open(
    "/Users/a1/Desktop/CS Code/Project/Mole/tasks/T107-benchmark-v42-base-rate/4 log/raw/runs-v4.2.jsonl"
) if l.strip()]
ok = [r for r in runs if r.get("status") == "ok"]

def violated(r, gotcha_id):
    for g in r["score"].get("gotchaResults", []):
        if g["gotchaId"] == gotcha_id:
            return bool(g["failCheckMatched"])
    return False

by_task = {"TASK-001": "D-001-date-range-picker", "TASK-013": "D-005-shimmer-audit-viewer"}  # verified against the real smoke-v4.1.jsonl record (TASK-013's actual gotchaId), 2026-11-05
for task, gid in by_task.items():
    task_runs = [r for r in ok if r["task"] == task]
    k = sum(violated(r, gid) for r in task_runs)
    n = len(task_runs)
    if n:
        lo, hi = stats.wilson(k, n)
        print(f"{task}: {k}/{n} violated, Wilson 95% CI [{lo:.3f}, {hi:.3f}]")

k_pool = sum(violated(r, by_task[r["task"]]) for r in ok)
n_pool = len(ok)
lo, hi = stats.wilson(k_pool, n_pool)
print(f"POOLED: {k_pool}/{n_pool} violated, Wilson 95% CI [{lo:.3f}, {hi:.3f}]")
print("DECISION RULE: pooled upper bound", "< 0.20 -> seeded-trap benchmark next" if hi < 0.20
      else ">= 0.20 -> dcbench CAN test blocking, run a powered R vs M-block comparison next")
EOF
```
