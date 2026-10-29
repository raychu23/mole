# T22 review 2 (reviewer-T22-r2, fresh session, 2026-10-29)

```notes
verdict                 changes-needed: 1 P1 that the fix round introduced (a selected it.skip / it.todo test is now "✗ NOT RUN"
                        → exit 1, so a harmless edit fails the hand-back gate; reproduced on real Excalidraw).
                        Review-1 P1-1 itself is fixed. M14 reproduced: 10/10, mean 18.5%, MET
reviewed                base 70a2989 · red ca5fea4 · review-1 0f9d940 · fix-round red 3e62e1c (07:36:17) · fix ff21589 (07:39:46)
                        · runs e155f12
read order              review-1, then fix-round tests (3e62e1c), R2 on ca5fea4's paths, then `git diff 0f9d940..HEAD`, then runs
```

## Review-1 findings: fixed?

```notes
P1-1 " > " in titles    FIXED. Rerun of review-1's repro (copy of its fixture, ~/.hermes/cache/scratch/reviewer-T22-r2/fx):
                        break add → "1 test selected … vitest: 1 failed, 0 passed" / "✗ FAIL test/m.test.ts:3 ranks a > b" / exit 1
                        Mole case C (review-1's C.diff on a copy of its 70a2989 clone): "27 tests selected … 0 failed, 27 passed",
                        questions.test.ts:169 'ranks past fix > note > guard-test …' now "✓ pass" (was "- skip", 26 run)
                        selected-but-not-run is now "✗ NOT RUN" + header count + exit 1 (verifyCli) — see new P1-A for its side effect
P2-1 key provenance     insights corrected (doc only); no code change needed
P2-2 Mole share         runs.jsonl line 3 now prints "per repo mean share: mole 36.0%, excalidraw 1.1%" beside the metric
P2-3 nearest test       PARTLY. Import-based nearest works: orphan lonely() edit → "nearest guarding test: test/m.test.ts (imports
                        src/m.ts, …)", exit 0. Not fixed: README-only change still says "no test reaches this change" + "nearest
                        guarding test: test/a.test.ts (first test file in the repo …)" (P2-B)
P2-4 boundary           unchanged; fix round touches only packages/verify/src, packages/verify/test (new file) and tasks/T22
```

## Fix-round checks

```notes
order                   3e62e1c (new tests) 07:36:17 < ff21589 (fix) 07:39:46
red before fix          verified: put 3e62e1c's src/index.ts + src/testmap.ts back in the worktree, `npx vitest run
                        packages/verify/test/review-1.test.ts` → "Tests 3 failed (3)" (expected [] to … ArrayContaining;
                        nearest 'test/a.test.ts' to be 'test/m.test.ts'); restored HEAD files, `git status` clean
R2                      `git diff --stat ca5fea4..HEAD -- packages/verify/bench packages/verify/test "…/4 log/key.md"
                        packages/verify/package.json` → only the new file packages/verify/test/review-1.test.ts (+96). Key, bench,
                        patches and the red verify.test.ts untouched; no key ruling needed
small gap               the "not run" test checks the text, not the exit code; exit 1 for notRun is in verifyCli (seen in A2 below)
```

## Done-when

```notes
1 --run-tests selects   MET for selection + running (lineage + reverse-calls BFS, vitest with a title-array name filter).
  + runs (vitest)       Reporting is now wrong for skipped/todo tests: P1-A
2 M14                   MET as frozen. `node packages/verify/dist/bench/m14.js` → "M14 caught 10/10 · ran 18.5% of reaching tests
                        (mean; aggregate 1.3%, 163/12159) · run all 10/10 at 1347.5% · run none 0/10 · target >= 9/10 at <= 33.3%
                        MET", model calls: 0. Rows: m06 3.5 · m07 3.0 · m08 33.3 · m11 100.0 · m12 40.3 · x02 3.2 · x03 0.2 ·
                        x04 0.4 · x06 0.9 · x07 0.4 (%)
  Mole-only 36.0%       REPORTING NOTE, not a contract miss. The contract says "10 planted regressions in Mole + Excalidraw →
                        catches >= 9 of 10 while running <= 1/3 of the tests that transitively reach the change": one pooled set
                        of 10, no per-repo target. The key's `definitions.share`, frozen at 11:57:35Z before the first impl
                        commit, defines it as the mean over the 10 frozen rows; mean 18.5% and aggregate 1.3% both pass. Caveats
                        worth stating beside the number (P2-C): read per change, 2 of 10 rows exceed 1/3 (m11 100%, m12 40.3%);
                        and the Excalidraw denominator (`vitest related` reach = 2256-2470 of 2632 tests) makes its rows easy
3 no test reaches       MET: says so, names a nearest test, exit 0 (orphan lonely(), orphan deep(), README-only all exit 0)
4 npm run check         one run: "Tests 1 failed | 188 passed (189)"; the failure = packages/agentstate/test/langgraph-export.test.ts
                        6238 ms timeout (untouched package, machine loaded). That file alone with --testTimeout=60000: 5 passed →
                        environment noise. packages/verify alone: "Tests 8 passed (8)". runs.jsonl line 3: pass 189/189
```

## Findings

```notes
P1-A  a selected it.skip / it.todo test counts as "✗ NOT RUN (error)" and the hand-back exits 1 on a correct change
      cause      runTests: notRun = selected tests with no outcome whose status !== 'skipped'; vitest reports it.skip/it.todo
                 as skipped/pending, so every source-skipped test that is selected (by call graph or past-fix lineage) is an
                 error; verifyCli returns 1 when notRun.length
      repro 1    real Excalidraw (cp -cR of excalidraw-T22 at e7b5346, ~/.hermes/cache/scratch/reviewer-T22-r2/exc), no-op
                 refactor of normalizeElementOrder in packages/element/src/sortElements.ts:118
                 (`return f(x)` → `const out = f(x); return out;`), then
                 node packages/daemon/dist/cli.js check --worktree --run-tests --root <exc>
      observed   "16 tests selected … vitest: 0 failed, 14 passed, 2 selected not run (error)" /
                 "✗ NOT RUN packages/element/tests/sortElements.test.ts:385 … normalize boundElements array [guards past fix
                 3f5fdec …]" (+ :413 perf) / exit 1. `npx vitest run packages/element/tests/sortElements.test.ts` →
                 "Tests 2 passed | 2 skipped (4)", vitest exit 0
      repro 2    fixture fx2: test/skip.test.ts with it.skip('mul skipped') + it.todo + it('mul live'); harmless mul edit
                 (a * b → b * a) → "0 failed, 1 passed, 1 selected not run (error)", "✗ NOT RUN test/skip.test.ts:3 mul
                 skipped", exit 1; full vitest "7 passed | 1 skipped | 1 todo"
      why P1     the gate fails a correct change; Excalidraw has it.skip/it.todo in 10 test files, so this fires on real
                 edits. Introduced by the fix round (before it, the same tests showed "- skip" with exit 0)
      fix idea   do not select tests the test map knows are .skip/.todo (or report them as "skipped in source", not an error);
                 keep the error for tests that should have run but did not

P2-A  a non-literal test title is selected but cannot be matched → "✗ NOT RUN" + exit 1
      repro      fixture fx2: it('concat ' + 'title', …) calling add; harmless add edit (a + b → b + a) →
                 "0 failed, 2 passed, 1 selected not run (error)", "✗ NOT RUN test/each.test.ts:6 'concat ' + 'title'", exit 1;
                 full vitest "4 passed (4)". Real case exists: Excalidraw fractionalIndex.test.ts:832 `it(name, …)` (not hit by
                 my one edit there: 62 selected, 0 not run, exit 0)
      note       here an error is defensible (a selected test really did not run), but it is a false fail on a correct change;
                 the test map could fall back to a file-level run for titles it cannot read

P2-B  a change with no code hunk still says "no test reaches this change" and names an unrelated nearest test (review-1 P2-3
      second half, not fixed)
      repro      fx: `echo hi > README.md` → "no test reaches this change … nearest guarding test: test/a.test.ts (first test
                 file in the repo …)", exit 0

P2-C  report the per-row shares with the metric: m11 100% and m12 40.3% each exceed 1/3; Mole mean 36.0% vs pooled 18.5%
      repro      `node packages/verify/dist/bench/m14.js` row lines (above)

P2-D  editing a helper function inside a test file reaches no test, and the nearest test is another file
      repro      exc: frame.test.tsx:53 inside resizeFrameOverElement, append a comment → "no test reaches this change …
                 nearest guarding test: packages/element/tests/align.test.tsx (closest test file by path)", exit 0; the
                 edited file's own tests (27 passed | 30 skipped) are the obvious guard
```

## Adversarial tries (outside the examples the fix was tuned on)

```notes
fx2 fixture (~/.hermes/cache/scratch/reviewer-T22-r2/fx2; CLI from this worktree)
    A1 break add; it.each title "sum (%i + %i) > [ok]$ %i", template `tmpl ${tag} adds` with tag 'x > y', and
       describe.each('group %s') over 'p > q'     → it.each ✗ FAIL ×2, template ✗ FAIL, b.test (depth 2) ✗ FAIL, exit 1:
                                                    regex specials, placeholders and " > " in each-args all handled
    A4 describe.each('group %s') over 'p > q' + literal it, harmless edit → ✓ pass (matched); concat title → NOT RUN (P2-A)
    A2 harmless edit reaching it.skip / it.todo   → NOT RUN, exit 1 (P1-A)
    A3 orphan deep() in m.ts                      → "nearest guarding test: test/each.test.ts (imports src/m.ts …)", exit 0
real Excalidraw (copy at e7b5346)
    A5 harmless type tweak in validateFractionalIndices → 62 selected, 70 passed, 0 not run, exit 0 (40 s incl. graph build)
    A7 no-op refactor of normalizeElementOrder    → exit 1 from 2 it.skip guards (P1-A)
    A6 comment in a test-file helper              → "no test reaches", nearest = another file (P2-D)
noise                                             npm run check's only failure = langgraph-export 5 s timeout under load (not T22)
```
