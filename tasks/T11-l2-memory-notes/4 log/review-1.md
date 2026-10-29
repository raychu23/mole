```notes core
core                        T11 review round 1 · fresh reviewer (reviewer-T11-r1) · branch ledger/t11-l2-memory-notes @c2bedb8 vs base bdeff14
    verdict                 back to running: 1 P1 (deleted symbol reported moved* to an unrelated same-named symbol)      → §findings
    checks                  npm run check 74/74 pass · m1.js twice: recall 100% (136/136), false flags 0% (0/1151), ws/comment flagged 0, at_target true      → §fresh runs
    loop rules              R1 ok · R2 ok (diff empty) · R4 ok w disclosed hand edit · R6 ok · R7 no loosening found      → §rules
    key                     independent of src/ · 3 spot checks agree w git diff -w      → §key
    new                     10-28 first review
```

```notes
findings
    P1-1  deleted symbol → moved* (not orphaned) when 1 other file has the same tail
        contract            done-when 3: re-anchor by "qualifiedName tail + body hash" · deleted symbol → orphaned
        code                notes.ts locate(): `if (sameTail.length === 1) return { status: 'moved', ... changed: true }` re-anchors on tail alone, hash ignored
        repro               tmp repo: src/b.ts `export function parse(s: string) { return s.trim(); }` · src/c.ts `export function parse(s: string) { return s.split(','); }`
                            node packages/daemon/dist/cli.js note add src/b.ts#parse "parse b" --root <tmp>
                            printf 'export const z = 1;\n' > src/b.ts
                            node packages/daemon/dist/cli.js memory --root <tmp>
        observed            `moved*    src/b.ts#parse -> src/c.ts:1  parse b`      json status "moved", newPath "src/c.ts", changed true
        expected            orphaned (c.ts#parse is an unrelated function w a different body)
        impact              common names (parse, render, main, handler, run) send a deleted symbol's note to a random file      inconsistent: 2+ same-tail candidates → orphaned, exactly 1 → moved*
        why bench missed    m1.ts counts truth "gone" as ok when status is orphaned OR moved (key frozen, R2) · key has only 7 gone items
        fix idea            require hash match for cross-file re-anchor (as contract says), or only accept tail-only when the old file itself is gone and git reports a rename · add a test w an unrelated same-name symbol
    P2-1  overload signature edits never go stale
        repro               `export function over(a: string): string;` + 2nd overload + impl, note on src/a.ts#over, change 1st overload to `(a: string): number;`
        observed            fresh      expected stale (the public signature changed)
        cause               symbolsOfText keeps only the implementation node for duplicated tails, hash excludes overload signatures · key-builder drops duplicated tails so M1 never sees overloads
    P2-2  status "moved" carries body-changed info only in `changed`
        observed            moved + body edit → json status "moved", changed true · text CLI prints moved*
        risk                a consumer filtering status === "stale" misses moved-and-changed notes      document it or add status "moved-stale"
    P2-3  runs.jsonl red line "check" field hand-edited
        note                disclosed in 4 log/key-changes.md · edit happened before 1fcf0ce (first commit of runs.jsonl), git log shows no later rewrite · metrics fields untouched
    P2-4  all whitespace/comment-only evidence is synthetic
        observed            key: 12 wsComment items, all synthetic · 0 real-commit wsComment items across 12 mole + 15 excalidraw commits
        note                implementer declared it · real-commit ws/comment coverage would need commits picked for it in a future key
    P2-5  m1 "recall" counts unplaced notes as flagged
        note                red run printed recall 100% while 1294 notes were not placed · at_target still guarded by "notes not placed 0" · disclosed in key-changes.md · read recall w the detail field
fresh runs
    check                   `npm run check` → Test Files 9 passed, Tests 74 passed (74), load avg ~12-21
    bench                   `node packages/memory/dist/bench/m1.js` run 2x, both exit 0, identical: recall 100% (136/136), false flags 0% (0/1151), ws/comment-only flagged 0, gone 7/7, moved path 53/53, synthetic exact 280/280, notes not placed 0, scenarios 42/42
    cli by hand             tmp git repo under $TMPDIR
        whitespace-only     fresh ok
        comment-only        fresh ok (line + block comment, after move: moved, changed false)
        body edit           stale ok (in place) · moved* after a move + edit
        git mv              moved -> new path w line ok
        delete symbol       orphaned ok (Box.open) · file deleted → all orphaned ok · see P1-1 for same-name case
        malformed yaml      5 bad files (flow value, no front matter, unterminated quote, duplicate key, binary) → `invalid <file>:<line>: <msg>`, exit 0, good notes still listed
        same-named          src/a.ts#foo and src/a.ts#Box.foo stay distinct ok · overloads → P2-1
        nonexistent         `note add src/a.ts#nope` → "no symbol … (symbols in file: …)" exit 1 · missing file → "(file … not found)" · no text → usage exit 2
rules
    R1                      8a065c6 (21:24:56) holds bench + key (written 21:24:34) + red tests + stub index.ts + wiring · first impl da6279b 21:28:19
    R2                      `git diff 8a065c6 HEAD -- packages/memory/bench packages/memory/test` empty
    R4                      3 runs, 3 lines in runs.jsonl, appended by run-check.sh
    R6                      metrics computed by m1.ts from the key
    R7                      tests + key unchanged · round 2→3 changed only insights + runs.jsonl (CLI timeout passed on re-run, no timeout bump)
    boundary                ok: packages/memory/** new · cli.ts adds note/memory branches + usage line · core/schema.ts untouched · daemon package.json/tsconfig + root tsconfig + lockfile wiring
key
    independence            key-builder.ts imports only typescript + node · truth = line diff (`git diff -w --ignore-blank-lines -U0`) w comments + whitespace stripped, not the src/ token hash
    spot 1                  mole-8664b8b: formatNeighborhood changed (new siteFile line), createServer changed (description string) · matches git diff -w
    spot 2                  excalidraw-2559257: only textWysiwyg changed (listener options + moved call), 6 others unchanged · matches git diff -w
    spot 3                  excalidraw-c711e80: routeElbowArrow gone · `const routeElbowArrow` at 808d068:1437, absent at c711e80 · matches
    test coverage           memory.test.ts covers done-when 1 (api + cli), 2 (ws, comment, body, string ws), 3 (rename, cross-file move, delete symbol, delete file), 5 (5 malformed shapes) · 4 via m1.ts · 6 via npm run check
change log
    2026-10-28              round 1 review written
```
