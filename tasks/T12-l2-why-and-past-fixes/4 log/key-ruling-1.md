```notes
T12 key ruling 1 (loop rule R2; fresh reviewer reviewer-T12-k1; 2026-10-28)

ruling                  APPROVE the key change in key-changes.md 2026-10-28, with the edit below (not the "base HEAD~1" variant)
    why                 goal: "past fix commits that LAST wrote those lines (git blame on the parent, -U0 hunks)". In red item
                        'dw1 worktree + diff-file modes' the working-tree base is HEAD = 'feat: default', which rewrote line 3
                        (x ?? '' -> x ?? 'd'). Blame at the base names feat, not the fix, so "no past fixes on these lines" is the
                        specified answer. The miss is the accepted undercount in past-fix-overlap.json limits ("later non-fix
                        rewrites hide older fixes"). The implementation is right; the red expectation is wrong.
    rejected variant    "base HEAD~1" alone: worktree mode has no base option (always HEAD), so it cannot fix the worktree
                        assertion; and a diff taken against HEAD (old side x ?? 'd') checked against HEAD~1 (x ?? '') is an
                        incoherent pair. It passes only because blame goes by line number.

evidence (temp repo = dw1 scenario: feat: loader -> fix (adds comment line 2, writes line 3) -> feat: default (rewrites line 3))
    git blame -s -L 3,3 HEAD -- src/load.ts         e4f1ad4b 3)   const v = x ?? 'd';        (feat: default)
    git blame -s -L 3,3 HEAD~1 -- src/load.ts       19b57fb9 3)   const v = x ?? '';         (the fix)
    git diff -U0 HEAD (line 3 regressed to x)       @@ -3 +3 @@  -  const v = x ?? 'd';  +  const v = x;
    mole check --worktree --root R                  base e4f1ad4bfe  "1 hunk: no past fixes on these lines"  exit 0
    mole check --diff wt.diff --base HEAD           base e4f1ad4bfe  "1 hunk: no past fixes on these lines"  exit 0
    mole check HEAD (= feat, base = fix)            src/load.ts:3  19b57fb fix: loader crashed on null input
                                                    source: 19b57fb9… src/load.ts:3  exit 0
    same repo, git checkout -q <fix>, regress L3:   --worktree and --diff F --base HEAD both name 19b57fb, source src/load.ts:3
    unedited bench (worktree, HEAD 7a83987)         node packages/history/dist/bench/m2.js -> EXIT 1
                                                    "C contract 6/7; failed: dw1 worktree + diff-file modes"
    bench with the allowed edit (scratch copy)      EXIT 0: M2 R1-R5 5/5, R6 1; B3 pass; B2 21/21; C contract 7/7;
                                                    M5 p95 427 ms over 53 changes; model calls 0; "bench: all targets met"
    draft tests verbatim (scratch copy, vitest)     9 passed, 1 failed: 'diff-file mode against a base, and working-tree mode,
                                                    find the same fix' -> "expected [] to include '<fix sha>'" (worktree assertion)
    not run                                         the edited draft under vitest: the Hermes test-edit guard blocked writing
                                                    test files even in scratch; the edited calls are the same check() worktree +
                                                    diff base HEAD calls the edited bench item passes

allowed edits (exactly these; nothing else in the key or the draft)
    packages/history/bench/m2.ts, item 'dw1 worktree + diff-file modes'
        1) first line inside the item body, before write(root, 'src/load.ts', …):
               git(root, 'checkout', '-q', fix);
        2) after the `if (dc.status !== 0 || …) return \`cli --diff: …\`;` line, before the final return:
               git(root, 'checkout', '-q', 'main');
        all assertions, base 'HEAD' and the regression text stay unchanged
    proposed-tests/history.test.ts.txt, test 'diff-file mode against a base, and working-tree mode, find the same fix'
        1) after `const { root, fix } = fixtureRepo();` insert:
               git(root, 'checkout', '-q', fix);
        2) `check(root, { diffFile, base: 'HEAD~1' })` -> `check(root, { diffFile, base: 'HEAD' })`
           (after the checkout HEAD~1 is 'feat: loader', which is not a fix)
    the header comment line "copy it into place unchanged" may say "with key-ruling-1 edits"

other draft tests      match the contract; copy verbatim into packages/history/test/history.test.ts
                       (sha mode, text output, fix rule option + .mole/config.json, .mole note, CLI text/--json/--fix-rule,
                       brand-new lines, no fix commits + --worktree, root commit, B3 planted regression: all 9 pass as written)
bench/modes.ts         may stay as an extra check; it does not replace the edited red item
```
