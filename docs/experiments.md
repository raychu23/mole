## Summary
This is Mole's A/B experiment system (T90): answer "does adding decision X change what my coding agent
does?" on YOUR repo, not just dcbench. It is a REAL Inspect AI integration (UK AISI's agent-eval framework,
already Mole's T17 choice) -- a generic Inspect `Task` (`mole_ab`), a solver that runs the real `hermes -z`
agent in a per-sample git worktree, two scorers (a generic any-repo one and dcbench's own), and
pre-registration/stats on top (spec+freeze, scipy/statsmodels). Runs land in Inspect's native `.eval`
format, so `inspect view`/`inspect log dump` work unmodified -- proved end to end in
`tasks/T90-ab-experiment-system/4 log/mole_ab-e2e-proof.{eval,txt}` (2 real hermes calls, no dcbench, no
mocked agent). This replaces the 2026-11-04 version of this doc, which described a stats/freeze toolkit
that nothing in the package actually ran through Inspect; see "What changed" at the bottom.

## 1. Run it on your own repo

```sh
# <mole-ab-venv>: the venv with inspect-ai, inspect-swe, scipy, statsmodels installed (any Python 3.12 with
# those four works; see evals/inspect/requirements.txt for pinned versions). A plain `python3`/direct exec
# may hit a broken system numpy on some machines (observed: a CoreFoundation/fork crash) -- always use the
# venv's own python, never the system one, for anything that imports scipy/numpy.
<mole-ab-venv>/bin/inspect eval evals/inspect/dcbench_eval/task.py@mole_ab \
  -T repo=/path/to/your/repo \
  -T dataset=/path/to/your/tasks.jsonl \
  -T arms="none,decisions:/path/to/.mole/decisions" \
  -T scorer=mole_check \
  -T mole_bin=/path/to/mole-code/dist/cli.js \
  --model mockllm/model   # swap for your real model once you trust the plumbing
```

`dataset.jsonl`: one line per task, `{"id": "T1", "prompt": "..."}`. `arms`: comma-separated, see
`evals/inspect/dcbench_eval/arms.py`'s docstring for the full syntax (`none`, `rules:PATH`,
`decisions:PATH`, `plugin_pin:SHA:PATH`). Every (dataset row) x (arm) pair becomes one Inspect `Sample`:
same prompt, same model, same pinned commit -- only the context in front of the agent differs between arms.
`scorer=mole_check` runs `mole check --worktree --json` (any repo with `.mole/decisions`, no dcbench
needed) and scores on the number of outstanding questions Mole itself raises about the diff.

Result: a real Inspect `.eval` log under `--log-dir` (default `./logs`). Open it with
`<mole-ab-venv>/bin/inspect view --log-dir <dir>`, or re-analyse it statistically:

```sh
<mole-ab-venv>/bin/python evals/inspect/dcbench_eval/reanalyze.py --inspect-log path/to/run.eval
```

## 2. The three things underneath

```notes
hermes_provider.py   @modelapi "hermes" custom model provider, Inspect's documented extension mechanism
                      (https://inspect.aisi.org.uk/extensions-model-api.html). Text-prompt -> text-completion
                      only (a judge/classifier call); see its docstring for why dcbench itself can't use it.
worktree_agent.py     the solver mole_ab actually runs: creates a throwaway git worktree per sample,
                      applies the arm's context (arms.py), runs REAL `hermes -z ... --safe-mode` as a
                      subprocess (the agent edits files itself -- it is not a chat completion Inspect's
                      generate() can wrap), records the diff. Pattern borrowed from inspect-swe's external-
                      agent wrapper (github.com/UKGovernmentBEIS/inspect_swe, used here already by
                      evals/inspect/mole_eval/task.py's claude_code()); see worktree_agent.py's docstring
                      for exactly what's the same and what's different (no model bridge needed: hermes
                      calls the model itself, through the subscription, not through Inspect).
scorers.py            mole_check_scorer (generic, any repo) + dcbench_scorer (wraps dcbench's OWN
                      benchmark/scorer.ts via dcbench_score.mjs, a node subprocess -- same contract T63's
                      score.mjs used). dcbench_score.mjs stages new files with `git add --intent-to-add`
                      before diffing (a disclosed deviation; scorer.ts itself is unmodified) -- see
                      "Known scorer limitation, fixed in v3" below.
spec.py, freeze.py   pre-registration: hash + freeze an experiment spec before run 1; `--check` in CI
                      fails the build on a silent edit to a frozen spec (OSF/AsPredicted practice).
stats.py              scipy/statsmodels only: paired_permutation_test, bootstrap_ci, clustered_se (Anthropic
                      arXiv 2411.00640 Eq. 4, no package implements this exact combination so it's computed
                      directly from the paper, cited per function), holm_correction, sample_size_for_mde.
reanalyze.py          re-analyse a finished run: T63's old runs.jsonl (--runs, the historical path) OR any
                      mole_ab .eval log (--inspect-log, reads it via inspect_ai.log.read_eval_log).
registry.py           the experiments registry (idea -> status), experiments/registry.json.
```

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
`protocol-v3.json`'s `sample_size_arithmetic` field, verified by `dcbench_eval/tests/test_protocol_v3.py`.
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
against a tiny FAKE dcbench-shaped repo, never the live one). **v1's 72 runs are kept as measured** --
`results-72.md` is not retracted -- but **cannot be rescored post-hoc**: the v1/v2 harness saved only
file-name lists, never diff text, to `raw/runs.jsonl`. Every mole_ab run fixes this too: the full diff
(tracked + new files) is stored in the sample's Inspect-log metadata, so any mole_ab run can be rescored
later from its log alone.

## 4. End-to-end proof (this is what "it actually runs through Inspect" means)

`tasks/T90-ab-experiment-system/4 log/mole_ab-e2e-proof.eval` (+ `.txt` with an `inspect log dump`
excerpt): 2 samples, a tiny SYNTHETIC repo (never dcbench, which stays read-only), `model=mockllm/model`
(cosmetic -- the solver never calls `generate()`), but the **agent is a real `hermes -z` call** both times
(`agent_rc=0`, `agent_seconds` > 0, a real git diff creating `hello.txt` with the exact requested content,
scored by `mole_check_scorer`). `inspect log dump` on that file, or `inspect view --log-dir`, shows it like
any other Inspect run.

## 5. CI: freeze-check + a cheap smoke eval on every push

```yaml
# .github/workflows/mole-ab.yml (illustrative; adjust paths/venv setup to your CI)
- name: mole_ab -- frozen specs must be unedited
  run: evals/inspect/dcbench_eval/freeze.py evals/inspect/dcbench_eval/experiments/protocol-v3.json \
         --frozen evals/inspect/dcbench_eval/experiments/FROZEN-v3.sha256 --check
- name: mole_ab -- unit tests (pure Python + Inspect-dependent)
  run: python -m pytest evals/inspect/dcbench_eval/tests -q
- name: mole_ab -- cheap smoke eval (mockllm model id; the agent itself still calls hermes for real)
  run: |
    inspect eval evals/inspect/dcbench_eval/task.py@mole_ab \
      -T repo=. -T dataset=evals/inspect/dcbench_eval/experiments/ci-smoke.jsonl \
      -T arms=none -T scorer=mole_check --model mockllm/model --log-dir ci-logs
```

## 6. What's open

A generic CLI that takes an arbitrary team repo + `.mole/decisions/*.md` pair (with/without) and
auto-generates the dataset.jsonl is not built -- today you write the JSONL yourself. `dcbench_scorer` is
wired but not exercised against the live dcbench repo in this change (dcbench stays read-only; a fixture
repo proves the scoring logic instead, see `test_dcbench_score.py`). `hermes_provider.py`'s `@modelapi`
provider is registered and unit-tested but has no in-repo consumer yet (it's for a future text-only
judge/scorer, not dcbench or mole_check, which are both worktree-agent/CLI-subprocess scorers).

## What changed from the reviewed (FAILED) version of this doc
The previous `docs/experiments.md` described `spec.py`/`stats.py`/`freeze.py`/`reanalyze.py`/`registry.py`
as "built on Inspect AI" and claimed "logs land in Inspect's own format" while nothing in the package
imported `inspect_ai` and `__init__.py` cited `task.py`/`hermes_solver.py`/`scorer.py` files that did not
exist (review FAIL, `deleg_72653e2b/task-0.log`). Those five files are unchanged and still do not import
`inspect_ai` (they are pre-registration/stats, correctly described as that). What's new: `hermes_provider.py`,
`worktree_agent.py`, `arms.py`, `scorers.py`, `task.py` -- the actual Inspect integration, proved end to end
in section 4.
