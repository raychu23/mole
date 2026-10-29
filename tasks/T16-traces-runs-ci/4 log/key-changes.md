```notes
T16 key-changes (R2: proposal, waits for a fresh reviewer's ruling; the implementer does not apply it)

2026-10-29 01:55      red-commit harness runs `mole check` with spawnSync while the OTLP receiver is in the same process
    what                    3 call sites written in the red commit d81d48d
        bench               packages/telemetry/bench/m13.ts, the 2 `run(process.execPath, ['--no-warnings', cli, 'check', …])` calls
                            (MOLE_OTEL=1 run and MOLE_OTEL unset run)
        test on             packages/telemetry/test/telemetry-on.test.ts, test 'mole check emits git blame, … flushed before exit'
        test off            packages/telemetry/test/telemetry-off.test.ts, test 'mole check with MOLE_OTEL unset sends 0 requests …'
    why wrong               spawnSync blocks the parent's event loop; the receiver (bench/otlp-receiver.ts, node http in the same
                            process) cannot answer the child's OTLP POST until the child has exited. The exporter waits for the reply,
                            the CLI's bounded shutdown (3 s) gives up, the CLI exits, and only then does the parent read the buffered
                            request. So no implementation can make the "on" checks pass, and the late request lands after
                            receiver.reset() and is counted as an "off" request (bench: off requests 1). The off test reads
                            rec.requests synchronously after spawnSync, so it could never see a request either (it passes vacuously).
    not loosening           every assertion, key value and target stays identical; only how the child is awaited changes, and the off
                            test gets stricter (it now waits 300 ms so a request would be counted)
    evidence
        spawnSync probe     receiver + spawnSync(cli check 61564ebf85, MOLE_OTEL=1)      exit 0 after 3342 ms, 0 requests, 0 spans
        async probe         same with spawn + await 'exit'      exit 0 after 377 ms, 1 request, 7 spans: mole.check (root,
                            mole.hunks 11, mole.past_fixes 1, mole.questions.count 1) > mole.questions > mole.history.check >
                            resolve_change, git.blame (mole.files 3), fix_lookup (mole.commits 3), symbol_resolution
        bench as committed  node packages/telemetry/dist/bench/m13.js      exit 1: "stage coverage 22.2% (2/9), off requests 1,
                            mlflow runs 22/22 (second load 0), parse 10/10, ci green 0 red 1 ruled 0" (only the 2 spans from the
                            async MCP path arrive)
        bench with edit     dist copy with the edit below (deleted after)      exit 0: "stage coverage 100% (9/9), off requests 0,
                            mlflow runs 22/22 (second load 0), parse 10/10, ci green 0 red 1 ruled 0", at target true
        tests with edit     temp copies zz-proposed-{on,off}.test.ts (deleted after)      vitest 4/4 passed; originals: on 1 failed
                            ('expected [] to have a length of 1 but got +0')
    proposed edit (exactly)
        m13.ts              add `spawn` to the node:child_process import; add a helper before "// ---------- 1) OTel":
                                const runAsync = (cmd: string, args: string[], opts: { env?: NodeJS.ProcessEnv } = {}) =>
                                  new Promise<{ status: number | null; stdout: string; stderr: string }>((res) => {
                                    const c = spawn(cmd, args, { cwd: repoRoot, env: opts.env ?? process.env, stdio: ['ignore', 'pipe', 'pipe'] });
                                    let stdout = '', stderr = '';
                                    c.stdout.on('data', (d) => (stdout += d));
                                    c.stderr.on('data', (d) => (stderr += d));
                                    c.on('close', (status) => res({ status, stdout, stderr }));
                                  });
                            the 2 check calls: `run(process.execPath, [...cli, 'check', …], { env })` -> `await runAsync(…same args…)`
        both tests          `import { spawnSync }` -> `import { spawn }` + a spawnAsync helper of the same shape; the test fn becomes
                            async; `spawnSync(process.execPath, [...], { env, encoding: 'utf8' })` -> `await spawnAsync(process.execPath, [...], { env })`
        off test only       before `expect(rec.requests).toBe(0)` insert `await new Promise((res) => setTimeout(res, 300));`
        exact diffs         /Users/a1/.hermes/cache/scratch/t16-on.diff, t16-off.diff (scratch, regenerate from this text if pruned)
```
