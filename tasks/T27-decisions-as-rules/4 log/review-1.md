```notes
core      T27 review 1 · fresh reviewer (hermes subagent, claude-opus-5-5) · 2026-10-29 · diff fb240ab...867774d, judged against 0 start.md + 2 insights.md §0
    verdict                 changes needed      1 P1 (the emitted dependency-cruiser config is rejected by dependency-cruiser itself) + 6 P2
    passed                  M19 10/10 citing decision · 0 FP on 13 · npm run check 34 files / 241 tests · packages/decisions 60/60 · R1 R2 R6 hold → §1
    p1                      --emit writes a config the depcruise CLI refuses ("options must NOT have additional properties"), and once fixed it cruises 0 modules on `src` → §2
    p2                      dynamic+static of the same module · dead rules (typo / backslash / absolute from) · duplicate ids miscite · triple-slash dropped · method-name FPs · superseded not validated → §3
    new       10-29     first review
```

```notes
1 what holds (verified, real runs in the worktree at 867774d)
    R1 red first            1c39a04 06:58:53 (key "written" 11:54:37Z = 06:54 CDT, stubs throw) < 3e81be7 07:06:56 < 867774d 07:12:53
    R2 frozen files         git diff 1c39a04 HEAD -- m19-key.json m19.ts test/ = exactly the ruling's edits      #1 import + realpathSync(root) only (no preserveSymlinks) · #2 apps pathspec verbatim + 1 comment line · #3 P05 decision + ruleAt, test name list + title label
        record              0016 → 0017 rename + id, rule item still on line 10      also dropped scope: and reflowed source: (not in ruling #3's text, but the record is not a frozen file and key-changes #3 discloses it)
    key independence        expected file:line = after+1 by construction, decision + ruleAt from hand-written records in the same commit      bench never reads implementation output into the key
    dependency-cruiser      real: check.ts calls cruise() with the compiled forbidden rules      Mole's own TS pass only adds line numbers + type/dynamic filtering
    bench                   node packages/decisions/dist/bench/m19.js → "M19: caught 10/10 citing decision, false positives 0 on 13 changes (planted extras 0, controls 0, c4 violations 0, base 0, network calls 0, 5366 ms)" exit 0
        c4 not vacuous      for 0013 / 0017: 9e19c51 6a546ec touch cli.ts, ac8e02d 8664b8b bb3846f fd7ed34 touch core/src      0014 untested by c4 (agentstate does not exist in any of the 13 trees)
    tests                   npx vitest run packages/decisions → 6 files, 60 passed      npm run check → tsc -b ok, 34 files, 241 passed
    cli                     `rules --root .` → "3 rules (2 import, 1 call) from 3 decisions: 0 violations" exit 0 · --json exit 0 · syntax error → exit 2 with file:line · violations → exit 1
    Mole rules true         grep: cli.ts static imports = ./detect ./client node:* @mole/core + type-only @mole/memory @mole/history · agentstate/src: only openSync(file,'r') + readOnly db · core/src: no @mole/
    boundary                ok except 2 export lines in packages/decisions/src/index.ts and a typescript dep in package.json (both needed, outside the listed paths, P2-minor, no action beyond noting)
    breaks that held        re-export, export *, side-effect import, import = require, multi-line import (cited at the import line), inline `import { type Row }` skipped, CRLF record (error at the right line 9)
```

```notes
2 P1
    P1-1 --emit config is not a valid dependency-cruiser config
        what                .dependency-cruiser.mole.cjs puts `validate: true` in options      depcruise rejects the whole file      with validate removed, doNotFollow `^(?!<froms>)` also matches the start folder, so `depcruise -c … src` or `.` cruises 0 modules and prints a clean pass
        why vs contract     done-when 1 "→ generated .dependency-cruiser config" + insights §0 "generated config: mole rules --emit writes .dependency-cruiser.mole.cjs"      the artifact cannot be run by dependency-cruiser, or when patched gives a false all-clear on the natural entry
        why the test missed it   the --emit test only require()s cfg.forbidden and passes it to the cruise() API with its own options      the emitted `options` are never exercised
        reproducer          mkdir -p r/.mole/decisions r/src/ui r/src/db · src/db/query.ts `export const q = 1;` · src/ui/view.ts `import { q } from '../db/query.js'; export const v = q;`
                            record: rules: [{forbid: import, from: src/ui/, to: src/db/}]
                            node packages/daemon/dist/cli.js rules --root r --emit → exit 0
                            node_modules/.bin/depcruise --config r/.dependency-cruiser.mole.cjs --output-type err src   (cwd r)
        observed            "ERROR: The supplied configuration is not valid: data/options must NOT have additional properties." exit 1
                            validate line deleted: `depcruise -c gen.cjs src` → "no dependency violations found (0 modules, 0 dependencies cruised)" exit 0 · `… src/ui` → 7 violations exit 7
        fix                 drop validate from the emitted options (cruise() API-only)      emit doNotFollow without the `^(?!from)` part (keep node_modules|dist|.git|.mole), or put the from-prefixes in a header comment as the entry to pass      add a test that runs the depcruise CLI (or cruise() with cfg.options) on `src` with the emitted file and expects the violation
```

```notes
3 P2
    P2-1 static + dynamic import of the same module in one file: the dynamic site is lost
        what                dependency-cruiser merges both into 1 dependency {dynamic: false}      check.ts:176 then drops the dynamic site      a `dynamic: true` rule misses it entirely, an unset rule misses its line
        repro               src/ui/both.ts: `export const lazy = () => import('../db/query.js');` / `import { q } from '../db/query.js';` · rules: unset, dynamic: false, dynamic: true on src/ui/ → src/db/
        observed            only both.ts:2 for mole-F1-1 and -F1-2, nothing at :1, nothing for -F1-3      raw cruise: [{"module":"../db/query.js","dynamic":false,"types":["local","import"]}]
        fix                 match sites by spec only, then apply the rule's dynamic/types filter to each site (don't trust d.dynamic for merged deps)      test for it
    P2-2 dead rules pass silently (the inverse of the `exept` typo case insights guard against)
        what                a from: that matches no file, a backslash path, or an absolute path
        repro + observed    from: src/iu/ → "1 rule … 0 violations" exit 0 · from: 'src\ui\' to: 'src\db\' → 0 violations exit 0 · from: /src/ui/ → "mole: ENOENT: no such file or directory, stat '/src/ui'" exit 1 (= the violations code, no file:line)
        why                 insights §0 errors "never silently skipped", exit 2 with file:line for bad paths      a typo narrows the rule to nothing and reads as green
        fix                 error (exit 2, record file:line) on absolute / '..' / backslash paths      warn (or error) when a rule's from: matches 0 source files
    P2-3 duplicate record ids cite the wrong record
        repro               E5a.md id E5 import rule src/ui/ → src/db/ · E5b.md id E5 call rule callee nothingCalled
        observed            "src/ui/view.ts:1  call ../db/query.js  breaks E5 "second" … rule mole-E5-1 at .mole/decisions/E5b.md:6"      wrong kind, title and record (both rules named mole-E5-1, byName keeps the last)
        fix                 error at the second record's id line, or name rules by file
    P2-4 dependency-cruiser violations without a matching AST site are dropped
        repro               src/ui/tsl.ts `/// <reference path="../db/query.ts" />` under the src/ui/ → src/db/ rule
        observed            depcruise reports "mole-D001-1: src/ui/tsl.ts → src/db/query.ts"      `mole rules` reports nothing for tsl.ts
        fix                 when no site matches, report the violation at line 1 with the module text instead of discarding it
    P2-5 call scan FPs and FNs beyond the documented gaps
        observed            `cache.fetch('k')` on a local object → violation of a fetch rule (any method named fetch / writeFile)      missed: `w(p,'')` from `writeFileSync as w`, `fs['rmSync'](p)` (both documented), plus `[p].forEach(rmSync)` and `writeFileSync.call(null, …)` (not documented)
        why                 0014 claims "read-only" but its callee list also omits copyFileSync, cpSync, openSync(…,'w'), writeSync, rmdirSync, fs.promises.rm      fine for M19, worth stating in the record
        fix                 resolve the callee's import binding with the TS AST (follows `as` aliases and element access with a literal key)      at least list the gaps in 0014's why
    P2-6 superseded / deprecated / rejected records are skipped before validation
        repro               status: superseded with `- forbid: imprt` → "skipped E4 … record is superseded" exit 0
        why                 minor: the broken rule surfaces only on reinstatement      fix: validate, then skip
```

```notes
4 how checked
    commands                npm run build · npx vitest run packages/decisions · npm run check · node packages/decisions/dist/bench/m19.js · node packages/daemon/dist/cli.js rules --root . [--json]
    temp repos              ~/.hermes/cache/scratch/t27-review/r1 r2 r3 (fixtures above, depcruise 18.7.0 from the worktree's node_modules)
    not done                no code edits, commits or ledger commands      Windows proper not tested (macOS only): backslash rule paths checked instead
```
