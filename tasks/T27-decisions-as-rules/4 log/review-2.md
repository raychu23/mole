```notes
core      T27 review 2 · fresh reviewer (hermes subagent, claude-opus-5-5) · 2026-10-29 · fix 71603e8, branch head f27894f (main merged in)
    verdict                 changes needed      all 7 round-1 findings fixed or documented, but the branch head fails its own acceptance after the main merge (1 P1)
    p1                      main's T21 collisions.ts breaks 0014's rule: m19.js exit 1 (live repo) + Mole dogfood test red → §2
    passed                  P1-1 fixed under the real depcruise CLI (r1 + Mole) · 12 new tests each fail on their own mutation · P2 reproducers behave · frozen key/tests untouched → §1
    p2                      dup id with superseded first record shows the other record's flag · P2-5 left (documented) → §3
    new       10-29     first write
```

```notes
1 what holds (real runs in the worktree, git status clean after)
    frozen files            git diff 867774d 71603e8 -- bench/m19-key.json bench/m19.ts → empty      git diff 867774d HEAD -- every packages/decisions test file of 1c39a04 + bench/ → empty
    P1-1 depcruise CLI      r1: `rules --root . --emit` exit 0 · `depcruise -c .dependency-cruiser.mole.cjs --output-type err` on src, ., src/ui → 7 violations, 9 modules cruised, exit 7 (was "not valid" / 0 modules)
        mole itself         emit exit 0 · `depcruise -c … packages apps` and `.` → 2 errors, 18 modules, exit 2: daemon/src/cli.ts → @mole/memory, @mole/history      both are `import type` (cli.ts:8, :10) = the documented type-only difference, Mole's own pass drops them
        header              emitted file now names the entry: `npx depcruise -c .dependency-cruiser.mole.cjs packages/core/src packages/daemon/src/cli.ts`
        cleanup             emitted .cjs + .mole-call-rules.json removed      git status --short empty
    tests fail w/o fix      all 5 src/rules files from 71603e8^ in a scratch copy → 12/12 new tests fail
        per fix             one mutation of the fixed code at a time, only its own tests go red
            P1              doNotFollow w/o file suffix → 3 P1 tests · validate back in options → the 2 CLI tests
            P2-1            old d.dynamic site filter + depcruise dynamic → static+dynamic test only
            P2-2            path syntax check off → 4 syntax tests · dead-path warning off → warn test only
            P2-3 P2-4 P2-6  dup stem off · line-1 fallback off · superseded `continue` before validation → each its own test only
    P2 reproducers          (round-1 fixtures copied to ~/.hermes/cache/scratch/t27-r2/probes)
        P2-1 r3             both.ts:1 → F1-1 + F1-3 (dynamic) · both.ts:2 → F1-1 + F1-2 (static)      was :2 only, F1-3 missed
        P2-2                `from: src/iu/` → warning D.md:6 "matches no source file (typo?)", exit 0 · /src/ui/ and C:/src/ui/ → error :7 absolute, exit 2 · backslash from + to → errors :7 :8, exit 2 · module to: (lodash, node:fs) not warned
        P2-3                E5a import + E5b call → warning E5b.md:2 duplicate id, violation cites "first" mole-E5-1 at E5a.md:6
        P2-4                /// <reference path> → src/ui/tsl.ts:1 reported
        P2-6                superseded `forbid: imprt` → error E4.md:6, still skipped, exit 2
        P2-5                not fixed, listed as left in 2 insights.md §0 (method-name FPs, aliases, element access, value passing, .call, missing fs callees)      acceptable for a P2
    other runs              packages/decisions vitest 7 files: 71 passed, 1 failed (§2) · full vitest 39 files: 270 passed, 1 failed (same test) · m21.js exit 0, recall 38/38, 0% false flags
```

```notes
2 P1
    P1-1 branch head fails M19 + the Mole dogfood test after the main merge
        what                f27894f merged main, which brings T21's packages/agentstate/src/collisions.ts (absent at 71603e8)      it calls writeFileSync (:250) and rmSync (:264) on its own mkdtemp scratch tsconfig      0014's rule forbids both in packages/agentstate/src/ except langgraph.ts
        reproducer          node packages/daemon/dist/cli.js rules --root . → collisions.ts:250 writeFileSync + :264 rmSync breaks 0014, exit 1
                            node packages/decisions/dist/bench/m19.js → "M19: caught 10/10 … false positives 0 on 13 changes (… base 2 …)" then "FAIL live repo: 0 errors, packages/agentstate/src/collisions.ts:250:0014, …:264:0014" exit 1
                            npx vitest run packages/decisions → rules-check.test.ts "Mole dogfood > Mole's own records carry rules … and they hold today" fails at expect(r.violations).toEqual([])
        why                 done-when needs m19.js exit 0 and npm run check green      the 71603e8 run (exit 0) predates the merge, so runs.jsonl no longer describes the head
        judgment            true positive of the rule as written, not of the decision: 0014 is about harness transcripts, collisions.ts writes a temp file it created
        fix                 not a frozen file: narrow 0014 (add packages/agentstate/src/collisions.ts to except: on line 16, rule stays at :15 so the key's ruleAt holds) or move the scratch write out of agentstate      re-run npm run check + m19.js + m21.js and log the run
```

```notes
3 P2
    P2-1 duplicate id: the second record's violation shows the first record's flag
        reproducer          E5a.md id E5 status superseded (call rule) · E5b.md id E5 status accepted, src/ui/ → src/db/
        observed            warning E5b.md:2 duplicate id · `breaks E5 "newone" (red accepted)` rule mole-E5-E5b-1 at E5b.md:6      title, status, record right      flag looked up by bare id (first record's), same pair both accepted shows green
        fix                 optional: omit the flag for a duplicate-id record, or make the duplicate warning an error      the warning already tells the user
    P2-2 dead-path warning fires on deliberately absent targets
        what                a to: for a deleted folder (forbid re-adding src/legacy/) warns "typo?" every run      warning only, exit unchanged      note, no action needed
```

```notes
4 how checked
    commands                npx tsc -b · node packages/daemon/dist/cli.js rules --root . [--emit] · depcruise 18.7.0 from the worktree · npx vitest run [packages/decisions] · m19.js · m21.js
    mutations               scratch copy ~/.hermes/cache/scratch/t27-r2 (rsync of the worktree, node_modules symlinked), src/rules edited there only
    not done                no code edits, commits or ledger commands in the worktree      npm run check not re-run as a whole (tsc -b + full vitest run separately)
```

## round 2b (P1 recheck)

```notes
verdict                 verified      P1-1 fixed by b4aae84, no new finding
    diff                    b4aae84 touches only .mole/decisions/0014-agent-states-read-only.md, 2+/2-: except: gains packages/agentstate/src/collisions.ts, why: reworded      `- forbid: call` still line 15 (hunk context unchanged) so the key's ruleAt holds      HEAD = b4aae84, tree clean
    collisions.ts writes    only fs writes in the file: writeFileSync(cfg) :250 where cfg = join(tmp, 'tsconfig.json'), tmp = mkdtempSync(tmpdir()/mole-collisions-) :246 · rmSync(tmp) :264 in finally      no transcript path reaches either call
    runs                    node packages/daemon/dist/cli.js rules --root . → 3 rules, 0 violations, exit 0
                            npx vitest run packages/decisions → 7 files, 72/72 passed (dogfood test green)
                            node packages/decisions/dist/bench/m19.js → caught 10/10, false positives 0 on 13 changes, live repo 0 violations, exit 0
    not done                m21.js and full npm run check not re-run here (outside this recheck's scope)      no code edits, commits or ledger commands
```
