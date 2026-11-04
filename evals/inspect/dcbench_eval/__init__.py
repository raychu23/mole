"""T90: reusable, generic Inspect AI integration for Mole's pre-registered A/B experiment system.

Real pieces (fixed after the 2026-11-04 review FAIL, which found nothing here imported inspect_ai):
  hermes_provider.py   @modelapi "hermes" provider (text-only; see its docstring for scope)
  worktree_agent.py    the solver that actually runs `hermes -z` in a per-sample git worktree
  arms.py              generic arm spec (none | rules:PATH | decisions:PATH | plugin_pin:SHA:PATH)
  scorers.py           mole_check_scorer (generic, any repo) + dcbench_scorer (dcbench's own scorer.ts)
  task.py              the generic Task `mole_ab`, parameterised by repo/dataset/arms/scorer
  spec.py, freeze.py   pre-registration: hash + freeze an experiment spec before run 1
  stats.py             scipy/statsmodels-only statistics (paired permutation, bootstrap, clustered SE,
                        Holm correction, sample size/power)
  reanalyze.py          re-analyse a finished run (T63's runs.jsonl OR an Inspect .eval log)
  registry.py           the experiments registry (idea -> status)

Sibling to mole_eval/ (T17), reusing its venv and conventions.
"""
