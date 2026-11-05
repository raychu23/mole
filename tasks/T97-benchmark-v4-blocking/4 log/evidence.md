## Summary
Protocol v4 is written, frozen (sha256 verified) and smoke-tested with 2 real `hermes -z` runs (R, M-block)
on TASK-001, plus a direct deterministic mechanism check. The D102 Stop:block contract (`decision:"block"`)
fires correctly on a real crisp-rule violation. The real smoke run's M-block arm happened to be a clean run
(agent introduced no D-001/D-005 violation that run, so the hook correctly stayed silent) -- a third,
synthetic test proves the block itself fires when a violation IS introduced. Full 48-run pilot NOT launched
(needs Raymond's go; command in `launch-command.md`).

## What was prepared
- `evals/inspect/dcbench_eval/experiments/protocol-v4.json` -- new spec (protocol-v3.json untouched, still
  frozen/NOT RUN per its own contract). Hypothesis: R vs M-block (D102's real Stop:block, not v3's inert
  model-judge arm). Arms: R (CLAUDE.md, same 15 decisions text), M-block (`.mole/decisions`, 2/15 carry
  `rules:`, Stop hook replayed around hermes -z reading the NEW `decision:block` contract). A excluded from
  this pilot (budget; noted as a possible secondary arm later).
- `evals/inspect/dcbench_eval/experiments/FROZEN-v4.sha256` -- sha256
  `bc81a1c9b4cbe4e7280668e2d9a62aa4897bc0247ce5b6b1a8e0785d7a5ce5b9`, frozen 2026-11-05T03:01:29Z, `--check`
  verified OK.
- `evals/inspect/dcbench_eval/experiments/registry.json` -- T63-productivity-v4 entry added.
- `4 log/crisp-rule-audit.md` -- all 15 seeded decisions checked against Mole's ACTUAL `rules:` capability
  (forbid: import | call only -- no "require" kind exists in `packages/decisions/src/rules/types.ts`).
  Result: only **D-001** (CalendarRange) and **D-005** (PulseLoader/PulseLoaderDots) are honestly
  expressible without false positives against this seed repo's real code. The other 13 are either
  require-a-call decisions, generic keyword/naming conventions, property-access, file-existence, or
  frozen-file checks -- none of which Mole's import/call-graph rules compiler supports. D-015 (sonner) is
  crisp in principle but its only gotcha (TASK-010) isn't in the 8 scored tasks.
- `scratch/dcbench-v4/` -- a NEW pinned copy (scratch/dcbench itself untouched, per Wave G rule):
  `repo/` = `git worktree add --detach` of dcbench at pin `9f507ce0a6ef61124aca90cc4e17fb80592a5e4e` off
  the ALREADY-pinned `scratch/dcbench/repo` (same commit v1/v3 used); `arms/R/CLAUDE.md` (copied verbatim
  from the existing T63 arm, same 15-decision text); `arms/M/.mole/decisions/` (copied from the existing T63
  M arm, then `d-001.md`/`d-005.md` patched with a `rules:` block -- verified parsing: `mole rules --json`
  against this exact set correctly loaded both rules and already flagged the repo's own pre-seeded legacy
  imports as baseline violations, which Stop's session-baseline diffing correctly excludes from blocking).
- `context/product-plan/systems/metrics-proof/productivity/scripts/run_dcbench_v4.py` -- adapted from
  `run_dcbench.py` (same worktree-per-run / hook-replay pattern): 2 arms (R, M-block), `stop_check()`
  rewritten to read the real `decision:"block"`/`reason` fields `stop.mjs` now emits (T92/D102), not v1/v2's
  advisory text match; one forced resume on a block (same one-resume pattern `run_dcbench_mj.py` used).
  **Disclosed limitation, not hidden**: PreToolUse real-time deny is NOT exercised by this harness --
  `hermes -z` is not Claude Code, so there is no per-edit hook event to intercept before the edit lands. A
  true PreToolUse test needs `agent=claude_code` (the Inspect kit's `evals/inspect/dcbench_eval` path) in a
  real Docker/Linux sandbox; Docker is down on this host (Wave G shared rule). This is recorded as an open
  item, not glossed over.

## Smoke evidence (2 real hermes calls + 1 synthetic mechanism check)
Run: `python3 .../scripts/run_dcbench_v4.py --tasks TASK-001 --arms R,M-block --out .../4 log/raw/smoke-v4.jsonl`
(raw records in `4 log/raw/smoke-v4.jsonl`), model claude-sonnet-5, pin 9f507ce, 2026-11-04 21:06-21:18.

```notes
run             arm      wall_s   earned/max   mergeReady   blockingViolations   stop.decision
e1-TASK-001-R   R        406.0    1/6  16.7%    false        1                    n/a (R has no Stop hook)
e1-TASK-001-M-block  M-block  269.9    4/6  66.7%    false        0                    (not called: no new
                                                                                        crisp violation this
                                                                                        run -- clean run)
```
- Both runs completed (`agent_rc_1: 0`), real token usage billed to the subscription (R: 2.71M in / 29.2K
  out, $1.06; M-block: 798.6K in / 10.1K out, $0.37 -- M-block ran shorter and cheaper, same direction v1
  found).
- R's diff did not add a DateRangePicker/CalendarRange import either way (gotcha D-001-date-range-picker:
  `passCheckMatched:false, failCheckMatched:false`); M-block's diff also didn't touch that gotcha's pattern
  this run, but DID pass D-002 (audit log) and D-003 (button variant) that R missed -- a single n=1 run, no
  claim, just evidence the plumbing (prompt, worktree, scoring) works end to end on a real agent run.
- M-block's Stop hook ran (`rc:0`) and correctly found `block:false` -- the agent's diff introduced no new
  crisp-rule violation this run, so the hook stayed silent, exactly as designed (a clean run is an
  acceptable, honest smoke outcome per the brief, not a failure to produce evidence).
- **Direct mechanism check** (no model call, deterministic): built a throwaway worktree at the same pin with
  the same M-block `.mole/decisions`, wrote a NEW file
  (`src/components/dashboard/export-button.tsx`) containing `import { CalendarRange } from
  "@/components/ui/calendar-range"` (exactly dcbench's own seeded trap for D-001), then ran the real
  `plugins/claude-code/scripts/stop.mjs` against it. Output (verbatim, `tasks/T97-benchmark-v4-blocking/4
  log/raw/mechanism-check.json`):
  `"decision":"block"`, `"reason":"Mole: this change breaks 1 accepted decision rule (mole rules,
  zero-model, deterministic -- not a guess):\n- src/components/dashboard/export-button.tsx:1 import
  @/components/ui/calendar-range breaks D-001 \"Date range component standardization\" — fix: CalendarRange
  had accessibility issues on mobile and was replaced during the mobile redesign; use DateRangePicker
  instead ..."`. **The D102 Stop:block mechanism fires correctly** when a session actually introduces a
  crisp-rule violation.

## Power / honesty check (pilot, not confirmatory)
Computed via `evals/inspect/dcbench_eval/stats.sample_size_for_mde`, run in reverse (`TTestPower().
solve_power(nobs=3, alpha=0.05, power=0.8)` -> effect_size, `mde = effect_size * sd`) using T63's own
measured per-task-diff SDs (protocol-v3.json's `sample_size_arithmetic`, sd(R-M)=23.05): at
`runs_per_arm_per_task=3` (this pilot's size, same epoch count as v1), the minimum detectable effect on the
primary R vs M-block comparison at 80% power / alpha 0.05 is **~75.2 points**. That is not a typo: a 48-run
pilot sized to a time budget (not to the stated MDE=15 protocol-v3 computed) can only reliably detect an
effect roughly 5x v1's largest measured pairwise difference. This pilot is a feasibility/smoke exercise, not
a powered test -- stated honestly in `protocol-v4.json`'s `stop_rules` so a future reader cannot call its
result "Mole works" or "Mole doesn't work" either way.

## NOT RUN
- The full 48-run pilot (R, M-block x 8 tasks x 3 epochs, ~8h at v1's ~10 min/run): NOT LAUNCHED. Exact
  command in `launch-command.md`.
- `agent=claude_code` / real-time PreToolUse deny: NOT RUN (Docker down; see "Disclosed limitation" above).
- `npm run check`: NOT RUN (this task touches no TS package source, only `evals/` JSON/python and `context/`
  scripts, per the brief's "targeted tests only, never npm run check in main").

## Needs Raymond
- Approve the ~8h / 48-run cost for the pilot (`launch-command.md`), OR say whether A should be added as a
  third arm at an extended budget.
- Whether a future Docker-available or Linux-CI run should also attempt the real `agent=claude_code`
  PreToolUse path this pilot could not exercise.
