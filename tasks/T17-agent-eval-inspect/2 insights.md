```notes
T17 insights      mole-builder-3 (builder subagent + a4)      2026-10-29
    built                   evals/inspect/ (Python, Inspect AI 0.3.286 + Inspect SWE 0.2.72, venv evals/inspect/.venv, not uv: it segfaults here)
        task                mole_eval/task.py: claude_code() in Docker image mole-t17-eval (1.16 GB), 2 arms
                            none = plain Claude Code · mole = + T15 hooks (/repo/.claude/settings.json, MOLE_STOP_CONTINUE=1) + Mole MCP server
        cases               cases/key.json (written 05:56, red commit 4dfd168): B3-tidy (tidy-up tempting to drop fix 9e19c51) + B3-review
                            (planted diff already in the tree); truth = the guarding test cases/b3/guard.test.ts on known-good vs planted code
        excluded            B1 R1-R5 (excalidraw memory-recall: no planted regression, no guard test; sandbox + node_modules over the disk budget)
                            B1 R6 = the Mole case, covered by B3      INFERENCE: contract says 'B1 + B3'; B3 only is the builder's call, reviewer to check
        scorer              copy guard test → npm run build → vitest; 1 = regressed / build_broken / guard_unrunnable (each counted apart), 0 = kept
        report              run.py → 4 log/<stamp> <label>.{json,md}: rate per arm, Wilson 95%, Newcombe 95% for the difference, tokens + seconds
        spend guard         any model other than mockllm/* refused without --paid-run-approved "<Raymond's go>"
        no partial score    any errored sample → exit 3 + '<label>-incomplete.json', no rates (done-when 4)
    how the model is reached    Inspect SWE starts Claude Code in the sandbox and points it at a bridge port that forwards to Inspect's model
                            API, so --model mockllm/model = no Anthropic call, no key, no login (anthropic SDK installed only to translate requests)
                            nothing from ~/.claude or ~/.hermes is mounted; ANTHROPIC_API_KEY unset in every run (env -u)
    dry run                 2026-10-29 06:15 (2db4845): 2 samples B3-review × 2 arms, mockllm, exit 0
                            none: regressed, 24,996 tokens, 91.8 s · mole: regressed, 52,364 tokens, 136.7 s
                            meaningless as a result: the mock never fixes anything; it proves sandbox + Claude Code + bridge + both arms + hooks
                            firing (the mole arm's transcript holds the Stop hook's Mole question on 9e19c51) + scorer + report
                            first attempt 06:12 exit 3: bridge needed the anthropic SDK → added to requirements.txt
    failure probe           06:31 (d8ff7c7): Claude Code pointed at a closed port → ModelUnreachable, 'INCOMPLETE RUN, no rates', exit 3, 4 min
    full run (not run)      n = 15 epochs × 2 cases = 30 runs per arm, 60 total, fixed n, no interim looks, both arms interleaved in one eval
                            claim 'Mole reduces the regression' only if the Newcombe 95% interval of rate(none) − rate(mole) lies above 0
                            power: n=30/arm detects only large effects (e.g. 60% vs 20%)
        cost INFERENCE      the mock's 25-52k tokens per run is mostly Claude Code's own prompt; a real agent loop is likely 0.3-1 M input tokens
                            per run (cached) → 60 runs ≈ $50-200 on Sonnet-class pricing; measure on 2 paid samples first
    needs Raymond           go on API spend for the full A/B (which model, budget cap) · an API key for the eval (never his Claude login)
    odd                     builder subagent stopped at 06:23 on a provider 401 (Hermes OAuth token expired); a4 reran the failure probe + checks
                            load average 30-157 all night: npm run check timeouts in other packages (fixed for 2 tests by T21 key-ruling-3)
                            disk free 7.6 GB at 06:40 (Docker image 1.16 GB + other Docker images already present: docinsightsv2, rag-assistant)
```
