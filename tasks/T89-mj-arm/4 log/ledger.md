```notes
ledger (newest last, nothing deleted)
    2026-11-04 15:12      new → proposed      T63 pre-registered M+J arm (D96): Mole as shipped with the haiku router + judge after the edit, so a judged violation forces one resume, scored on the same 8 dc
    2026-11-04 15:12      proposed → ready      owner hermes-build
    2026-11-04 15:12      ready → running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T89-mj-arm · branch ledger/t89-mj-arm · base ?
    2026-11-04 15:30      progress              model-call audit done: hermesLlmClient() (packages/decisions/src/compile/llm.ts)
                           already shells to `hermes -z ... -m MODEL --provider anthropic -t "" --safe-mode` (subscription,
                           no API key, no `claude` CLI) -- confirmed by one live haiku call ("reply ok" -> "ok") and by
                           reading cascade/cli.ts + verify.mjs; no spawn adapter needed (tasks/T89-mj-arm/4 log/prior-art.md).
                           Pinned Mole copy built at /Users/a1/.hermes/cache/scratch/dcbench/mole-pin-ebcec02 (ebcec0297c42,
                           same commit FROZEN.sha256 used for the M arm; npm install + npx tsc -b clean). Added
                           context/product-plan/systems/metrics-proof/productivity/{protocol-mj.md,FROZEN-mj.sha256,
                           scripts/run_dcbench_mj.py,scripts/stop-mj.mjs} -- stop-mj.mjs imports the pin's lib.mjs/verify.mjs
                           UNMODIFIED to surface judge/router usage JSON stop.mjs normally discards; zero plugins/claude-code
                           source edited. FROZEN-mj.sha256 written and hashes verified BEFORE any scored run.
    2026-11-04 15:23      dry run               `run_dcbench_mj.py --dry-run --tasks TASK-001 --check-fix`: seeded a real
                           D-001 violation (DateRangePicker -> CalendarRange), judge escalated (tier llm, flag violates,
                           judge cost $0.005, router cost $0.0015), additionalContext populated, resumed=true, judge_calls=1
                           -- judge path demonstrably fires a resume on a seeded violation, through the real runner, before
                           run 1 (raw/runs-mj.jsonl run_id dry-e1-TASK-001-MJ, moved to scratch after verification).
    2026-11-04 15:26      running               launched the 24 scored runs: `run_dcbench_mj.py --epochs 3 --check-fix`
                           as a detached background process (PPID 1, pid 93721; nohup, survives this session) ->
                           raw/runs-mj.jsonl + /Users/a1/.hermes/cache/scratch/dcbench/scored-mj.log. 2/24 done at handoff:
                           e1-TASK-001-MJ agent_error (host hit ENOSPC mid-run, disk recovered after, unrelated to this
                           code -- host had only 4.1GB free system-wide at that moment, kept in per protocol's
                           intention-to-treat precedent), e1-TASK-003-MJ ok (0/5, no governed decision touched, no judge
                           escalation, legitimate outcome). Remaining ~22 runs still in flight; not yet summarized into
                           results-mj.md -- next session should poll scored-mj.log / raw/runs-mj.jsonl, wait for all 24,
                           then write results-mj.md (losses first, paired permutation vs M and vs R, judge cost separate)
                           before calling this task submitted. OPEN FOR RAYMOND: host disk ran to ~100% capacity once
                           during this run (4.1GB avail) -- if ENOSPC recurs across many runs it will bias merge-ready/
                           score numbers toward artificial failures; worth a disk check before trusting a high error rate
                           in the final 24.
```
