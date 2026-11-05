## Summary
Protocol v4.2 is written, frozen (sha256 verified), and smoke-tested with 1 real `hermes -z` run (arm A,
TASK-001). Full 16-run base-rate pilot NOT launched (needs Raymond's go; command in `launch-command.md`).

## Why this task exists
`results-v41.md` (the v4.1 pilot, 44/44 runs, run overnight 11-04/11-05): on the only 2 of 8 dcbench tasks
with a crisp Mole `rules:` block (TASK-001/D-001 CalendarRange, TASK-013/D-005 PulseLoader), **0 of 16 R
runs and 0 of 16 M-block runs** ended with the crisp violation in the final diff. D102's Stop:block hook
was never exercised in either arm, so v4.1's null result on blocking's effect is uninformative -- it
cannot distinguish "blocking doesn't help" from "this benchmark's crisp mistake basically never happens
with this model, with or without Mole". v4.1's own "what it means" section named the fix: measure the base
rate with NO context at all (arm A), 8 epochs each on the 2 crisp tasks, before spending more run budget on
a comparison that might be testing a mechanism dcbench cannot exercise.

## What was prepared
- `evals/inspect/dcbench_eval/experiments/protocol-v4.2.json` -- new spec, citing `results-v41.md` as
  motivation in its own `motivated_by` field. Single arm (A: no CLAUDE.md, no Mole), 2 tasks (TASK-001,
  TASK-013), 8 epochs each = 16 runs. Primary outcome: per-task and pooled Wilson 95% CI (k violations / n
  runs) via `stats.py`'s `wilson()`. Decision rule written in advance: pooled upper bound < 20% -> dcbench
  cannot usefully test blocking on its organic gotcha rate, build a seeded-trap benchmark next; >= 20% ->
  the mistake is common enough, run a powered R vs M-block comparison next. `protocol-v4.json` and
  `protocol-v4.1.json` are untouched.
- `evals/inspect/dcbench_eval/spec.py` -- `ExperimentSpec.validate()`'s arms requirement loosened from
  `>= 2` to `>= 1`: a single-arm base-rate/descriptive pre-registration (no comparison arm) is a legitimate
  design freeze.py's schema should accept (OSF/AsPredicted pre-registration does not require >=2
  conditions; T90's own `stats.py` ships one-sample tools -- `wilson`, `bootstrap_ci` -- for exactly this
  case). Backward compatible: existing 2+-arm specs are unaffected (2 >= 1 still holds); a NEW regression
  test (`test_single_arm_spec_freezes`) proves a 1-arm spec now freezes, and `test_zero_arm_spec_refused`
  proves a 0-arm spec is still rejected.
- `context/product-plan/systems/metrics-proof/productivity/scripts/run_dcbench_v42.py` -- a byte-for-byte
  copy of the FROZEN `run_dcbench_v4.py` (verified against `protocol-v4.1.tooling-sha256.txt`'s own hash
  before copying -- the main repo's own `context/.../run_dcbench_v4.py` was stale/pre-fix; the T97
  worktree's copy was the real frozen one, confirmed by sha256 match) with exactly ONE semantic addition:
  arm `"A"` in `ARMS` and in `arm_prompt()` (`if arm == "A": return prompt, {}`, identical to the original
  `run_dcbench.py`'s v1 arm-A handling), plus a `base_rate_plan()` / `--full-v42` schedule (arm A x
  TASK-001/TASK-013 x 8 epochs, interleaved by task) alongside the untouched `full_v41_plan()`/`--full-v41`.
  `run_dcbench_v4.py` itself is never edited.
- `context/.../scripts/score-v42.mjs` -- a copy of the FROZEN `score.mjs` (same hash-verified source) with
  one addition: every `git diff` / `git diff --name-only` / `git ls-files --others --exclude-standard` call
  now carries the SAME pathspec exclusion (`:(exclude).mole/**` `:(exclude)CLAUDE.md`), applied identically
  regardless of which arm produced the worktree. This fixes at the source what `results-v41.md`'s "scorer
  check (post hoc, recorded here)" only caught after the fact: the M-block arm's own `.mole/decisions`
  files showing up as new/untracked paths in the scored diff (v4.1 re-ran every check with/without those
  paths and found 0/18 changed, so no v4.1 score was affected -- but that was a post-hoc audit, not a
  guarantee). Arm A writes neither path, so this exclusion is a no-op for v4.2's own data; it is built in
  generically so the same scorer keeps working unmodified the moment a future spec reintroduces R/M-block.
- `evals/inspect/dcbench_eval/experiments/protocol-v4.2.sha256` and
  `protocol-v4.2.tooling-sha256.txt` -- spec + runner + scorer hashes frozen before any scored run
  (`run_dcbench_v4.py`/`score.mjs` themselves are untouched; their hashes still match
  `protocol-v4.1.tooling-sha256.txt` exactly, verified below).
- `evals/inspect/dcbench_eval/experiments/registry.json` -- v4.1's entry updated with its actual finding
  (0/32 violations; it WAS run in full, which the registry had not recorded); v4.2 entry added.
- `evals/inspect/dcbench_eval/tests/test_v42_score_exclude_setup_files.py` -- 3 NEW tests against the REAL
  pinned dcbench repo (not a fake scorer): (1) the inherited intent-to-add fix still works in the new file;
  (2) a real `.mole/decisions/d-001.md` written into a worktree (containing the literal word
  "CalendarRange" in its own prose, the way a real decision record would) is excluded from `diffFiles`,
  `untracked`, and `fullDiff`, and does NOT trip the D-001 gotcha; (3) `CLAUDE.md` is excluded the same way.
  All 3 pass.

## Verification
```sh
# runner/scorer hashes match the ORIGINAL frozen v4.1 files (proving run_dcbench_v4.py/score.mjs untouched)
shasum -a 256 run_dcbench_v4.py score.mjs   # -> a8be16f4... / 8049a53a... (matches protocol-v4.1.tooling-sha256.txt exactly)

python3 evals/inspect/dcbench_eval/freeze.py evals/inspect/dcbench_eval/experiments/protocol-v4.2.json
# -> frozen ... -> protocol-v4.2.sha256, sha256 f9d0adaeb6003a360662d21d8af04545f6b5f70444a37b57d5d3743a08143211

python3 -m pytest evals/inspect/dcbench_eval/tests/test_freeze.py \
  evals/inspect/dcbench_eval/tests/test_v42_score_exclude_setup_files.py -q
# -> 8 passed (5 freeze.py tests incl. 2 new single/zero-arm tests, 3 new score-v42.mjs tests against the
#    real pinned dcbench repo; test_v4_score_intent_to_add.py's 2 tests SKIP in this worktree because it
#    looks for the original score.mjs at a path this worktree never copies -- correct, by design)
```

## Smoke evidence (1 real hermes call)
Run: `python3 .../scripts/run_dcbench_v42.py --tasks TASK-001 --epochs 1 --arms A --out .../4 log/raw/smoke-v4.2.jsonl`
(raw record in `4 log/raw/smoke-v4.2.jsonl`), model claude-sonnet-5, pin 9f507ce, 2026-11-05 08:44-08:52.

```notes
run             arm   wall_s   earned/max   mergeReady   D-001 gotcha            cost      api_calls
e1-TASK-001-A   A     490.3    6/6  100%    true         passed (DateRangePicker) $1.42     56
```
- Run completed (`agent_rc_1: 0`), real token usage billed to the subscription (4.29M in / 31.8K out
  tokens, 56 API calls, $1.42 -- the first real-dollar cost figure for arm A on this task+model pair).
- The agent built a full feature (CSV export preview + download, correctly wrapped in `withAuditLog`,
  correctly used `variant="secondary"`, correctly used `DateRangePicker` not `CalendarRange`) with NO
  context at all -- the D-001 gotcha's `failCheckMatched: false, passed: true`. Zero violations in this
  one run is the expected direction given v4.1's 0/32 finding, but n=1 proves nothing about the base rate
  on its own; the point of this smoke run is proving the plumbing (worktree, prompt, scoring, cleanup), not
  estimating the rate.
- `score.untracked: []`, confirming arm A writes no setup files -- the new exclusion logic in `score-v42.mjs`
  is exercised (compiled into the call path) but inert for this run's own data, exactly as designed; the 3
  new synthetic tests (above) prove the exclusion actually does something when setup files ARE present.
- Worktree cleanup confirmed: `git -C scratch/dcbench-v4/repo worktree list` shows no `run-e1-TASK-001-A`
  after the run finished; disk recovered from 4.5 GB (mid-run, after a killed earlier attempt left an
  orphaned 699 MB worktree, manually removed) back to 5.2+ GB within seconds of this run's own completion.

## Environment note (for whoever runs the full pilot)
This machine's global Python has NO scipy/statsmodels installed, and its numpy install is
architecture-mismatched (x86_64 wheel under an arm64 interpreter) -- confirmed while preparing this task,
not previously documented anywhere in the repo. `stats.py` imports both unconditionally at module scope,
even though `wilson()`/`newcombe_diff()` (the only functions v4.2's analysis needs) use only stdlib math.
`launch-command.md`'s analysis snippet shims `scipy`/`scipy.stats`/`statsmodels.*`/`numpy` with empty stand-in
modules before importing `stats` so `wilson()` can be called without a working scientific-Python stack;
verified working against this task's own real smoke record (`wilson(0,1) = (0.194, 0.599)`, matching the
hand-computed Wilson formula). A full scipy/statsmodels install (`evals/inspect/requirements.txt` lists
them transitively via `inspect-ai`) would remove the need for the shim but was not attempted here (disk
budget; not required for a wilson()-only analysis).

## NOT RUN
- The full 16-run base-rate pilot: NOT LAUNCHED. Exact command in `launch-command.md`.
- A round-1/adversarial review of this spec: not requested yet (next step, or Raymond may launch directly).
- `npm run check`: NOT RUN (this task touches no TS package source, only `evals/` JSON/python,
  `context/` scripts, and `tasks/` docs -- targeted pytest only, per the brief).

## Needs Raymond
- Approve the ~2.2h / 16-run / ~$23 cost (`launch-command.md`), or request a review of v4.2 first.
- If the pooled result lands in the "ambiguous middle" `sample_size_arithmetic` disclosed in advance (1-3
  of 16 violations), decide whether to proceed to a seeded-trap benchmark anyway or run a larger n first.
