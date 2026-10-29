```notes
T21 review 1      reviewer-T21-r1 (fresh subagent, never saw the implementer transcript)      2026-10-29
    verdict             VERIFIED: no P0, no P1; 5 P2 below. Hook output is deferred to T15 (coordinator scope); spec in 2 insights.md is concrete (call, SessionStart text, Stop text, silence rule)
    reviewed            base 17d9862 · red acd2737 · impl 441f46f · HEAD f793aef (ledger/t21-parallel-agent-collisions)
    R1                  PASS: acd2737 (02:05:34 -0500) holds m11-key.json (written 02:05:00 -0500), bench m11.ts, red collisions.test.ts, API stub only; runs.jsonl line 1 = red (9 failed, bench threw)
    R2                  PASS: `git diff acd2737 HEAD -- packages/agentstate/bench packages/agentstate/test` is empty (0 lines)
    R7                  PASS: green came from 441f46f (collisions.ts +381 lines), no check edited
```

```notes
done-when
    1 mole collisions [--json]  PASS: on this machine `node packages/daemon/dist/cli.js collisions --json --since 6 --root <Mole>` exit 0, 44 runs, 13 pairs,
                                each with a/b run + harness, shared, path edge by edge, changes (run, edit|read, symbol, time) newest first; text view prints the same
    2 MCP mole_collisions       PASS (MCP only, hook deferred to T15): stdio client listTools = mole_map,mole_tried,mole_collisions;
                                callTool {run: 20261029_011331_1d49cc, since_hours: 8} → 3 pairs, every pair contains that run
    3 M11                       PASS: `node packages/agentstate/dist/bench/m11.js` exit 0, recall 100% (16/16), false alarms 0% (0/16), planted 7/7 0/7, real 9/9 0/9, 21.5 s
    4 unrelated files           PASS: test c-un-a × c-un-b + planted p11 (unrelated files) and p09 (same file, other function) unflagged
    5 transcript still written PASS: test c-live (cut last JSONL line + Edit without result) and h-live (Hermes call without tool row); planted p06 (truncated) still hits, p14 (pending edit) does not
    6 npm run check             PASS: 21 files, 154 tests passed (02:38 run); `npx tsc -b && npx vitest run packages/agentstate packages/mcp` 27/27
```

```notes
bench sensitivity (mutations of dist/src/collisions.js, restored, `cmp` identical afterwards)
    flag every pair             exit 1  false alarms 97.2% (546/562)
    flag nothing                exit 1  recall 0%
    ignore time windows         exit 1  false alarms 90.9% (160/176)
    window 60 min               exit 1  false alarms 30.4% (7/23)
    ignore parent/subagent      exit 1  false alarms 27.3% (6/22)
    undirected graph            exit 1  false alarms 11.1% (2/18)
    hops 1                      exit 1  recall 75% (12/16)
    hops 3 / BFS d <= hops+1    exit 0  false alarms 5.9% (1/17), only p08a|p08b  → P2-1
```

```notes
spot-check of 3 real labels (sqlite3 -readonly ~/.hermes/state.db + git, independent of the detector)
    39e9f9 × b6f243 collision   confirmed: both siblings patched their worktree's packages/daemon/src/cli.ts (03:09:54Z, 03:17:24Z); 89f015b and 8b8f725 both change hunks inside main()
    646a55 × 0cfbfb collision   confirmed in substance: windows overlap; 0cfbfb patched cli.ts 02:25:43Z, 646a55 wrote memory/src/notes.ts 02:27:32Z; merge 7b47c51 had to combine cli.ts
                                (but see P2-3: the labelled path main -> addNote exists in today's main, not in T12's worktree at the time)
    269fbb × b9e17d not         confirmed: 269fbb wrote only memory reanchor.ts/m9 files, b9e17d only agentstate langgraph.ts/m10; langgraph.ts imports nothing from @mole/memory
privacy                         key/tests/insights carry run ids, symbols, times, roles and authored reasons; a 10-word-window scan of 165 user/assistant
                                messages from other sessions against the added lines found 1 hit, a command string (node packages/agentstate/dist/bench/m11.js ...), no prose
```

```notes
findings
    P2-1 hop limit unguarded    an off-by-one detector that walks 3 calls edges passes every check
        reproducer              sed -i '' 's/d <= hops \&\&/d <= hops + 1 \&\&/' packages/agentstate/src/collisions.ts packages/agentstate/dist/src/collisions.js
                                node packages/agentstate/dist/bench/m11.js → exit 0, "false alarms 5.9% (1/17) · planted false alarm p08a|p08b"
                                npx vitest run packages/agentstate/test/collisions.test.ts → 9 passed
        why                     one 3-hop negative among ~17 flagged fits inside the 10% budget; vitest has no 3-hop absence test (only r.hops === 2)
        fix (via key-changes.md, R2) more 3-hop negatives (planted or real) or a vitest case top -> .. -> deep edited in one window
    P2-2 real bench = live state the real half reads today's main checkout, every Mole worktree and state.db; e.g. memory/src/reanchor.ts#dirTree exists only
                                in the T19 worktree today, so removing worktrees or later code moves M11 with no T21 change; another machine gets exit 2 (fails loud, good)
    P2-3 labels share the rule  labels were committed 5 min before a 381-line implementation and phrase reasons as the detector's hop paths; 100% says code == rule
                                (insights admit this). Path evidence uses today's graph: 646a55 × 0cfbfb is labelled via main -> addNote, a call that T12's cli.ts did not
                                have then; the real conflict was cli.ts edited by both, T11's edit via terminal (invisible to the detector, a known gap)
    P2-4 latency                CLI 22-24 s on Mole (indexes ~11 checkouts, no graph cache); the T15 SessionStart/Stop hook needs a cache or a timeout budget
    P2-5 boundary               packages/daemon/src/cli.ts gains 'collisions' in the agentstate dispatch list (outside the boundary, one word, disclosed in insights, required by the red CLI test)
    note                        contract asks 6 planted pairs; the key has 16 (7 collision, 9 not): more than asked
```

```notes
commands run (reviewer, worktree HEAD f793aef)
    npx tsc -b && npx vitest run packages/agentstate packages/mcp    → 4 files, 27 passed
    node packages/agentstate/dist/bench/m11.js                        → exit 0, recall 100% (16/16), false alarms 0% (0/16)
    npm run check                                                     → 21 files, 154 passed
    git status --short after all mutations                            → clean
```
