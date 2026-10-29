# T22 review 3 (reviewer-T22-r3, fresh confirmation, 2026-10-29)

```notes
verdict                 verified: no P0/P1. Review-2 P1-A is fixed and reproduced fixed on real Excalidraw; real breaks still exit 1;
                        a selected test the runner never reports still exits 1. 2 P2s below (both predate this round, both fail loud)
reviewed                review-2 4810ae7 · red c7b74b5 (09:26:48) · fixes 92270ee (09:28:30), f067661 (09:30:16) · insights f6c0c66
                        · runs bb095b1. Diff read: `git diff 4810ae7..bb095b1` (packages/verify/src/index.ts, testmap.ts, new
                        test/review-2.test.ts, task docs)
scope                   confirmation only (not a full review); systems/ledger not run
```

## Checks

```notes
red before fix          `git worktree add --detach ~/.hermes/cache/scratch/reviewer-T22-r3 c7b74b5` (node_modules symlinked),
                        `npx vitest run packages/verify/test/review-2.test.ts` → "Tests 5 failed (5)" (P1-A ×2: notRun
                        ['mul skipped', …] ≠ []; P2-A notRun ≠ []; P2-D noTestReaches true; P2-B "no test reach…"). Scratch
                        worktree removed
green at HEAD           `npm run build` exit 0; `npx vitest run packages/verify` → "Tests 13 passed (13)"; `npm run check` exit 0,
                        "Test Files 31 passed (31) · Tests 194 passed (194)" (matches runs.jsonl round 4)
R2                      `git diff ca5fea4..HEAD -- packages/verify/bench packages/verify/test/verify.test.ts` → empty
```

## Review-2 P1-A rerun (real Excalidraw, ~/.hermes/cache/scratch/mole-builder-5/excalidraw-T22 at e7b5346)

```notes
no-op refactor          sortElements.ts:118 `return f(x)` → `const out = f(x); return out;`, then
                        node <worktree>/packages/daemon/dist/cli.js check --worktree --run-tests --root <exc>
                        → "16 tests selected … vitest: 0 failed, 14 passed, 2 skipped by the test file (5.8 s)", sortElements
                        .test.ts:385 and :413 shown "- skipped by the test file (.skip)", EXIT 0 (review-2: exit 1, "✗ NOT RUN")
real break              same line → `[...f(x)].reverse()` → "6 failed, 8 passed, 2 skipped by the test file", ✗ FAIL at
                        sortElements.test.ts:19, :159, duplicate.test.tsx:160/293/388, onDuplicate.test.tsx:741, EXIT 1
P2-D real case          comment on frame.test.tsx:53 (helper) → "22 tests selected … 0 failed, 14 passed, 8 skipped by the test
                        file", EXIT 0
revert                  `git -C <exc> checkout -- .` after each; `git status --short` → only the pre-existing `?? .mole/`
```

## Name-filter / not-run still an error (own fixture ~/.hermes/cache/scratch/reviewer-T22-r3-fx)

```notes
fixture                 src/m.ts mul; test/m.test.ts: it('mul live'), it.skip('mul skipped'), and describes built inside helper
                        functions called from another describe (group('inner ' + 'x') → 'label > mul in helper describe';
                        g2() → describe('lit') → 'mul lit', run by vitest as 'outer2 > lit > mul lit')
harmless mul edit       → "2 tests selected … 0 failed, 1 passed, 1 skipped by the test file", .skip shown skipped, EXIT 0
edit in a test whose    test/m.test.ts:5 (non-literal describe title) → "0 failed, 2 passed, 1 selected not run (error)",
  outcome is not          "✗ NOT RUN test/m.test.ts:5 label > mul in helper describe", EXIT 1 → the not-run error survives the
  matched                 skip carve-out (only tests the file marks .skip/.todo/skipIf/runIf/ctx.skip leave notRun)
```

## Findings

```notes
P1-A (review-2)  FIXED (repro above: exit 1 → exit 0, skipped tests shown as skipped; real failure still exit 1)

P2-E  a literal-titled test inside a helper-built describe is reported "✗ NOT RUN" (exit 1) although it ran and passed
      repro      fixture above, edit inside g2()'s it('mul lit') (line 10) → "0 failed, 1 passed, 1 selected not run
                 (error)", "✗ NOT RUN test/m.test.ts:10 lit > mul lit", EXIT 1; `npx vitest run` → "3 passed | 1 skipped (4)".
                 The name filter matches ("… lit mul lit$"), the test passes, but sameTest requires equal title-array length
                 (static ['lit','mul lit'] vs runner ['outer2','lit','mul lit'])
      why P2     fails loud (no silent pass), predates this round (sameTest's length check is from the review-1 fix), and
                 the real Excalidraw helper-describe case (frame.test.tsx) exits 0 because those renamed tests are .skip.
      fix idea   when the static titles are a suffix of the runner's titles in the same file, count it as a match
P2-F  the call graph does not select tests inside helper-built describes (recall)
      repro      same fixture, harmless mul edit selects 2 of the 3 tests calling mul; 'label > mul in helper describe' (line 5)
                 is in testMap but not selected (the call sits in function group, reached only from a describe body)
      why P2     pre-existing selection limit, not touched by this round; M14 measured with it
note             a .skip/.todo test counts as "skipped by the test file" even when the runner reports nothing for it
                 (index.ts runTests); acceptable, it can never run
```
