# T22 insights (assumptions and design choices; Raymond away 2026-10-29, nobody to ask)

```notes
key design (M14)
    regressions          one-line behaviour breaks as patch files (packages/verify/bench/patches/*.diff), never applied to committed source
                         applied only in scratch checkouts: Mole = detached git worktree at 70a2989 (mole-t22-bench), Excalidraw = cp -cR copy (excalidraw-T22)
    truth                the repo's own runner, full suite with the patch: failing = fails in the full run, fails again on a rerun of its file with
                         the patch, did not fail in the unpatched full run, PASSES on a rerun of its file without the patch (3 flake filters)
                         why the last filter: the first key draft counted Mole's langgraph-export CLI test (5 s timeout) as m05's failing test;
                         under the load of a parallel Excalidraw run it timed out with and without the patch
    reach (denominator)  test cases run by `vitest related <edited files>` with the patch (vite's module graph), + Mole's dist/*.js twin of each
                         edited src file (cross-package imports resolve to dist). Independent of @mole/indexer. Blind to spawned CLIs: a selection
                         may run tests outside reach; they count in the numerator anyway
    share                mean over the 10 regressions of (tests the selection ran / reach.tests); stricter than the aggregate, which Excalidraw's
                         ~2.5k-test reach would dominate; the aggregate is reported too
    caught               a test the selection ran fails AND the key lists it (file + full name); a selected test failing for another reason
                         does not count
    validity             a patch with no failing test is not a regression the suite can see: listed under `replaced` in the key, never scored.
                         Freeze rule fixed before scoring: first 5 valid Mole ids + first 5 valid Excalidraw ids in id order (make-key --freeze)
    candidates           written in three waves (m01-m06 + x01-x06, then m07-m10 + x07-x08, then m11-m13) as each wave's invalid ones showed
                         up. Mole's suite is mostly CLI/integration, so several plausible Mole breaks (diff header off-by-one, layout row
                         heuristics, dry-run test detection, impact depth, question ranking) fail no test at all. Waves 2-3 were picked by
                         reading which behaviour a test asserts (needed for validity): a bias toward unit-tested code, disclosed here.
                         Before the freeze a draft selector existed (scratch impl/graph.ts 05:27, graph-mole.sqlite 05:48) and ran on bench
                         patches: m05-m08 to debug the runner AND x02-x08 (try.mjs 06:21, try-x.log 06:24); its m12 miss drove the
                         nearest-per-branch policy, so the frozen set is NOT held out from tuning (corrected after review-1 P2-1; the
                         earlier line said "m05-m08" only). No patch file changed after 05:48 (patch mtimes 05:20-05:48) and the freeze
                         rule is mechanical, so the truth is not selector-made; the reviewer's blind regressions (2/2 caught) are the
                         held-out evidence. m05's truth changed only through the flake filter above
    run all / run none   run all = the key's full-suite run (catches every valid regression by construction; share = fullSuiteTests/reach);
                         run none = 0 tests, 0 caught. Not re-run by the bench (minutes of Excalidraw suite per regression)

selection design
    seeds                edited symbol = innermost declaration with the indexer's id (function/method/class) holding a changed new-side line;
                         an edited constant/type -> the functions in its file that mention it; an edit outside any symbol -> test files that import the file
    graph                @mole/indexer TsIndexer over the WHOLE repo (srcDir '.', tests included); tsconfig = the root one when it has
                         compilerOptions, else generated with npm-workspace `paths` to packages/*/src (Mole's root tsconfig is solution-style
                         and cross-package imports would otherwise end in dist .d.ts, outside the graph). Cached in SQLite, reused while meta
                         commit == HEAD (uncommitted edits do not re-index: 1-line changes rarely change call edges)
    nearest-first        reverse `calls` BFS per edited symbol, depth <= 8; only the hits at that symbol's MINIMUM depth are selected (the
                         budget lever: deeper callers are integration paths the direct tests already cover)
    call line -> test    the call edge's evidence line in a test file maps to the innermost it()/test() holding it; inside a describe but no test
                         (beforeEach, helper arrow) -> every test of that describe; module level -> the whole file. Calls inside a top-level helper
                         function of a test file are followed to the helper's call sites instead
    fix lineage          T12 check() pastFixes[].tests: names -> tests with that title (else a describe with that name); via 'symbol' (word match)
                         -> only tests whose body mentions an edited symbol; a guard file naming nothing runnable is reported, not run
    runner               vitest by `file:line` (location filter, vitest >= 3), --root + the repo's own config (or a generated minimal one, so a
                         parent folder's config is never picked up), JSON reporter; the selection counts what vitest actually ran
    no test reaches      prints "no test reaches this change", the nearest guarding test (a past fix's guard file, else a test that mentions the
                         edited symbol, else the test file sharing the longest folder prefix), exit 0
    exit codes           `mole check --run-tests`: 1 when a selected test fails or the runner errors, else 0 (plain `mole check` unchanged)
    build                the CLI does not build; Mole's cross-package tests read dist, so run `npm run build` first (the bench builds the scratch
                         checkout after applying each patch)

process notes
    stop hook            not changed (optional in the contract; a test run inside the Stop hook would add seconds to every stop)
    load sensitivity     Mole's CLI tests have 5 s timeouts; truth runs and npm run check under parallel load show timeout failures. The key
                         maker filters them; a check round that fails only on such a timeout is logged as-is (R4) and rerun as a new line
```

```notes
results (round 2, 2dfd1d3)
    M14                  caught 10/10 · mean share 18.4% of reaching tests (aggregate 1.3%, 162/12159) · run all 10/10 at 1347.5% · run none 0/10
                         target >= 9/10 at <= 33.3%: MET. Worst rows: m11 3/3 (100%: reach is core.test.ts only, the selection also runs the
                         two indexer tests that call missingEvidence), m12 26/67 (38.8%: per-branch nearest pulls in the questions tests)
    round 1              same M14, exit 1 only from the pre-existing langgraph-export CLI test (5 s timeout under load average ~50);
                         rerun = round 2, all 186 tests pass
    policy change        nearest-only (one depth per symbol) missed m12 in a scratch trial: the failing test calls symbolsOfText through
                         symbolsInFile (depth 2) while since.test.ts calls it directly (depth 1). Nearest per caller BRANCH fixed it
    runner change        vitest `file:line` failed whole files on it.each rows (vitest places them on another line): selection now runs the
                         selected files with --testNamePattern built from the full names (placeholders -> .*)
known gaps
    static only          tests reaching code through a spawned CLI or JSX rendering are invisible to the call graph (x05 chunk and several
                         invalid Mole candidates had no static path); the fix-lineage half covers some of these (m13 was caught via 9e19c51)
    stale graph          the SQLite graph is reused while HEAD is unchanged; uncommitted edits that add new calls are not seen until a commit
    details file         m14-details.json shows status undefined for it.each templates (display lookup by exact name); the metric counts
                         vitest's own outcomes, so it is unaffected; the bench is frozen (R2), so this stays
```

```notes
review-1 fixes (round 3)
    P1-1 fixed           the vitest name filter is built from the test's title ARRAY (testMap now keeps titles unjoined; runner outcomes keep
                         ancestorTitles + title), each title regex-escaped and joined by a space; a title like 'ranks a > b' is no longer
                         split. Outcome matching (sameTest) compares title arrays. Red first: test/review-1.test.ts (3e62e1c, new file;
                         the red commit's tests untouched) with the reviewer's fixture failed 3/3, then passed
    not run = error      a selected test with no passed/failed outcome is RunResult.notRun, printed "✗ NOT RUN", counted in the header
                         ("N selected not run (error)") and makes `mole check --run-tests` exit 1. Assumption: a selected test that
                         vitest skips on purpose (it.skip, describe.skipIf true) is also reported NOT RUN + exit 1 (the filter cannot tell
                         a deliberate skip from a filter miss; vitest reports both as skipped). In Mole only indexer's fixture-repo
                         describe.skipIf could hit this, and only when tsconfig.build.json is missing
    Mole check           the reviewer's parseDiff edit (newLn = c) via --diff: 27 selected, 27 "✓ pass" incl. questions.test.ts:169
                         'ranks past fix > note > guard-test, …' (was 26 run + "- skip")
    P2-3 fixed (half)    nearest guarding test: past-fix guard file, then the test file importing an edited file in the fewest import
                         hops (graph `imports` edges), then name mention, then path prefix. NOT done: a no-source-hunk change (README
                         only / clean worktree) still says "no test reaches this change" rather than "no code change" (noted, cheap later)
    P2-2 noted           M14 mean share 18.4% is carried by Excalidraw (reach 2256-2470 of 2632 tests via barrel imports, shares 0.2-3.2%);
                         Mole's 5 rows alone: 3.5%, 3.0%, 33.3%, 100%, 38.8% -> mean 35.7%, above the 1/3 line. The bench is frozen (R2)
                         so its decision is unchanged; run-check.sh now appends "per repo mean share: mole X, excalidraw Y" (from
                         m14-details.json) to the runs.jsonl M14 string
    P2-4 noted           daemon package.json/tsconfig.json + root tsconfig.json one-line references are outside the listed boundary;
                         required scaffolding for a new package (brief §7), left as is for the coordinator to accept
```

```notes
results (round 3, ff21589)
    M14                  caught 10/10 · mean share 18.5% (aggregate 1.3%, 163/12159) · MET. m12 now 27/67 (40.3%, was 26/67): the
                         ' > ' test that used to be skipped now runs. Per repo mean share: mole 36.0% (above 1/3), excalidraw 1.1%
    npm run check        189 passed (189) incl. the 3 new review-1 tests; exit 0
```

```notes
review-2 fixes (round 4, 2026-10-29 09:25-09:45, last fix round)
    red first            packages/verify/test/review-2.test.ts (c7b74b5, new file; older tests untouched, R2): 5 failed, then 5 passed
    P1-A fixed           the test map reads skip modifiers from the AST: .skip/.todo on the test or any enclosing describe = static skip;
                         .skipIf/.runIf, or a `.skip(` call in a test body taking a context arg = run-time skip. A selected test with
                         no pass/fail outcome is RunResult.skippedByFile ("- skipped by the test file (.skip|todo|skipIf/runIf)",
                         header ", N skipped by the test file", exit unaffected) when it is a static skip, or a run-time skip the
                         runner reported skipped; everything else stays notRun = error, exit 1 (ghost test still errors)
    assumption           a static .skip/.todo needs no matching outcome: a describe built by a helper called from another describe
                         (Excalidraw frame.test.tsx commonTestCases) gets runner names the static map cannot know; such a test can
                         never run, and a file that fails to load still reports a failed outcome (exit 1)
    P1-A repro           Excalidraw copy, no-op refactor of normalizeElementOrder (sortElements.ts:118): before "0 failed, 14 passed,
                         2 selected not run (error)", exit 1; after "0 failed, 14 passed, 2 skipped by the test file", exit 0
    P2-A fixed           a test with a non-literal title (it(name), it('a' + b)) marks its file "whole": that file runs in a second
                         vitest call without --testNamePattern; the non-literal title matches any runner title at its position.
                         Cost: the whole file runs, and an unrelated failing test in it fails the run
    P2-D fixed           an edit outside any test in a test file: named helpers (function decl / const f = () =>) holding the line,
                         closed over helpers mentioning them; lines mentioning one name their tests (testsAtLine); none -> innermost
                         describe or whole file. Excalidraw frame.test.tsx:53 (inside resizeFrameOverElement): 22 selected, 14 passed,
                         8 skipped by the test file, exit 0 (was "no test reaches", nearest = another file). Over-selects through
                         a shared helper (commonTestCases mentions the type `typeof resizeFrameOverElement`)
    P2-B fixed           no hunk in a code file and no test selected -> "no code change to test (changed: …; none is code)", exit 0,
                         no nearest test
    P2-C noted           per-row shares unchanged from review-2 (bench frozen, R2); see results round 3
```
