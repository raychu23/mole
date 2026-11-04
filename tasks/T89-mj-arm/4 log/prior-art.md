## Summary

Prior-art / reuse check before building the T89 M+J arm (brief step 1): does Mole's shipped judge/router call
already go through the subscription (never a paid API key), or does this task need to add a spawn adapter? Answer:
**no adapter needed** — the shipped code already does this. Reused as-is; only a thin, unmodified-import measurement
wrapper (stop-mj.mjs) was added to surface metrics stop.mjs normally discards.

```notes
sources read (newest first, dated 2026-11-04 this session)
    1  packages/decisions/src/compile/llm.ts (repo, current)        hermesLlmClient(): the ONE place a model is
                                                                      called from decisions code. execFileSync('hermes',
                                                                      ['-z', prompt, '-m', model, '--provider',
                                                                      provider, '-t', '', '--safe-mode',
                                                                      '--usage-file', usageFile], ...). No API key,
                                                                      no `claude` CLI. Comment on line 1-4 names its
                                                                      own prior art: "shells to the `hermes` CLI
                                                                      exactly like
                                                                      context/product-plan/systems/metrics-proof/
                                                                      m2-conflict/run_llm_arms.py's bench arms" --
                                                                      i.e. this repo already standardized on one
                                                                      pattern for every model call, reused here too.
    2  packages/decisions/src/cascade/cli.ts (repo, current)        cascadeCheckCli(): `const client = flags['no-llm']
                                                                      ? undefined : llm ?? hermesLlmClient()`
                                                                      (judge, default model), `routeClient =
                                                                      ... hermesLlmClient({ model:
                                                                      SEMANTIC_ROUTE_DEFAULTS.routeModel })` where
                                                                      routeModel = 'claude-haiku-4-5'. Confirms
                                                                      "haiku router + judge" names two calls through
                                                                      the same one client function, not two
                                                                      different adapters.
    3  plugins/claude-code/scripts/verify.mjs (repo, current)        runVerifier(): `mole cascade-check --worktree
                                                                      --json [--no-llm if MOLE_STOP_VERIFY_LLM=0]`.
                                                                      Confirms the ONLY difference between the frozen
                                                                      M arm and M+J is this one flag (unset = shipped
                                                                      default, LLM on).
    4  context/product-plan/systems/metrics-proof/productivity/     the M arm's own driver: hook_env() has no
       scripts/run_dcbench.py (repo, frozen 2026-11-03)              MOLE_STOP_VERIFY_LLM key at all -- confirms the
                                                                      off-switch for M's 72 runs was set in the
                                                                      ambient shell env the operator used, not in
                                                                      this script, and that this task's own hook_env()
                                                                      (which also omits it) correctly falls back to
                                                                      the shipped default (LLM on) for M+J.
    5  live call, this session                                       `hermes -z "reply ok" -m claude-haiku-4-5
                                                                      --provider anthropic -t "" --safe-mode` ->
                                                                      "ok" -- confirms hermes accepts the haiku model
                                                                      id and the subscription path works end to end,
                                                                      before trusting it inside a benchmark run.

finding   no spawn adapter is needed (contra the brief's conditional step 1b): hermesLlmClient() already satisfies
          "never a paid API key"; reused unmodified. Building a second adapter would have duplicated working code
          and risked drifting from the shipped behavior this arm is supposed to measure ("Mole as shipped").
what was added instead   a measurement WRAPPER (stop-mj.mjs), not an adapter: imports lib.mjs/verify.mjs unmodified
          from the pin and calls the same exported functions stop.mjs's main() calls, purely to surface the
          structured judge/router usage JSON those functions already compute and stop.mjs already discards after
          formatting it to text. Zero plugins/claude-code source edited (see protocol-mj.md "measurement wrapper").
```
