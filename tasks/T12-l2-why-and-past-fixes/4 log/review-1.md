```notes
T12 review round 1 (fresh reviewer reviewer-T12-r1; 2026-10-28; branch ledger/t12-l2-why-and-past-fixes @24f8d0d, base 1a003c5)

verdict                 no P0 / P1 -> verified      6 P2 below (none blocks a done-when item)

loop rules
    R1                  red 8297d8a (bench m2.ts + keys + fixture + check() throwing 'not implemented' + draft tests .txt) precedes impl ddba63d; red run bb4e0ec exit 1 (M2 0/5, contract 0/7)
    R2                  keys + fixture byte-identical to context/product-plan/systems/... (cmp: m8-key.json, past-fix-overlap.json, planted-m8.diff)
                        git diff 8297d8a HEAD -- packages/history/bench = exactly the 2 ruling lines in item 'dw1 worktree + diff-file modes' + new bench/modes.ts
                        packages/history/test/history.test.ts vs proposed-tests/history.test.ts.txt = header reworded (4 lines -> 2) + the 2 ruling edits; draft .txt unchanged since 8297d8a
    R4                  runs.jsonl 4 lines, one per run (8297d8a exit 1, ddba63d exit 1, 276a91f exit 1, 0881670 exit 0)
    R6                  mole check 1919728724 --json twice (ms dropped): identical sha 7841e73b
    read-only           git -C excalidraw status --short -> only '?? .mcp.json' after all runs

bench honesty (m2.ts)
    key rule            per key fix: found by sha prefix; named = sha/subject; source = source.sha == fix + file + line > 0; strict = min over every key fix (R4 2 fixes, R5 3 fixes all required)
    gap                 source file:line is not checked against the key lines (diagnostic 'lineMatch' only); this run prints no '(no key line)' flag, so every scored fix also hits a key line
    B3                  checks 9e19c51 + 'editing counts as use' + index-never-idle + T9 task link + daemon.test.ts 'idle shutdown (T9)' + source server.ts:211-217: not trivially passable
    B2                  every fixCommitsStrict row needs >= 1 past fix; also reports listed shas found
    M5                  p95 over the 53 B1+B2 calls, timed around check(); model calls: see P2-4

fresh run (worktree)    npm run check -> exit 0, 9 files / 72 tests (history.test.ts 10/10)
                        node packages/history/dist/bench/m2.js -> exit 0: M2 R1-R5 5/5 strict, R6 1; B3 pass; B2 21/21 (53/53 shas); C 7/7;
                        M5 p95 493 ms over 53 changes (max 968), model calls 0; 'bench: all targets met'

attack (as a user)
    R1 02fc9f3505       names 3747163 fix(editor): improve UX around locked animations, source 374716304a... App.viewport.ts:633, tests listed, 6 quiet hunks; exit 0
    R4 53973c3a42       names a3b9089 and dd8296a with source + tests; ALSO lists afa3a65 feat(editor): sticky notes as a past fix (P2-1)
    B3 planted diff     --diff bench/fixtures/planted-m8.diff --base bdeff14 --root Mole: server.ts:211-212 and :217 -> 9e19c51, why includes
                        'editing counts as use: a person typing in one file for an hour must not lose the map' + 'never idle' comment + T9 task goal,
                        tests packages/daemon/test/daemon.test.ts (idle shutdown (T9) ...), source 9e19c518... server.ts:211; exit 0
    temp repo (scratch t12rev-13089)
        root commit     '3 hunks: no past fixes on these lines' exit 0
        path w/ spaces  'dir sp/my file.ts:2' -> the fix, source 'dir sp/my file.ts:2' exit 0
        renamed+edited  moved.ts:10 -> the fix, source mv.ts:10 (old name, correct at the fix sha) exit 0
        merge commit    diff vs first parent; side change on an init line -> 'no past fixes' exit 0 (correct)
        binary (NUL)    '0 hunks: no past fixes on these lines' exit 0 (skipped, fine)
        clean worktree  '0 hunks: no past fixes' exit 0
        no mode         usage line, exit 2
        bad sha         'mole: git rev-parse --verify: fatal: Needed a single revision' exit 1 (P2-3)
        missing --diff  'mole: ENOENT ... /nonexistent' exit 1      non-repo root: 'not a git repository' exit 1      bad --fix-rule '(': regex error exit 1

findings (all P2)
    P2-1  fix rule also tested on the commit BODY (Run.isFix: rule.test(subject) || rule.test(body)), so the unanchored 'regression' alternative
          makes feature commits count as fixes. Repro: node packages/daemon/dist/cli.js check 53973c3a42 --root ~/.hermes/cache/scratch/impact/excalidraw
          -> 'afa3a65 feat(editor): sticky notes (#12064)' listed under App.tsx:12453-12695 (its body says 'regression tests'). The benchmark's
          fixRule (past-fix-overlap.json method) is a subject rule. Precision noise in user output; does not affect any scored target.
          Fix: subject-only by default, body opt-in.
    P2-2  a diff file that does not apply to --base, or is not a diff at all, prints 'no past fixes' exit 0 (blame errors swallowed in blame()).
          Repro: printf 'diff --git a/moved.ts b/moved.ts\n--- a/moved.ts\n+++ b/moved.ts\n@@ -500 +500 @@\n-nope\n+nope2\n' > bad.diff;
          mole check --diff bad.diff --root <repo>  -> '1 hunk: no past fixes on these lines' exit 0; 'garbage' file -> '0 hunks: ...' exit 0.
          A wrong --base silently reads as 'safe'. Fix: warn / non-zero when a block's lines are past the base file end or no diff headers parse.
    P2-3  bad sha error does not name the input: 'mole check deadbeef' -> 'mole: git rev-parse --verify: fatal: Needed a single revision'.
          Fix: "mole: unknown commit 'deadbeef'".
    P2-4  modelCalls.count is a constant nothing increments, so the bench's 'model calls 0' check is vacuous. The claim still holds by inspection:
          packages/history/src has no fetch / http / LLM client (grep 'fetch(|https?:|openai|anthropic' -> none); only git child processes.
    P2-5  source line is the line in the fix commit's own version (e.g. R4 a3b9089 -> App.tsx:9242 while the hunk header reads 8347-8837 at the base).
          Correct and clickable with the sha, but the text output does not say which version; add 'at <sha>' or also print the base line.
    P2-6  package-lock.json root engines '>=22.5' -> '>=22.13' rides along (npm install syncing the lock to root package.json, which already says
          >=22.13 on main). Outside the listed boundary but harmless wiring; mention it in the merge.

not checked             vitest of the edited draft beyond this run (passes here 10/10); performance on repos other than excalidraw/Mole
```
