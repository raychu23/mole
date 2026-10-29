# T22 review 1 (reviewer-T22-r1, fresh session, 2026-10-29)

```notes
verdict                 changes-needed: 1 P1 (a selected test whose title contains " > " is never run; a failing guard test exits 0)
                        M14 reproduced (10/10, mean 18.4%) and held up on blind regressions I wrote; the rest is P2
reviewed                base 70a2989 · red ca5fea4 (06:58:00) · impl 2dfd1d3 (06:59:04) · runs e920857
read order              red commit (tests, key, bench, make-key) first, then the code diff, then 2 insights.md
```

## Done-when

```notes
1 --run-tests selects   MET. Fix lineage (T12 check pastFixes[].tests) + reverse `calls` BFS on @mole/indexer, nearest tests per
  + runs (vitest)       caller branch; vitest with --testNamePattern. Tried from the CLI on real diffs (below): --worktree, <sha>,
                        --diff FILE all select, run and exit 1 on a failing test. Bug in the name filter: P1-1
2 M14                   MET as defined in the frozen key. My run: `node packages/verify/dist/bench/m14.js` →
                        "caught 10/10 · ran 18.4% of reaching tests (mean; aggregate 1.3%, 162/12159) · run all 10/10 at 1347.5% ·
                        run none 0/10 … MET", model calls 0, 75 s
                        denominator: `vitest related <edited files>` (vite module graph), made by make-key.mjs with no @mole/verify
                        or @mole/indexer code → independent of the selector (yes)
                        mean vs aggregate: the key's `definitions.share` (frozen before the impl commit) says mean; both pass
                        (18.4% / 1.3%). Per row, m11 (100%) and m12 (38.8%) exceed 1/3; see P2-2
                        key before code: commit order and `written` 06:57:35 CDT < 06:59:04 hold (R1 letter). The draft selector
                        did exist and was run on bench patches before the freeze (P2-1); blind regressions below were caught anyway
                        R2: `git diff ca5fea4..HEAD` on the red paths touches only package-lock.json and the src/index.ts stub
3 no test reaches       MET: says "no test reaches this change", names a test file, exit 0 (tried, below). The suggested test can be
                        unrelated in a src/ + test/ layout (P2-3)
4 npm run check         one run: 1 failed | 185 passed. The failure is packages/agentstate/test/langgraph-export.test.ts
                        "Test timed out in 5000ms" (load average 41, untouched package) = environment noise; that file alone with
                        --testTimeout=60000: 5 passed. The implementer's runs.jsonl line 3: pass 186/186
```

## Findings

```notes
P1-1  a selected test whose title contains " > " is silently skipped; a failing guard test gives exit 0
      cause      runTests builds --testNamePattern from namePattern(name), which splits the full name on ' > ' and rejoins with
                 a space, so a title like 'ranks a > b' becomes 'ranks a b' and vitest matches nothing
      repro      fixture repo (~/.hermes/cache/scratch/reviewer-T22-r1/fx), test/m.test.ts =
                 it('ranks a > b', () => { expect(add(1, 2)).toBe(3); }); break add (a - b), then
                 node packages/daemon/dist/cli.js check --worktree --run-tests --root <fx>
      observed   "1 test selected … vitest: 0 failed, 0 passed" / "- skip  test/m.test.ts:3  ranks a > b" / exit 0
                 `npx vitest run test/m.test.ts` in the same state: "FAIL test/m.test.ts > ranks a > b", 1 failed
      in Mole    the same skip on Mole's own suite: a parseDiff edit selects packages/questions/test/questions.test.ts:169
                 'ranks past fix > note > guard-test, …', reported "- skip" (27 selected, 26 run)
      why P1     the hand-back gate reports a pass while a selected test fails. Also, a selected test that the runner did
                 not run is shown as "- skip" and does not change the exit code or the header count

P2-1  the key was frozen after a draft selector had run on bench patches; the disclosure undercounts it
      evidence   ls -lT ~/.hermes/cache/scratch/mole-builder-5/t22: impl/graph.ts 05:27, graph-mole.sqlite 05:48:54,
                 try.mjs 06:21:47, try-x.log 06:24:29 (draft selectTests on x02 x03 x04 x05 x06 x07 x08), impl/index.ts
                 06:44; make-key3.log 06:56 and key `written` 06:57:35. 2 insights.md says the draft ran "on m05-m08"
                 only, and separately that m12 was missed in "a scratch trial" and the policy changed to nearest-per-branch
      effect     no patch file changed after 05:48 (all patch mtimes 05:20-05:48) and the freeze rule is mechanical, so the
                 truth is not selector-made; but the bench is not held out: the selector was tuned on frozen members (m12)
      checked    blind regressions I wrote without looking at selector output (below): 2 of 2 valid ones caught
      fix        correct the insights line (x02-x08 were also run; m12 drove the branch policy) — no code change needed

P2-2  the mean share leans on Excalidraw's near-whole-suite reach; Mole's half alone is 35.7%
      evidence   key reach for x rows = 2256-2470 of 2632 tests (vite's module graph pulls in most of the suite through barrel
                 imports), so Excalidraw shares are 0.2-3.2%. Mole rows: 3.5%, 3.0%, 33.3%, 100%, 38.8% → mean 35.7%
                 (from `.mole/local/bench/m14-details.json` ratios). Not a breach (target is over 10), but report it
                 beside the 18.4%

P2-3  "nearest guarding test" fallback can name an unrelated file; an empty change also says "no test reaches"
      repro      fixture with src/m.ts, test/m.test.ts (imports m.ts) and test/a.test.ts (unrelated); edit lonely() in
                 src/m.ts (no test calls it) → "nearest guarding test: test/a.test.ts (first test file in the repo (none
                 shares a folder with the change))", exit 0. test/m.test.ts imports the edited file but is not preferred
                 clean worktree, and a README-only change → "no test reaches this change" + a nearest test, exit 0
      fix idea   prefer test files that import the edited file (the graph has `imports` edges); say "no code change" when
                 no source hunk exists

P2-4  boundary: packages/daemon/package.json, packages/daemon/tsconfig.json and root tsconfig.json are edited (not in the
      boundary list); each is the one-line workspace/project reference the new package needs. cli.ts = one line (dynamic
      import + call). `git diff 70a2989..HEAD --stat` shows no plugins/, history/ or prototype/ edits
```

## Adversarial tries

```notes
blind Mole (own clone at 70a2989, ~/.hermes/cache/scratch/reviewer-T22-r1/mole; CLI from this worktree)
    A anchorKey drops kind      selected 1 (core.test.ts anchorKey), passed; full suite 0 failing → not a suite-visible regression
    B labelOf full path         selected 5 (via renderSvg), passed; full suite 0 failing
    C parseDiff newLn = c       selected 27, 26 run (P1-1 skip), passed; full suite 0 failing
blind Excalidraw (own cp -cR copy of the coordinator clone at e7b5346; truth = full `npx vitest run`, 2632 tests)
    E1 getCommonBounds maxY<-y1 full 74 failing; selection ran 317, 35 failed, caught (CLI exit 1)
    E2 isTransparent <= 0.5     full 0 failing; selection ran 296, 0 failed (correctly nothing to catch)
    E3 pointDistance b[0]-a[1]  full 468 failing; selection ran 269, 113 failed, caught (CLI exit 1)
    → 2 of 2 valid blind regressions caught at 10-12% of the full suite
CLI on a fixture repo
    sha mode (check HEAD)       1 selected, FAIL, exit 1
    --diff FILE                 1 selected, FAIL, exit 1
    edit only a test file       that test selected ('the change edits this test'), FAIL, exit 1
    orphan function             "no test reaches this change", nearest named, exit 0 (P2-3)
    not a git repo              "mole: git rev-parse --show-toplevel: fatal: not a git repository", exit 1
    title with " > "            skipped, exit 0 (P1-1)
noise                           npm run check's only failure = langgraph-export 5 s timeout under load 41 (not T22)
```
