## Summary
Moved out of `docs/experiments.md` (T93-public-eval-kit) because that doc now ships publicly
(`scripts/export-public.mjs`) and this content is internal: T63's dcbench productivity test, the
pre-registered v3 protocol spec built on top of it, its sample-size arithmetic, and the dcbench scorer
"new-file-blindness" fix history. Nothing here is needed to USE the public A/B kit (`mole_ab` with
`agent=claude_code`/`codex`/`hermes`); it is why the kit has a v3 protocol/freeze layer at all, and the one
worked example of running it against a real (if private) experiment. Kept verbatim from
`docs/experiments.md`'s prior "section 3: the worked example: dcbench" and the superseded-doc note at the
bottom, both dated 2026-11-04.

## 3. The worked example: dcbench (T63's pattern, generalised)

`evals/inspect/dcbench_eval/experiments/protocol-v3.json` is the dcbench productivity test's current
pre-registered spec (NOT run; see `4 log/`). It supersedes v2:

```sh
<mole-ab-venv>/bin/python evals/inspect/dcbench_eval/freeze.py \
  evals/inspect/dcbench_eval/experiments/protocol-v3.json \
  --frozen evals/inspect/dcbench_eval/experiments/FROZEN-v3.sha256 --check
```

(protocol-v3.json's freeze record lives at the explicit `--frozen` path above, NOT the default
`<spec>.sha256` beside it -- same historical naming T63 used for FROZEN.sha256/FROZEN-v2.sha256. Always
pass `--frozen` for this file.)

**Sample size, computed not asserted**: v2 used `runs_per_arm_per_task: 3`, copied from v1, never computed
from measured variance. v3 computes it with `stats.sample_size_for_mde` on T63's own 72 measured runs
(read-only): the per-task paired-difference standard deviations are sd(R-M)=23.05, sd(A-M)=18.58,
sd(A-R)=16.32 (percentage points). At the spec's stated MDE of 15 points, `sample_size_for_mde(sd, 15)`
gives **n=21 for R-M** (the PRIMARY comparison per the hypothesis), n=15 for A-M, n=12 for A-R. v3 sets
`runs_per_arm_per_task: 21` (the primary pair's requirement -- conservative, not understated). That is
**roughly 14-19+ runs per arm per task** depending which pair you anchor on, confirming the brief's
estimate; v2's n=3 was never powered to find a 15-point effect on any of the three pairs, let alone the
one actually observed (T63's real R-M difference was +2.4 points -- far smaller than what n=3 or even n=21
could reliably detect; v1/v2's "not significant" result is **underpowered, not evidence of no effect**).
The full arithmetic (every number above, with the formula and citation) is in
`protocol-v3.json`'s `sample_size_arithmetic` field, verified by `dcbench_eval/tests/test_protocol_v3.py`
(private-only: that test and this fixture are excluded from the public export, see export-public.mjs's
T93-public-eval-kit comment).
Full cost: 21 x 3 arms x 8 tasks = 504 scored runs, a real cost increase over v2's 72 -- **NOT approved to
run**; this is pre-registration only, a real run needs Raymond's go.

**Known scorer limitation, fixed in v3** (orchestrator-verified new evidence, 2026-11-04,
`context/product-plan/systems/metrics-proof/productivity/error-analysis-72.md`): dcbench's own
`grep_diff` check reads plain `git diff`, which never shows content in files the agent newly created. 60 of
111 (54%) of T63's 72 failed gotchas were this artefact alone, evenly split across arms -- not a real
compliance signal. v3's adapter (`dcbench_score.mjs`) runs `git add --intent-to-add --all` before diffing
(per `git-add(1)`, this stages the fact that a path will be added without staging its bytes, which is
enough for `git diff` to show the new file's full content) -- a disclosed deviation from the harness;
`benchmark/scorer.ts` itself is never modified. Test: `dcbench_eval/tests/test_dcbench_score.py` (built
against a tiny FAKE dcbench-shaped repo, never the live one -- this test IS public, it needs no private
data). **v1's 72 runs are kept as measured** -- `results-72.md` is not retracted -- but **cannot be
rescored post-hoc**: the v1/v2 harness saved only file-name lists, never diff text, to `raw/runs.jsonl`.
Every mole_ab run fixes this too: the full diff (tracked + new files) is stored in the sample's Inspect-log
metadata, so any mole_ab run can be rescored later from its log alone.

## Superseded-doc note (kept for history; was the bottom of docs/experiments.md before T93)
The previous `docs/experiments.md` (before the T90 follow-up review) described `spec.py`/`stats.py`/
`freeze.py`/`reanalyze.py`/`registry.py` as "built on Inspect AI" and claimed "logs land in Inspect's own
format" while nothing in the package imported `inspect_ai` and `__init__.py` cited `task.py`/
`hermes_solver.py`/`scorer.py` files that did not exist (review FAIL, `deleg_72653e2b/task-0.log`). Those
five files were unchanged by that follow-up and still do not import `inspect_ai` (they are
pre-registration/stats, correctly described as that). What was new then: `hermes_provider.py`,
`worktree_agent.py`, `arms.py`, `scorers.py`, `task.py` -- the actual Inspect integration. T93 added a
second real agent path (`external_agent.py`, claude_code/codex via inspect-swe) on top of that.
