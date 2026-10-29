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
                         Before the freeze I ran the draft selector (scratch copy, not committed) on m05-m08 to debug the runner; no patch
                         was changed after that, and m05's truth changed only through the flake filter above
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
