---
state: built, needs review
owner: wave-h-agent-h1
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t99-server-throughput
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T99-server-throughput
base: f22b551
status: built, not yet reviewed or integrated
next: adversarial review (sdlc 4-verify/4-adversarial-review), then ledger integrate
---
```notes
T99-server-throughput    wave H task H1 (backend: measured bottleneck from T98)
    goal                 fix the two gaps T98's load test found and measured but did not fix:
                          (1) rebuild.ts/checkrun.ts's own synchronous execFileSync git calls
                          on the job path (now promisify(execFile), bounded via a new
                          concurrency.ts mapLimit helper -- pg-boss 10.4.2, the version
                          installed here, has no localConcurrency WorkOptions field, checked
                          against its own types.d.ts, so bounded fan-out is implemented at the
                          handler level instead, cited honestly in docs/server-slo.md);
                          (2) pg-boss queue names global to the Postgres instance (now
                          `${prefix}:${base}`, default prefix = db name parsed from the
                          connection string, override via MOLE_QUEUE_PREFIX, '' preserves the
                          exact pre-T99 names for an in-place upgrade with no migration step).
                          Reran T98's own load.mjs (same parameters) before/after.
    done-when             queue-prefix.spec.ts (pure + live two-Boss isolation) and
                           event-loop.spec.ts (monitorEventLoopDelay p99 for the rebuild-index
                           job path) pass; every pre-existing packages/server test file passes
                           individually (4 log/green.txt); 4 log/red.txt proves both new test
                           files are non-vacuous (failed against main's pre-T99 code); 4 log/
                           load.md has a real before/after table from load.mjs reruns.
    status                2026-11-05 built on branch ledger/t99-server-throughput, NOT merged/
                          reviewed. npx tsc -b packages/server clean. 17 server test files
                          pass individually, 51 tests total (4 log/green.txt).
    finding               T99's own investigation found T98's diagnosis was INCOMPLETE: the
                          dominant blocking cost on the compute-check-run job path is
                          @mole/decisions' prCheck() (packages/decisions/src/check/
                          pr-check.ts, ~20 execFileSync calls incl. an unconditional git
                          worktree add/remove per call), not checkrun.ts's own wrapper calls.
                          Fixing checkrun.ts's wrapper helped webhook-ack p95 a lot (1,166ms
                          -> 14ms) but queue-drain throughput barely moved (0.91 -> 0.95
                          job-units/sec) because prCheck itself (out of this task's
                          packages/server/src/** boundary, shared by the CLI + plugin hooks
                          too) remains unfixed -- logged as a NEW "Found, not fixed" item in
                          docs/server-slo.md, not silently absorbed into a loosened test.
    boundary              packages/server/src/{concurrency(new),rebuild,checkrun,queue,
                          webhook,index}.ts, packages/server/test/{queue-prefix,event-loop}.ts
                          (new), docs/server-slo.md, tasks/T99-server-throughput/**
    non-goals             no real GitHub App, no Docker, no paid API, no Raymond accounts,
                          no fix to @mole/decisions/src/check/pr-check.ts (see finding above)
    came from             Wave H brief H1 (briefs/G-wave.md), built directly on T98's own
                          "Found, not fixed" items #1 and #2
    links                 docs/server-slo.md (updated: Summary, Prior art (T99), What was
                          built (T99), Found/not fixed #1/#1b/#2)
                          tasks/T99-server-throughput/4 log/{red,green}.txt, load.md,
                          load-after-raw.json, scripts/load.mjs
    harness               hermes
```
