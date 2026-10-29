```notes
T17 review 1      reviewer-T17-r1 (fresh subagent, never saw the builder chat)      2026-10-29
    verdict                 PASS → verified, no P0/P1; 7 P2 (1-3 fix before the paid full run)
    scope                   this round = harness + scorer tests + 2-sample mock dry run; the paid A/B waits for Raymond
    reviewed                worktree ledger/t17-agent-eval-inspect @1b0a35d · diff c20a191..HEAD -- evals/
                            red 4dfd168 (key + tests, 05:59) before impl 2db4845 and fix d8ff7c7 (R1 ok)

    done-when
        1 task set          PASS with deviation: B3-tidy + B3-review only; B1 R1-R5 excluded with a reason (P2-6)
        2 arms × n          PASS: n = 15/case/arm, 30/arm, stopping rule + claim rule in key.json dated 05:56, before any run
                            arms differ only by /repo/.claude/settings.json (T15 hooks + env) + Mole MCP; same image, prompt, limits
        3 report            PASS: rate per arm, Wilson 95%, Newcombe 95% diff, tokens + seconds (dry-run .md/.json)
        4 failure case      PASS: closed bridge port → ModelUnreachable, exit 3, '-incomplete.json', no rates (0631 probe)
        5 spend             PASS: non-mockllm refused, exit 2, before any model call

    key truth (independent of the scorer)
        rerun               docker run --network none mole-t17-eval:latest, guard copied in, vitest by hand (not the scorer)
        known good          2/2 '1 passed', exit 0
        planted applied     build 0; 2/2 exit 1 'the daemon stopped for idleness while its sources were being edited'
        existing tests      daemon.test.ts on planted code: 23 passed, exit 0 (matches key)
    scorer end to end
        regressed path      0615 dry run: B3-review both arms 'regressed' (mock leaves the plant) = correct
        kept path           review run: --cases B3-tidy --arms none, mockllm → kept 1/1, exit 0, 1 min 16 s (scratch only)
        mole arm live       0615 .eval log: mole sample holds the Stop hook's Mole question on 9e19c51 and mcp__mole tools;
                            none sample has neither
    credentials             compose: no volumes, network_mode none; Dockerfile copies only subject.bundle + tool.tar from git;
                            arm_config has no key/home paths (test); no ~/.claude, ~/.hermes or key copied

    findings P2
        1 answer key in sandbox     tool.tar = git archive of packages/ at d53d3bd → /opt/mole/packages/history/bench/keys/m8-key.json
                                    names 9e19c51 + 'idle clock' (grep count 4); both arms can read it, the mole arm's hooks + MCP
                                    live in /opt/mole. Repro: git show d53d3bd:packages/history/bench/keys/m8-key.json | grep -ciE '9e19c51|idle' → 4
                                    fix before the paid run: archive runtime paths only or strip */bench/
        2 partial run not caught    run.py scores whatever samples the log holds: no check of log.status == success or
                                    n == samples × epochs; a cancelled run gets rates. Repro: python3 -c "from mole_eval.scoring
                                    import summarize; ..." on 2 records → n=1 per arm, no IncompleteRun
        3 n not enforced            run.py --epochs defaults to 1, not key full_run 15; time/token-limit hits are scored and
                                    s.limit is not recorded
        4 spend guard untested      only run.py guards (inspect eval task.py --model anthropic/... bypasses it); no test.
                                    Repro: run.py --model anthropic/claude-sonnet-4-5 --label x → 'refused ...', exit 2 (works)
        5 ledger check thin         checks row uses system python3 → test_task_inspect skipped (16 passed 1 skipped); the
                                    async scorer is exercised only by manual Docker runs
        6 contract deviation        'B1 + B3' → B3 only (B1 R6 folded in); reason sound, Raymond to acknowledge
        7 hook drift                arm_config reads hooks.json from the live checkout, not tool commit d53d3bd (no diff today)

    commands + results
        PATH=/usr/local/bin:$PATH python3 -m pytest evals/inspect/tests -q        16 passed, 1 skipped
        evals/inspect/.venv/bin/python -m pytest evals/inspect/tests -q           18 passed
        guard by hand in the image (good ×2, planted ×2, daemon.test.ts)          0,0 · 1,1 · 23 passed
        run.py anthropic/... and openai/... --paid-run-approved ""                 refused, exit 2 (no network call)
        run.py mockllm B3-tidy none (scratch out + logs)                          kept, exit 0, no containers left
        not run                     full B3-review dry rerun (0615 log read instead), npm run check (ledger reruns it), any paid model
```
