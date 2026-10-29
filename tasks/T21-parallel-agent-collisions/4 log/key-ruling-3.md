# T21 key ruling 3 (reviewer-T21-ruling-3, fresh reviewer, R2)

```notes core
core      ruling on key-changes.md 'T21 key-change request 3': 30 s per-test timeout for 2 tests owned by T20 + T16
    ruling                  APPROVE      append `30_000` as 3rd arg of exactly 2 `it(...)` calls, nothing else      → §ruling
    why not loosening       5 s is vitest's default, not a contract value      assertions unchanged      neither contract names a speed      → §r7
    evidence                T20 CLI test alone 4.85 s pass / 5.48 s timeout at load 59-66      key-guard test alone 2.3-2.5 s      → §evidence
    real-cost cut           checked      only cheap-looking cut (lazy langgraph) saves ~0.7 s on 1 of 3 spawns, not cheap given frozen re-export      → §cost
new       2026-10-29      first ruling on request 3
```

```notes
ruling
    decision                APPROVE
    date                    2026-10-29
    test 1                  packages/agentstate/test/langgraph-export.test.ts > 'CLI: mole run <id> --export langgraph <file> writes the file and says so; a 0-step run exits 0 with the note' (red commit 626a462, T20)
        exact edit          line 164 `  });` closing that `it(...)` → `  }, 30_000);`
    test 2                  packages/telemetry/test/key-guard.test.ts > 'allows a change only with an APPROVE ruling naming the key and the exact sha256 of the new content' (red commit d81d48d, T16)
        exact edit          line 92 `  });` closing that `it(...)` → `  }, 30_000);`
    only                    append the 3rd argument `30_000` to those 2 `it(...)` calls
    not allowed             any change to their bodies, expects, fixtures, spawn args, other tests, vitest.config.ts, global testTimeout, hookTimeout
    commit                  1 commit w only these 2 lines changed      message names this ruling file
r7
    q                       is raising a wall-clock budget "loosening the check"
    a                       no, here      R7 protects what a check asserts      every expect stays identical (exit codes, '4 checkpoints', history length 4, 0-step note, exit 2 on bad format      guard exit 0/1 per ruling)
    budget source           5 s = vitest default testTimeout      neither red commit set a timeout      so 5 s was never a chosen acceptance value
    contracts               T20 0 start.md done-when 1-5: format, M10 round-trip 100%, fork, 0-step case, npm run check      no speed
                            T16 0 start.md done-when 1-5: OTel spans, MLflow load, CI key guard, no network, npm run check      no speed
    limit                   30 s still fails a real hang (spawnSync has no own timeout, so a hung CLI/guard still goes red)      ≈5x worst observed alone
    would be loosening      a timeout on a speed-asserting bench (M5 etc) or any change to an expect
evidence
    load                    `uptime` 06:33-06:36      1-min load 58-83 on 8 cores (`sysctl -n hw.ncpu` = 8)
    test 1 alone            `npx vitest run packages/agentstate/test/langgraph-export.test.ts -t 'CLI'` 2 runs
        run a               pass 4847 ms
        run b               FAIL 'Test timed out in 5000ms' at 5477 ms
    test 2 alone            `npx vitest run packages/telemetry/test/key-guard.test.ts -t 'APPROVE ruling'` 2 runs      pass 2450 ms, 2326 ms
        why it can time out 4 git commits in repo() + 5 guard spawns (node + several `git` subprocesses each)      no heavy imports (guard uses node builtins only)      >2x slower under full-suite load 90-157 crosses 5 s
    spawns test 1           3x `node packages/daemon/dist/cli.js run …` (langgraph, langgraph 0-step, 'dot' bad format) + in-process LangGraph getStateHistory read-back
    per-spawn cost          scratch timing (python, 6 rounds, load 61-69) of `cli.js run X --export dot` (exit 2)
        now                 median 0.90 s (0.61-1.25)
        typescript stubbed  median 0.89 s      typescript load is not the cost here
        + @langchain/* stubbed  median 0.17 s      → @langchain/langgraph + checkpoint-sqlite load ≈ 0.7 s/spawn
        bare `node -e 0`    median 0.04 s
        how                 node --import loader hook in ~/.hermes/cache/scratch/r3 (stubs resolved specifiers)      no repo file touched
    correction to request   request says ~1.4 s/spawn "node ESM load of the daemon CLI"      measured ~0.9 s, ~0.7 s of it is LangGraph loaded eagerly via @mole/agentstate index      conclusion (no cheap cut removes the risk) still holds
cost
    candidate cut           lazy-load langgraph so non-export agentstate commands skip it
        saving in test 1    only the 'dot' spawn (~0.7 s of ~5 s)      the 2 export spawns need LangGraph anyway      test stays ~4.1-4.8 s at load 60, still over 5 s at load 90+
        why not cheap       packages/agentstate/src/index.ts re-exports exportLangGraph/RunState from langgraph.js and the frozen T20 test imports them from ../src/index.js      so a lazy path needs a separate CLI entry (cli.ts + daemon import) not index.ts      a refactor across T18/T20/T21 code, outside this ruling
    test 2                  no import cost to cut      cost = git + node process spawns the test asserts on
    so                      the raise does not hide a slowdown      it absorbs outside load from 3 builders + a tool trial running at once
recommendation (not required for this ruling)
    T21 hooks               SessionStart/Stop hooks that spawn `mole collisions` load @mole/agentstate, so each pays ~0.7 s of unused LangGraph load      worth a follow-up task: lazy LangGraph behind a separate agentstate CLI entry
out of scope                any other slow/flaky test      each needs its own ruling
change log
    2026-10-29              ruling written by reviewer-T21-ruling-3
```
