```notes core
core                        T11 review round 2 · fresh reviewer (reviewer-T11-r2) · branch ledger/t11-l2-memory-notes @bff4ba9 (fix f86c708) vs round-1 c2bedb8
    verdict                 verified: no P0/P1 · round-1 P1-1 + P2-1 fixed, regression tests bite · 3 new P2      → §findings
    checks                  npm run check 77/77 pass (10 files) · m1.js: recall 100% (136/136), false flags 0% (0/1151), ws/comment flagged 0, at_target true      → §fresh runs
    loop rules              R2 ok (`git diff 8a065c6 HEAD -- packages/memory/bench packages/memory/test/memory.test.ts` empty) · new test file only added
    new                     10-28 round 2 review (last allowed round)
```

```notes
fix
    P1-1                    notes.ts locate(): dropped `sameTail.length === 1` name-only re-anchor · cross-file re-anchor now needs tail + hash, or last segment + hash + kind (unique) for a renamed container
    P2-1                    symbols.ts: hash of a duplicated tail = tokens of every declaration (overloads + impl) · startLine still the impl
    P2-2                    moot: every `moved` now has changed false (moved+edited → orphaned)
tests bite
    how                     tree clean so `git stash` was a no-op · instead `git checkout c2bedb8 -- packages/memory/src` + `npm run build`
    red                     `npx vitest run packages/memory/test/review-fixes.test.ts` → 2 failed | 1 passed (P1-1 orphaned → got moved, P2-1 → got fresh) · the passing one is the moved-same-body guard, expected green
    restored                `git checkout HEAD -- packages/memory/src` + build → 3/3 pass · `git status` clean
fresh runs
    check                   `npm run check` → Test Files 10 passed, Tests 77 passed (77)
    bench                   `node packages/memory/dist/bench/m1.js` → exit 0, recall 100% (136/136), false flags 0% (0/1151), ws/comment-only flagged 0, gone 7/7, moved path 53/53, synthetic exact 280/280, notes not placed 0, scenarios 42/42, at_target true
    runs.jsonl              last line f86c708, exit 0, same M1 values, check "pass: 77 passed (77)"
    cli by hand             tmp git repos under $TMPDIR, `node packages/daemon/dist/cli.js note add|memory [--json] --root <tmp>` (script: ~/.hermes/cache/scratch/t11r2.sh)
        P1-1 repro          round-1 b.ts/c.ts parse → orphaned ok
        git mv              src/a.ts → src/moved.ts → moved, changed false, line 1 ok
        class Foo→Bar       Foo.open, body same → moved (same file, line 2) ok · + git mv → moved -> src/bar.ts ok
        moved+edited        git mv + body edit → orphaned (note kept, listed) · matches contract "re-anchored by qualifiedName tail + body hash" · see P2-6
        overloads           reformat + comments on overload sigs → fresh ok · overload return type edited → stale ok · overload removed → stale ok · file moved → moved ok · class method overloads reformatted → fresh ok
        ws/comment          arrow const reformatted + comments → fresh ok
findings
    P2-6  moved + edited is now orphaned (was moved* in round 1)
        repro               `export function go(a: number) {\n  return a + 1;\n}` in src/a.ts · note add src/a.ts#go · git mv src/a.ts src/m.ts · edit `a + 1` → `a + 2` · memory → orphaned, newPath none
        note                within contract (tail + hash) and never dropped, but a user loses the "it went to src/m.ts" hint · a later round could use git rename detection to report moved+stale
    P2-7  ambiguous identical copies: first match wins silently
        repro               src/a.ts#p `return s.trim()` noted · p deleted from a.ts · identical p in src/x.ts and src/y.ts → moved -> src/x.ts
        note                the renamed-container branch requires a unique match (length === 1) but the same-tail branch takes `find()` · orphaned (or listing candidates) would be consistent
    P2-8  container-rename branch fires while the original container still exists
        repro               src/a.ts `class Foo { run(x: number) { return x; } }` · note on Foo.run · Foo.run removed (class Foo kept) · new src/q.ts `class Q { run(x: number) { return x; } }` → moved -> src/q.ts
        note                body is identical so the note's code is literally there · risk is trivial bodies (getters, `return this.x`) · could require the old container to be gone
    P2-3..5                 round-1 disclosure items unchanged (hand-edited red line check field, synthetic-only ws/comment evidence, recall counts unplaced notes) · still disclosed in key-changes.md
change log
    2026-10-28              round 2 review written · verdict verified
```
