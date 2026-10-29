# T27 key / red-test change requests (R2: the builder does not edit these; each needs a ruling)

## 1 · 2026-10-29 · packages/decisions/test/rules-check.test.ts › "`mole rules --emit` writes … dependency-cruiser itself finds the violation with it"

- status: RULED key-ruling-1.md #1 APPROVE with a different edit (baseDir: realpathSync(root), not preserveSymlinks); applied exactly in 867774d
- reason: the test cruises the fixture with only `ruleSet: { forbidden: cfg.forbidden }`, dropping the emitted `options`
  (which carry `preserveSymlinks: true`). The fixture root comes from os.tmpdir() = /var/folders/… and on macOS /var is a
  symlink to /private/var. Without preserveSymlinks, dependency-cruiser realpaths every resolved import, so
  src/ui/view.ts -> ../db/query.js resolves to `../../../../../../private/var/folders/…/src/db/query.ts` (relative to the
  non-real baseDir) and no repo-relative rule (`^src/db/`) can match it. Only the unresolved `lodash/fp` (D002) is found.
  Not a defect of the emitted rules: with the emitted options, or with baseDir = realpath(root), dependency-cruiser finds
  view.ts -> src/db/query.ts under mole-D001-1. `mole rules` itself passes preserveSymlinks (checkRules tests pass).
- repro (2026-10-29, worktree at the T27 impl commit):
  T=$(mktemp -d /var/folders/…/T/t27probe.XXXX); copy a fixture with src/ui/view.ts importing '../db/query.js';
  cruise(['src'], {baseDir: T, tsPreCompilationDeps: true, validate: true, ruleSet: {forbidden:[{name:'x',severity:'error',
  from:{path:'^src/ui/'},to:{path:'^src/db/'}}]}})  -> violations [] , view deps ["../../../../../../private/var/…/src/db/query.ts"]
  same with preserveSymlinks: true -> ["src/ui/lazy.ts->src/db/query.ts","src/ui/view.ts->src/db/query.ts"]
  same with baseDir: realpath(T), preserveSymlinks false -> both violations found
- requested edit (does not loosen the check: the same violation must still be found by dependency-cruiser alone):
  in that test's `cruise(...)` options add `preserveSymlinks: true` (the value the emitted config's `options` carries),
  e.g. `{ baseDir: root, validate: true, ruleSet: { forbidden: cfg.forbidden } as never, tsPreCompilationDeps: true, preserveSymlinks: true }`.
  Alternative with the same effect: `baseDir: realpathSync(root)`.

## 2 · 2026-10-29 · packages/decisions/bench/m19.ts › exportTree crashes on the Excalidraw tree (bench bug, red commit 1c39a04)

- status: RULED key-ruling-1.md #2 APPROVE (this edit verbatim); applied exactly in 867774d, with a comment line citing the ruling
- reason: exportTree always passes the pathspec ':(glob)apps/*/src/**'. Excalidraw has no apps/ folder, and `git archive`
  fails on a pathspec that matches nothing, so the bench exits 2 after the Mole base tree, before any planted run.
- repro: `node packages/decisions/dist/bench/m19.js` ->
  `fatal: pathspec ':(glob)apps/*/src/**' did not match any files` · `Error: Command failed: git -C …/excalidraw archive
  --format=tar e7b534668a60… -- :(glob)packages/*/src/** :(glob)apps/*/src/**` · exit 2
- requested edit (changes no expectation, no target, no tree): pass the apps pathspec only when the tree has an apps/ folder:
  `':(glob)packages/*/src/**', ...(execFileSync('git', ['-C', gitDir, 'ls-tree', '-d', '--name-only', sha, 'apps'], { encoding: 'utf8' }).trim() ? [':(glob)apps/*/src/**'] : [])`
- evidence the edit is enough: the same edit applied to an UNCOMMITTED copy (dist/bench/m19-dev.js, deleted after) gives
  `M19: caught 10/10 citing decision, false positives 0 on 13 changes (planted extras 0, controls 0, c4 violations 0, base 0, network calls 0, 7131 ms)`

## 3 · 2026-10-29 · packages/decisions/bench/m19-key.json › P05's record id 0016 collides with T29's M21 bench (key bug)

- status: RULED key-ruling-1.md #3 APPROVE; applied exactly in 867774d (key P05 decision + ruleAt, test name list + title label, record renamed 0017)
- reason: M21 (T29, packages/decisions/bench/m21.ts) copies Mole's LIVE .mole/decisions into its scenario repos, and its
  scenarios M07/M08 write their own record with id '0016' (0016-idle-five-minutes.md, 0016-extension-owns-idle-shutdown.md).
  T27's new record 0016-core-is-the-bottom-layer.md takes that id first (T29: duplicate id -> first file wins), so M21
  drops from 38/38 to 32/38 recall and misses its target. T27's key pins P05 to decision '0016' at
  `.mole/decisions/0016-core-is-the-bottom-layer.md:10`, so neither record can move without a key change.
- repro: worktree at 3e81be7: `node packages/decisions/dist/bench/m21.js` -> `M21: recall 84.2% (32/38) … target missed`;
  with 0016-core-is-the-bottom-layer.md moved out of .mole/decisions: `M21: recall 100% (38/38), false flags 0% (0/38)`.
  (A first version of 0016 with `scope: packages/core/src/` also raised M21 false flags to 25.6%, because M21's corpus
  snapshot has no packages/core: scope was dropped from 0016; the rule's from: is what it covers.)
- requested edit: P05.expect.decision '0016' -> '0017' and P05.expect.ruleAt
  `.mole/decisions/0016-core-is-the-bottom-layer.md:10` -> `.mole/decisions/0017-core-is-the-bottom-layer.md:10`
  (the record is renamed to 0017 with id '0017'; its rule item stays on line 10). The red test in rules-check.test.ts
  asserts `mole-0016-1` is among Mole's rule names: same rename -> `mole-0017-1`.
- note for T29 (not T27's file): M21 reads the live records and reserves the next free id, so the next real record 0016
  will break M21 the same way; T29's key could use an id no real record will take.
