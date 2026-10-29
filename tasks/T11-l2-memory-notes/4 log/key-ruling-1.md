# T11 key ruling 1 (reviewer-T11-k1, fresh reviewer, R2)

```notes core
core      ruling on key-changes.md last entry: CLI test 5 s timeout
    ruling                  APPROVE      add `20_000` as the per-test timeout of that one `it(...)`, nothing else      → §ruling
    why not loosening       5 s is vitest's default, not a contract value      assertions unchanged      contract has no speed req for note/memory      → §r7
    evidence                3 CLI calls 0.85 s total at load 22-24      test alone 1.1-1.3 s      full suite 3.6-4.2 s      → §evidence
new       2026-10-28      first ruling
```

```notes
ruling
    decision                APPROVE
    test                    packages/memory/test/memory.test.ts > 'mole note add / mole memory --json via the CLI' (red commit 8a065c6)
    exact allowed edit      line 103-116 `it('mole note add / mole memory --json via the CLI', () => { … });` → `it('mole note add / mole memory --json via the CLI', () => { … }, 20_000);`
        only                append the 3rd argument `20_000` to that 1 `it(...)` call
        not allowed         any change to its body, expectations, fixtures, other tests, vitest config, global testTimeout
    out of scope            history CLI test + apps/vscode debounce flakes named in the proposal      not covered here      each needs its own ruling
r7
    q                       is raising a wall-clock budget "loosening the check"
    a                       no, here      R7 protects what a check asserts      this test asserts done-when 1 behaviour (note file written, --json lists 1 fresh note, edit → stale)      every expect stays identical
    budget source           5 s = vitest default testTimeout      red commit set no timeout      so 5 s was never a chosen acceptance value
    contract                0 start.md done-when 1-6 have no speed requirement for note add / memory      speed metric M5 belongs to mole check (<2 s p95, separate bench)      not this test
    implementation side     already done before proposal (2b54e3d lazy-loads memory/history/server)      per-call cost now 0.27-0.29 s, dominated by node + typescript load      no implementation change would remove contention from outside load
    limit                   20 s still fails a real hang (e.g. CLI blocking on stdin or an infinite loop)      ≈5x the worst observed full-suite time
    would be loosening      a timeout on a speed-asserting test (M5 bench) or a change to any expect
evidence
    load                    `uptime` 22:02-22:03      load avg 21.5-24.1 (1 min), 32.7-34.6 (5 min)
    build                   `npm run build` exit 0
    3 CLI calls             temp git repo w src/a.ts add()      `/usr/bin/time -p node packages/daemon/dist/cli.js <cmd> --root <tmp>` 3 rounds
        note add            real 0.29 0.29 0.29
        memory --json       real 0.27 0.28 0.27
        memory (after edit) real 0.27 0.27 0.27      output shows stale src/a.ts#add as expected
        total               ≈0.85 s per round
    test alone              `npx vitest run packages/memory/test/memory.test.ts` x3      12/12 passed      this test 1258 / 1084 / 1315 ms
    full suite              `npx vitest run` x2      88/88 passed      this test 4245 / 3617 ms      ≈3-4x alone, from parallel workers + outside load
    proposal data           npm run check 7 runs 21:48-22:01 at load 23-38      this test failed 4x (key-changes.md 22:02 entry)
    reading                 under 5 s only by ≈0.8-1.4 s in full suite at load ~24      at load 30-38 it crosses 5 s      cause is contention, not a Mole regression
```

```notes
change log
    2026-10-28 22:04      ruling written by reviewer-T11-k1
```
