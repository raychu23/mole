# T27 key ruling 1 (R2) · fresh reviewer · 2026-10-29

Rules on the 3 OPEN requests in 4 log/key-changes.md. Red commit 1c39a04, impl commit 3e81be7, worktree
/Users/a1/Desktop/CS Code/Project/Mole-worktrees/T27-decisions-as-rules (left unmodified: its only dirty file is still the
builder's uncommitted .mole/decisions/0016-core-is-the-bottom-layer.md).

How I checked: re-ran all 3 repros in the worktree, then applied exactly the 3 edits below to a throwaway copy
(~/.hermes/cache/scratch/t27ruling, with the Mole object store as git alternates; deleted afterwards), rebuilt
@mole/decisions and re-ran. Results in the copy: rules-check.test.ts 8/8 pass · m19.js "M19: caught 10/10 citing
decision, false positives 0 on 13 changes (… network calls 0)" · m21.js "recall 100% (38/38), false flags 0% (0/38)".

```notes
key ruling 1
    1 rules-check.test.ts --emit test      APPROVE (with a different edit than the builder's first pick)
        allowed edit            packages/decisions/test/rules-check.test.ts, 2 lines only
            import          old  import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
                            new  import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
            cruise call     old  const res = await cruise(['src'], { baseDir: root, validate: true, ruleSet: { forbidden: cfg.forbidden } as never, tsPreCompilationDeps: true });
                            new  const res = await cruise(['src'], { baseDir: realpathSync(root), validate: true, ruleSet: { forbidden: cfg.forbidden } as never, tsPreCompilationDeps: true });
        not allowed             adding preserveSymlinks or any other option to the cruise call      the expected violation (view.ts -> src/db/query.ts, mole-D001-1) stays exactly as is
        why                     the failure is the fixture path (os.tmpdir() under /var -> /private/var, readlink /var = private/var), not the rules: realpath fixes the fixture and keeps the check "dependency-cruiser alone, with only the emitted forbidden rules, finds it"      preserveSymlinks would make the test lean on an option the test never claimed to cover
        evidence                worktree: test fails, only D002 (unresolved lodash/fp) found · copy with this edit: 8/8 pass

    2 m19.ts exportTree apps pathspec      APPROVE (the builder's edit, verbatim)
        allowed edit            packages/decisions/bench/m19.ts, the git archive argument list in exportTree only
                            old  ':(glob)packages/*/src/**', ':(glob)apps/*/src/**']
                            new  ':(glob)packages/*/src/**', ...(execFileSync('git', ['-C', gitDir, 'ls-tree', '-d', '--name-only', sha, 'apps'], { encoding: 'utf8' }).trim() ? [':(glob)apps/*/src/**'] : [])]
        why                     a bench crash, no expectation, target or tree changes      Excalidraw at the key's sha has packages/ and no apps/ (git ls-tree -d: apps:[] pk:[packages])
        evidence                worktree: m19.js dies in exportTree on "pathspec ':(glob)apps/*/src/**' did not match" · copy with the edit: 10/10, 0 FP on 13

    3 m19-key.json P05 id 0016 -> 0017      APPROVE
        allowed edit            3 strings, nothing else in the key or tests
            m19-key.json P05.expect     old  "decision": "0016", … "ruleAt": ".mole/decisions/0016-core-is-the-bottom-layer.md:10"
                                        new  "decision": "0017", … "ruleAt": ".mole/decisions/0017-core-is-the-bottom-layer.md:10"
            rules-check.test.ts         old  for (const n of ['mole-0013-1', 'mole-0014-1', 'mole-0016-1'])
                                        new  for (const n of ['mole-0013-1', 'mole-0014-1', 'mole-0017-1'])
            same test's title           old  0016 core layering      new  0017 core layering      (label only)
        record (not key)        git mv .mole/decisions/0016-core-is-the-bottom-layer.md -> 0017-core-is-the-bottom-layer.md, id '0017'; rule item must stay on line 10
        why                     the planted case (P05: packages/core/src/neighborhood.ts:3 imports @mole/, must cite the core-layering decision) is unchanged; only the record's id moves off an id T29's M21 scenarios already use      no check loosened
        evidence                worktree: m21.js 84.2% (32/38), target missed · copy with record renamed to 0017: m21 100% (38/38), 0/38 false flags; m19 P05 still caught at :10 (10/10)      0017 is not used by M21's Mole scenarios (its 0017/0018 entries belong to the ADR corpus)

    notes (not rulings)
        T29                     M21 copies the LIVE .mole/decisions and plants id 0016 itself, so the next real record 0016 breaks M21 again      T29's key should plant an id no real record will take (e.g. 9xxx)      log for T29, not a T27 edit
        boundary                .mole/decisions/** is not in T27's boundary list, but the red commit already added rules to 0013/0014 and created 0016      the rename above is allowed as part of ruling 3 only
        assumption              no Raymond input; decided from the repros above      0016/0017 stays status: proposed until he approves it
```

## Key-guard record (added 11-05 by the orchestrator: the ruling above was applied in 867774d but never named the new hash, so CI key-guard failed on main since 11-04)

APPROVE applied: packages/decisions/bench/m19-key.json sha256 3c77806f0891ae7a9b03aa9c511a53c5ba45a4bdbd7b29206f1be91151351872 (content written by 867774d, unchanged since)
