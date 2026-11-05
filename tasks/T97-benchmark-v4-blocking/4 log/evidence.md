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

---

## Round-1 review FIX (deleg_b40d00a6, task-1, 2026-11-04 ~22:02): applied, re-smoked as v4.1

Verdict was **FIX**, not PASS -- returned before any scored run existed, so this is a pre-run
re-registration (protocol-v4.1.json), not a deviation seen after data. All 5 required changes below are
done and verified; the full pilot is still NOT launched (same as v4).

### 1. Scorer: score.mjs now matches dcbench_score.mjs's intent-to-add fix
`context/product-plan/systems/metrics-proof/productivity/scripts/score.mjs` now runs
`git add --intent-to-add --all` before diffing and passes the full diff (including new-file content) to
`scoreTask`, exactly like `evals/inspect/dcbench_eval/dcbench_score.mjs` already did. Proved with a REAL
decision, not a fake scorer: `evals/inspect/dcbench_eval/tests/test_v4_score_intent_to_add.py` writes a
brand-new, never-`git add`-ed file importing `CalendarRange` into a disposable worktree of the pinned
dcbench repo and scores it against TASK-001's real `D-001-date-range-picker` gotcha.
- Pre-fix (verified by running the ORIGINAL score.mjs against the same fixture):
  `failCheckMatched: False, diffFiles: []` -- the violation was invisible.
- Post-fix: `failCheckMatched: True, passed: False`, `src/app/analytics/export-panel.tsx` present in
  `diffFiles` -- the violation is caught. A second test proves the flip side (a correct new file now
  earns its points instead of losing them). `2 passed` (`python3 -m pytest
  evals/inspect/dcbench_eval/tests/test_v4_score_intent_to_add.py -v`).
- v1 dependency check: nothing re-invokes `score.mjs` against T63's historical data --
  `evals/inspect/dcbench_eval/reanalyze.py` reads already-scored `raw/runs.jsonl` records read-only and
  never re-scores a diff, and T63's own `run_dcbench.py` no longer exists in this `scripts/` dir
  (superseded by `run_dcbench_v4.py`). No caller depends on the old (buggy) un-staged behaviour; it is not
  kept as a separate code path.

### 2. Mole pinned for the whole run (not the live repo)
Built `release/mole-code` from current main (`node tools/build.mjs && npm pack`) at commit
`e4eafe21e0b5f7e83fd91b85124ece2c0dbdac3f` (HEAD confirmed unchanged before and after the build), installed
the resulting tarball (sha256 `f0bbc96596d5102bfb9ebcf21cf6c0129d4d9164b53f6b9bb2fc20a92f2f4ea1`) into
`/Users/a1/.hermes/cache/scratch/dcbench-v4/mole-pinned` (`SOURCE.json` records both). `run_dcbench_v4.py`'s
`MOLE_BIN`/`PLUGIN` constants now point at `mole-pinned/dist/cli.js` / `mole-pinned/scripts` instead of the
live repo, and refuse to start if that install is missing or incomplete. D102 marker verified twice:
`grep -c "export function crispViolationsForOverlay" mole-pinned/scripts/lib.mjs` → `1`, and
`run_dcbench_v4.py` asserts this at import time (`sys.exit` if missing). Every run record in
`raw/runs-v4.1.jsonl`/`smoke-v4.1.jsonl` carries `mole_pinned.{source_commit,tarball_sha256,tarball}` --
confirmed present in both smoke run records (see below).

### 3. protocol-v4.1.json written (v4 untouched)
`evals/inspect/dcbench_eval/experiments/protocol-v4.1.json`: primary outcome on TASK-001 (D-001) and
TASK-013 (D-005) -- (a) violation-at-end proportion per arm (Fisher's exact + Newcombe CI), (b) Stop-block
fire rate + fix-after-block rate in M-block (descriptive, Newcombe CI), (c) dcbench points R vs M-block
(paired permutation test + bootstrap CI); secondary: all 8 tasks, descriptive only. Budget: 2 arms x 2
crisp tasks x 8 epochs (32) + 2 arms x 6 other tasks x 1 epoch (12) = **44 runs**, interleaved by arm, crisp
tasks first (`run_dcbench_v4.py`'s new `full_v41_plan()` / `--full-v41` flag implements this exact
ordering). `sample_size_arithmetic` states the MDE honestly: ~45.9 points on the primary (points) outcome
at n=8/arm/task (an improvement over v4's ~75.2 from spending the same total budget on fewer tasks, still
well short of protocol-v3's own powered n=21/arm/task), and states plainly that the violation-proportion
Fisher's-exact MDE at this n is low except for near-extreme swings -- NOT asserted as a clean number.
`protocol-v3.json` and `protocol-v4.json` are untouched.

### 4. Freeze: default `freeze.py --check` invocation passes
`cd evals/inspect/dcbench_eval && python3 freeze.py experiments/protocol-v4.1.json` (no `--frozen` flag) →
writes `experiments/protocol-v4.1.sha256` at the DEFAULT path `freeze.py --check` expects when called with
no `--frozen` flag. `python3 freeze.py --check experiments/protocol-v4.1.json` → `OK: ... matches its
freeze ...`, exit 0, **default invocation, no flag needed** (v4's own `FROZEN-v4.sha256` only passed with an
explicit `--frozen` override -- this is the exact gap the review named). The runner, scorer and pinned
Mole tarball are hashed in a companion file,
`experiments/protocol-v4.1.tooling-sha256.txt` (freeze.py's `ExperimentSpec` schema only covers the JSON
spec itself, so these are recorded alongside in `sha256sum` format rather than forced into that schema).
`registry.json` updated with the v4.1 entry.

### 5. Smoke: one M run + one R run on TASK-013 through the updated runner
`python3 run_dcbench_v4.py --tasks TASK-013 --arms R,M-block --out "4 log/raw/smoke-v4.1.jsonl"`, real
`hermes -z` calls, claude-sonnet-5, 2026-11-05 ~04:05-04:21 (results below, both from
`4 log/raw/smoke-v4.1.jsonl`):

```notes
run                      arm      wall_s   earned/max   mergeReady   cost        api_calls
e1-TASK-013-R            R        405.5    5/5  100%    true         $1.39       44
e1-TASK-013-M-block      M-block  251.9    5/5  100%    true         $0.61       21
```
- Both runs `status: ok`, `mergeReady: true` -- a clean run on both arms this time (the D-005 gotcha
  passed; no violation was introduced, so M-block's Stop hook correctly stayed silent, `block: false`).
- **Scorer sees new files** (requirement 5's "confirm the scorer sees new files"): M-block's
  `score.diffFiles` includes `.mole/decisions/d-001.md` through `d-015.md` -- these are UNTRACKED files
  copied into the worktree by `arm_prompt()` for the M arm, previously invisible to plain `git diff` and
  listed only under `untracked`; with the intent-to-add fix they now show up in `diffFiles` (and
  `untracked` is correctly empty), proving the fix is live in the actual runner path, not just the unit test.
- **Hook resolves the pinned Mole** (requirement 5's second half): both run records' `mole_pinned` field
  matches `mole-pinned/SOURCE.json` exactly (`source_commit: e4eafe21e0b5f7e83fd91b85124ece2c0dbdac3f`,
  `tarball_sha256: f0bbc96596d5102bfb9ebcf21cf6c0129d4d9164b53f6b9bb2fc20a92f2f4ea1`). Beyond the recorded
  field, the runner's `stop_check()` literally invokes `node .../mole-pinned/scripts/stop.mjs` (there is no
  live-repo fallback path in the code), so by construction the hook that ran IS the pinned one. As direct,
  separate proof the pinned hook's BLOCK path also fires correctly (not just its silent/clean path, which
  the smoke run exercised): a deterministic mechanism check built a throwaway worktree with the same
  M-block `.mole/decisions`, wrote a new file importing `CalendarRange` (D-001's trap), and ran
  `mole-pinned/scripts/stop.mjs` directly (`MOLE_BIN=mole-pinned/dist/cli.js`) -- output (verbatim,
  `4 log/raw/mechanism-check-pinned-v4.1.json`): `"decision":"block"`, reason citing
  `rule mole-D-001-1 at .mole/decisions/d-001.md:7`. **The pinned Mole's D102 Stop:block mechanism fires
  correctly**, confirmed from the tarball install, not the live repo.

### What changed in run_dcbench_v4.py
- `MOLE_BIN`/`PLUGIN` resolve from `scratch/dcbench-v4/mole-pinned` (new), not `REPO/packages/daemon` /
  `REPO/plugins/claude-code/scripts` (old); the script exits with a clear error if the pin is missing or
  predates D102.
- Every run record now carries `mole_pinned.{source_commit,tarball_sha256,tarball}`.
- New `CRISP_TASKS`/`OTHER_TASKS`/`full_v41_plan()`/`--full-v41` implement the v4.1 budget and ordering
  (crisp tasks x8 epochs first, other tasks x1 epoch, interleaved by arm) without removing the old
  `--epochs`/`--tasks`/`--arms` ad-hoc interface (used for this smoke run and any future targeted rerun).

### NOT RUN (unchanged from v4, still true for v4.1)
- The full 44-run pilot: NOT LAUNCHED. Exact command in `launch-command.md`.
- `agent=claude_code` / real-time PreToolUse deny: NOT RUN (Docker down; see v4's own "Disclosed
  limitation" above, unchanged).
- `npm run check`: NOT RUN in main (targeted tests only, per the brief); `release/mole-code`'s build itself
  ran clean (`node tools/build.mjs` exit 0, `npm pack` exit 0) and is evidence the build step works, not a
  substitute for the TS package's own test suite.

