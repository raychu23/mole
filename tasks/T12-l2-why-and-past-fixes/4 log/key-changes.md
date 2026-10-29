```notes
T12 key changes (loop rule R2: proposed, NOT applied; reviewer adjudicates)

2026-10-28  bench/m2.ts contract item 'dw1 worktree + diff-file modes' (red commit 8297d8a) expects the wrong commit
    what        the temp repo is base -> fix (writes line 3) -> feat (rewrites line 3 to x ?? 'd'); the item then reverts line 3
                in the working tree and expects check({worktree}) / check({diffFile, base: 'HEAD'}) / CLI --diff to name the fix
    why wrong   base-side line 3 at HEAD was last written by 'feat: default', not the fix; the contract is "the past fix commits that
                LAST wrote those lines" (blame on the parent), so 'no past fixes' is the specified answer. git blame -L 3,3 HEAD shows feat.
    evidence    $TMPDIR repro 2026-10-28 21:27: same repo, `mole check --worktree` and `--diff F --base HEAD` print
                'no past fixes on these lines'; `mole check HEAD` (the feat commit, base = fix) names the fix with source src/load.ts:3
    effect      `node packages/history/dist/bench/m2.js` exits 1 with only this item failing (C contract 6/7); every scored target
                (M2, R6, B3, B2, M5, model calls) is met
    proposal    in that item, check the regression against the fix commit: base 'HEAD~1' for the diff file, or revert line 3 before the
                feat commit. Added instead of editing: bench/modes.ts (`node packages/history/dist/bench/modes.js`), the same three
                entry points on a regression of a line the fix really last wrote: passes
    same bug    tasks/T12-l2-why-and-past-fixes/proposed-tests/history.test.ts.txt, test 'diff-file mode against a base, and
                working-tree mode, find the same fix': its worktree assertion has the same wrong expectation (its diff-file
                assertion uses base HEAD~1 and is right). Fix the same way before copying the draft into packages/history/test/.
```
