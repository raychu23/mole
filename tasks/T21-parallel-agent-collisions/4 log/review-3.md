```notes core
core      T21 review 3: review-2 fixes, red b2e1d84 + fix 6cbc684 (plugins/claude-code only)
    verdict             VERIFIED: P1-1 + P1-2 from review 2 fixed, no new P0/P1 · 3 new P2 (Stop misses some real dependents · budget per call not per hook · P1-2 test covers only the env override) → §findings
    tests               red commit really red (2 of 3 failed at b2e1d84), neither new test can pass with no pair or with the old code → §tests
    checks              vitest plugins/claude-code + agentstate collisions 5 files 23 passed · M11 recall 100% (16/16), false alarms 0% (0/16) → §commands
    real data           Stop direction right on Mole's 1 live pair · SessionStart cut at 20 s under load 65 → §code
new       2026-10-29      first write
```
```notes
T21 review 3      reviewer-T21-r3 (fresh subagent, never saw the implementer session)      2026-10-29
    reviewed            b2e1d84 red tests (collisions-hook-review2.test.ts) · 6cbc684 fix (scripts/lib.mjs, session-start.mjs, stop.mjs) · worktree clean
    read                0 start.md (done-when, boundary) · review-2.md · git diff 6cbc684~2 6cbc684 · collisions.ts pair/chain code
```
```notes
tests (b2e1d84)
    P1-1 neg            s-caller-ed edits top (calls mid), s-mid-reader reads mid → Stop has no 'relies on it'
        vacuous?        no: at b2e1d84 it fails ('mole: you changed src/a.ts#top; claud…' not to contain 'relies on it'), so the pair is really found
    P1-1 pos            s-callee-ed edits mid, s-top-reader reads top → 'you changed src/a.ts#mid' + 's-top-reader' · passes before and after (guard against overcorrecting)
    P1-2                stand-in CLI hangs 20 s on collisions, MOLE_COLLISIONS_TIMEOUT_MS=1000 → empty stdout, < 8 s
        red?            yes: at b2e1d84 took 20219 ms (expected < 8000)
        gap             the 20 s / 35 s defaults are not exercised by any test (only the env override) → P2-3
```
```notes
code (6cbc684)
    direction rule      relies = my edit in p.shared, or chain ends at my edit and chain start is a symbol the other run touched
        p.path          one chain split into 'from -> to' edges (collisions.ts:406), so path[0] start + path.at(-1) end = the chain's ends · correct
        tries order     chain = shortest of ea→tb, tb→ea, eb→ta, ta→eb · only tb→ea (their code calls my edit) passes the rule · right direction
        real data       mole collisions --since 4 on Mole → 1 pair, bbf57a edited noteHits → memory → dirTree edited by 269fbb
                        collisionsStopText: bbf57a '' (it calls into 269fbb's code) · 269fbb 'you changed …reanchor.ts#dirTree; hermes bbf57a relies on it' · right both ways
    budget              sessionCollisions(…, timeoutMs) → moleJson timeout · MOLE_COLLISIONS_TIMEOUT_MS > 0 overrides · SessionStart 20_000, Stop 35_000 · on timeout undefined, other output kept
        real Mole       load 65: session-start.mjs 20 s (collisions ETIMEDOUT, cut) vs 30 s limit · stop.mjs 16 s / 7 s · unbudgeted collisions --run 28 s, all runs 74 s
    grammar             '1 parallel run touches' / 'N parallel runs touch' · fixed
    boundary            delta only plugins/claude-code/** · no keys, no agentstate/mcp change
```
```notes
findings
    P0 / P1             none
    P2-1 Stop misses    the rule sees only the 1 shortest chain per pair, and no chain at all when shared is non-empty → a real 'relies on it' is dropped (silence, not a false claim)
        reproducer A    a.ts: top → mid → leaf · pa-me edits mid · pa-other reads top + leaf → pair path 'mid -> leaf' (ea→tb wins the tie) → Stop ''
                        though pa-other's top calls mid · before 6cbc684 this pair was reported
        reproducer B    pb-me edits mid + reads x · pb-other edits x + reads top → shared [x], path [] → Stop '' though top calls mid
        probe           scratch copy, probe-r3.test.ts with the review2 fixture helpers (removed after)
        fix hint        let the CLI return the chain per direction (or a 'relies' list for --run), not just the shortest one
    P2-2 hook total     each call has a budget, the hook does not: Stop = check (moleJson default 45 s) + collisions 35 s · SessionStart = memory 45 s + collisions 20 s
        reproducer      fixture repo w 1 uncommitted change, stand-in CLI: check 30 s, collisions 40 s → stop.mjs 65 s vs Stop timeout 60 s (Claude Code would kill it, check output lost)
        real risk       low today: check --worktree 0.9 s, memory --json 2 s at load 35-65 (Mole has no .mole/notes, so no memory call there)
        fix hint        one hook deadline: collisions budget = limit − elapsed − margin
    P2-3 defaults       no test pins 20 s / 35 s or 'budget < hooks.json timeout' · a later edit to either side goes unseen
```
```notes
commands run (reviewer, worktree HEAD 6cbc684, load avg 35-68)
    git log --oneline -4 · git diff 6cbc684~2 6cbc684                                       → 4 files, red b2e1d84 then fix 6cbc684
    npx vitest run plugins/claude-code/test/ packages/agentstate/test/collisions            → exit 0, 5 files, 23 passed, 47 s
    node packages/agentstate/dist/bench/m11.js                                              → recall 100.0% (16/16), false alarms 0.0% (0/16), planted 7/7 0/7, real 9/9 0/9, 81 s
    scratch: git archive b2e1d84 plugins/claude-code + symlinked packages/node_modules, vitest review2 file
                                                                                            → 2 failed (P1-1 neg, P1-2), 1 passed · red confirmed
    same scratch + 6cbc684 scripts, probe-r3.test.ts                                        → reproducers A + B above (Stop '')
    stop.mjs / session-start.mjs on Mole (MOLE_BIN worktree cli, fake transcript w tool_use) → timings in §code
    stand-in slow CLI (check 30 s, collisions 40 s)                                         → stop.mjs 65 s (P2-2)
    main 3cb1485: npx vitest run packages/agentstate/test/langgraph-export.test.ts           → 'CLI: …' times out at 5000 ms on main too · T20, not T21
    git status --short in the worktree                                                      → clean · scratch dirs removed
```
