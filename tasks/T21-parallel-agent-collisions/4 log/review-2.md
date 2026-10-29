```notes core
core      T21 review 2: follow-up delta 400d21f..be95f3c (idle-gap liveness + Claude Code hook output)
    verdict             CHANGES NEEDED: 0 P0, 2 P1 (Stop says "relies on it" in the wrong call direction · hook latency has no budget vs the hooks.json timeouts) → §findings
    checks              npm run check 31 files 196 passed · M11 recall 100% (16/16), false alarms 0% (0/16) · red commit really red (3 of 6 failed) → §commands
    boundary            PASS: delta touches only packages/agentstate/** + plugins/claude-code/**, merge 400d21f kept both sides → §boundary
new       2026-10-29      first write
```
```notes
T21 review 2      reviewer-T21-r2 (fresh subagent, never saw the implementer session)      2026-10-29
    reviewed            merge 400d21f · red 6c201a1 · impl be95f3c (ledger/t21-parallel-agent-collisions, worktree clean)
    read                0 start.md (done-when 1-6, boundary) · review-1.md · key-changes.md note 2 · 2 insights.md 'T21 builder 3 follow-up'
```
```notes
tests (6c201a1) vs contract
    gap test            checks the right thing: g-old segments [300,299] + [5] min ago, g-gap at 150 → no pair · control g-near at 297 → pair
        red?            yes: at 6c201a1 'idle gap' test fails (AssertionError: expected { a: { run: 'g-gap' … } } to be undefined), control passes
    hook test           SessionStart names other run + src/a.ts#mid · Stop says 'you changed src/a.ts#mid' + other run · Stop silent on read-only · silence
        red?            yes for the 2 positive cases ('' to contain 'parallel run' / 'you changed src/a.ts#mid')
        vacuous         the 2 negative cases pass at 6c201a1 with no implementation (expected for negatives, but they guard nothing on their own)
        weak silence    s-solo works 300 min ago, outside --since 4 h and outside every window: it tests 'not parallel', not done-when 4 'unrelated files'
        probe           s-solo moved to 9 min ago (concurrent, unrelated e.ts) in a scratch copy → still silent (4/4 passed): behavior right, test weaker than its name
    T15 hooks.test.ts   5/5 passed (incl. 'silent when the session changed nothing, outside git, or no mole CLI')
```
```notes
code (be95f3c)
    collisions.ts       segments(): sorted complete-step times split at gaps > N · pair needs some segment pair within N (after the old [first,last] filter) · correct, small
    lib.mjs             sessionCollisions: skips the CLI unless transcript_path contains '"tool_use"' · sameFormRoot keeps the session's own path form (/var vs /private/var)
    session-start.mjs   notes text + collisions text joined, emit only if either non-empty (silence kept) · now calls findMole even with no .mole/notes (harmless)
    stop.mjs            mole check result + collisions text joined, MOLE_STOP_CONTINUE path kept for check questions only
    stop filter         any pair where this session has an edit → 'you changed X; <other> relies on it' regardless of edge direction → P1-1
```
```notes
findings
    P1-1 wrong direction    Stop claims the other run relies on your edit when the other run only touched a CALLEE of it (contract: 'what you changed that others depend on')
        reproducer          scratch copy of collisions-hook.test.ts, s-me edits top (calls mid), s-other reads mid only, then stop.mjs for s-me
                            → 'mole: you changed src/a.ts#top; claude-code s-other relies on it (src/a.ts#top -> src/a.ts#mid)'
        real data           stop.mjs on Mole, session 20261029_011331_1d49cc → 'you changed packages/daemon/src/cli.ts#main; hermes 20261029_013813_b9e17d relies on it
                            (cli.ts#main -> agentstate cli.ts#agentCli -> langgraph.ts#exportLangGraph)' · main calls T20's function, T20 does not rely on main
        fix hint            Stop: keep pairs where the other run's symbol reaches this session's edit (other -> … -> mine) or is the same symbol, or reword to 'near'
                            + a test with a caller-edit / callee-read pair
    P1-2 hook latency       collisions CLI added to both hooks with no time budget below the hooks.json timeouts (SessionStart 30 s, Stop 60 s), moleJson timeout is 45 s
        measured            on Mole, session 20261029_011331_1d49cc: session-start.mjs 19 s (vs 2 s for an unknown session) · stop.mjs 30 s (vs 5 s) every turn end
        risk                a slower machine or busy CPU (parallel agents = when this matters) passes 30 s → Claude Code kills SessionStart and T15's notes are lost too
                            Stop adds ~25 s to every turn of any session with a tool_use in Mole · review-1 P2-4 asked for a cache or budget, none added
        fix hint            per-call timeout well under the hook limit (skip collisions on timeout, keep notes/check output) or a cached result, + measure on Mole
    P2-1 silence test       see 'weak silence' above: add a concurrent unrelated-file session to the hook test
    P2-2 grammar            '1 parallel run touch code near yours' (probe output) → 'touches' for 1
    P2-3 any-segment        once two runs' segments meet, touches from all segments count (an edit 5 h earlier still counts) · implementer flags it in insights, not tested
    P2-4 bench drift        real half still reads live state.db + today's checkouts (review-1 P2-2) · key-changes note 2 proposes cutting runs at key.written, not done
    P2-5 runs.jsonl order   the red 400d21f line (time 10:10Z) is appended after the be95f3c line (10:17Z), labelled 'logged late' · fine, just out of order
```
```notes
boundary
    delta files         git diff 400d21f be95f3c --name-only → agentstate src/collisions.ts + test/collisions-gap.test.ts, claude-code scripts/{lib,session-start,stop}.mjs
                        + test/collisions-hook.test.ts · all inside the boundary, no mcp or daemon change
    merge 400d21f       --cc conflicts: package-lock + agentstate package.json (langchain deps + @mole/indexer), agentstate cli.ts (collisions + exportLangGraph imports,
                        both usage lines), index.ts (both exports), mcp server.ts (collisions tool + mole_check) · both sides kept, nothing dropped
    keys                no change to packages/agentstate/bench or m11-key.json in the delta
```
```notes
commands run (reviewer, worktree HEAD be95f3c)
    npm run check                                             → exit 0, 31 files, 196 passed, 43 s
    node packages/agentstate/dist/bench/m11.js                → exit 0, recall 100.0% (16/16), false alarms 0.0% (0/16), planted 7/7 0/7, real 9/9 0/9, 20.8 s
    npx vitest run plugins/claude-code                        → hooks.test.ts 5/5, collisions-hook.test.ts 4/4
    scratch copy at 6c201a1 (git archive + cloned node_modules), tsc -b, vitest the 2 new files → 3 failed, 3 passed (red confirmed)
    same scratch + be95f3c patch                              → 6 passed · probe-solo (concurrent unrelated) 4 passed · probe-dir → P1-1 text above
    hook timing on Mole (MOLE_BIN=worktree cli, plugin data in scratch, fake transcript with "tool_use")
                                                              → session-start 19 s / 2 s unknown session · stop 30 s / 5 s unknown session
    git status --short in the worktree                        → clean · scratch dirs removed
```
