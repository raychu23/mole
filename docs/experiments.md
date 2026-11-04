## Summary
This is Mole's A/B experiment system (T90): a pre-registered way to answer "does adding decision X change
what my coding agent does?" It builds on Inspect AI (the industry framework for agent evals, already Mole's
T17 choice) instead of a home-grown test runner; the stats are scipy/statsmodels, never hand-rolled. One
command freezes an experiment before you run it; one command reproduces a past analysis. The dcbench
productivity test (T63, 72 runs) is the worked example throughout. Open: a generic "point this at any repo's
.mole/decisions" runner is not built yet (today's adapters are the dcbench-shaped task); see "What's open".

## 1. The three things in this system

```notes
spec + freeze     evals/inspect/dcbench_eval/spec.py (ExperimentSpec, freeze_spec, assert_frozen_unedited)
                  a JSON file: hypothesis, arms, tasks, primary metric, analysis plan, sample size/power, stop
                  rules. Hashed once, before run 1. Any edit after that is refused by --check: it is a NEW
                  version (protocol-v2, -v3, ...), never a silent fix.
stats             evals/inspect/dcbench_eval/stats.py: paired_permutation_test, bootstrap_ci, clustered_se,
                  holm_correction, sample_size_for_mde -- all scipy/statsmodels, cited per function. Reuses
                  evals/inspect/mole_eval/scoring.py's wilson/newcombe_diff (built for T17) for rate intervals.
registry          evals/inspect/dcbench_eval/experiments/registry.json: every experiment, idea -> status
                  (idea | pre-registered | running | analyzed | done).
```

## 2. The one command to pre-register a new experiment (runnable in CI)

```sh
evals/inspect/dcbench_eval/freeze.py path/to/your-experiment.json
# ... edit tasks, prompts, decision records, whatever; before the FIRST scored run:
evals/inspect/dcbench_eval/freeze.py path/to/your-experiment.json --check   # exit 0: untouched since freeze
```

Put the `--check` form in CI (a GitHub Actions step, or any pre-run gate): it exits non-zero the moment
someone edits a frozen spec, scorer or task file after run 1 -- the same discipline OSF/AsPredicted
pre-registration enforces for human studies, applied to agent experiments.

## 3. The one command to re-analyse a finished experiment (with intervals)

```sh
evals/inspect/dcbench_eval/reanalyze.py --runs path/to/raw/runs.jsonl
# machine-readable:
evals/inspect/dcbench_eval/reanalyze.py --runs path/to/raw/runs.jsonl --json
```

Worked example: `evals/inspect/dcbench_eval/reanalyze.py` (no `--runs`) re-analyses T63's frozen 72-run
dcbench productivity test, read-only, and reproduces every number in
`context/product-plan/systems/metrics-proof/productivity/results-72.md` exactly, plus intervals that file
didn't have: a bootstrap 95% CI on each arm's mean task score, a clustered standard error (clustered on task,
the unit of randomization), and Holm-corrected p-values across the three pairwise comparisons. Tests:
`evals/inspect/dcbench_eval/tests/test_reanalyze.py`.

## 4. "Does adding decision X change what my agent does?" -- today's answer and what's open

**What exists today**, built on the T63 pattern: write the decision record both ways (without X, with X),
run the same dcbench-shaped task with each via `hermes -z` (see
`context/product-plan/systems/metrics-proof/productivity/scripts/run_dcbench.py` for the exact mechanism:
arm A/R/M context placed before the same prompt, same model, git-isolated worktree per run), then
`reanalyze.py --runs <your raw/runs.jsonl>` for the paired stats and intervals. `protocol-v2.json`
(pre-registered, NOT run; see `4 log/`) is the next version of exactly this pattern: same three arms, plus a
check that forces a fix on a blocking violation.

**What's NOT built yet** (say so plainly, not "coming soon"): a generic CLI that takes an arbitrary team repo
and an arbitrary `.mole/decisions/*.md` pair (with/without) and produces the dcbench-shaped task automatically
is still dcbench-specific glue (`run_dcbench.py`), not a reusable adapter for any repo. Generalising it --
building the arm-from-decision-record step as a standalone `dcbench_eval` solver/config, independent of the
dcbench benchmark -- is the next piece, tracked in `evals/inspect/dcbench_eval/experiments/registry.json` as
an open idea, not yet pre-registered.

## 5. Why Inspect AI, not a new framework

Raymond's correction (2026-11-04): build on the established OSS eval stack, write only adapters. Per
`context/product-plan/7 Build vs take.md` §1 ("agent A/B (T17) Inspect (taken) ... TAKEN (Inspect)") and §3
("take anything a focused project already solved well; build where Mole's claim lives"), Inspect AI (UK AI
Security Institute, MIT, already used for T17) is the runner; `hermes -z` is a solver/config, dcbench is a
Task, logs land in Inspect's own format so `inspect view` works unmodified. promptfoo was weighed (its
CI-native `npx promptfoo eval` shape is why `--check` above is a single CI step) but has no Docker sandbox or
external-agent bridge, which this kind of "agent edits a real repo" task needs (Inspect SWE's `claude_code()`
does). Full citations, versions and dates: `tasks/T90-ab-experiment-system/4 log/prior-art.md`.

## 6. Where things live

```notes
evals/inspect/dcbench_eval/spec.py           experiment spec + freeze/check
evals/inspect/dcbench_eval/stats.py          paired permutation, bootstrap CI, clustered SE, Holm, power
evals/inspect/dcbench_eval/registry.py       the experiments registry (ideas -> status)
evals/inspect/dcbench_eval/reanalyze.py      re-analyse a runs.jsonl (read-only), with intervals
evals/inspect/dcbench_eval/freeze.py         the CLI for #2 above
evals/inspect/dcbench_eval/experiments/      protocol-v2.json + FROZEN-v2.sha256 + registry.json
evals/inspect/dcbench_eval/tests/            pytest; run with the venv at
                                              /Users/a1/.hermes/cache/scratch/mole-ab-venv (scipy, statsmodels,
                                              pytest) or any Python 3.12 with those three installed
evals/inspect/mole_eval/                     T17's agent A/B (none vs mole, planted B3 regression); its
                                              scoring.py intervals are reused by reanalyze.py above
context/product-plan/systems/metrics-proof/  T63: frozen, read-only. protocol.md, FROZEN.sha256,
  productivity/                              results-72.md, raw/runs.jsonl are never edited by this system
```
