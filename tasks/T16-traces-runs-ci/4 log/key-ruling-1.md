```notes
core      T16 key ruling 1      answer to key-changes.md 2026-10-29 "red-commit harness runs mole check with spawnSync"
    verdict                 APPROVE with changes      claim verified      edit keeps every assertion + target, off test gets stricter      → verdict
    probe                   same-process receiver + spawnSync sees 0 spans for any impl      spawn sees all 7      → probe
    edit                    proposed diff + 4 changes (500 ms off wait, drain stderr, utf8 stdout, bench timeout kept)      → approved edit
    new       2026-10-29      ruling written by reviewer-T16-ruling-1
```
```notes
verdict
    ruling                  APPROVE with changes
    reviewer                reviewer-T16-ruling-1 (fresh, did not write the code or the red commit)
    date                    2026-10-29 01:40 CDT
    request                 tasks/T16-traces-runs-ci/4 log/key-changes.md, entry 2026-10-29 01:55
    frozen files            unchanged d81d48d → HEAD a3e700f (git diff --stat empty)
        bench               packages/telemetry/bench/m13.ts
        test on             packages/telemetry/test/telemetry-on.test.ts
        test off            packages/telemetry/test/telemetry-off.test.ts
reasoning
    1 check impossible      yes, for every impl
        why                 spawnSync blocks the parent loop      the in-process receiver cannot read the POST until after the child exits
        on test + bench     spans read synchronously right after spawnSync      no loop turn in between      so 0 spans always (probe A)
        off test            rec.requests read synchronously      a child that does send a request still scores 0 (probe E)      vacuous pass
        not the impl        a raw fire-and-forget child (no exporter, no wait) is also invisible under spawnSync (probe E)
    2 no loosening          yes
        assertions          every expect, key value and target unchanged      only how the child is awaited changes
        "before exit"       still enforced      spans are snapshotted at 'close', after the child exited      an impl that sends after exit or never fails
        limit               a sender that writes the request + exits without waiting for the reply also passes (probe D)      bytes left the process before exit, so it counts as flushed      same as the original intent
    3 off test real         yes, after the edit
        before exit         a request sent before exit is counted by 'close' (probe D, req at close 1)      wait not needed for that case
        the wait            only catches requests from something that outlives the CLI (detached child, late timer)      no event marks "nothing more will come", so a time bound is the only option
        300 → 500 ms        match m13.ts's existing off wait (500 ms, frozen)      longer = stricter      costs 0.2 s
    4 side issues
        stderr pipe         proposed test helpers pipe stderr and never read it      a chatty child (> 64 KB) would block      must drain
        stdout              `stdout += d` on Buffers can split utf8 chars      use setEncoding('utf8')
        bench timeout       old run() killed the child at 240 s      proposed runAsync drops it      a hang would hang the bench, not fail it      keep timeout
        key guard           CI guard protects only *-key.json files      these 3 files are not in protected_keys      no sha256 lines needed here
probe
    build                   npx tsc -b in the worktree      exit 0
    script                  /Users/a1/.hermes/cache/scratch/t16-ruling-probe.mjs      receiver from packages/telemetry/dist/bench/otlp-receiver.js      cli check 61564ebf85
    command                 node /Users/a1/.hermes/cache/scratch/t16-ruling-probe.mjs
    output
        A spawnSync on      exit 0 3671ms, spans right after 0 (req 0), after 500ms wait spans 7 req 1
        B spawn on x3       exit 0 504-545ms, spans at 'exit' 7, at 'close' 7, req 1 (resolve_change, blame, fix_lookup, symbol_resolution, history.check, questions, check)
        C spawn off x3      exit 0 381-474ms questions 1, req at close 0, +300ms 0, +500ms 0
        D fire-and-forget   x5: exit 0, spans at 'exit' 1 at 'close' 1, req at close 1, +0ms 1, +300ms 1
        E spawnSync f&f     req read synchronously 0, after 300ms 1
approved edit (apply verbatim, nothing else in these 3 files)
    1 telemetry-on.test.ts
        import              `import { spawnSync } from 'node:child_process';` → `import { spawn } from 'node:child_process';`
        helper              insert right after that import line:
                                const spawnAsync = (cmd: string, args: string[], opts: { env: NodeJS.ProcessEnv }) =>
                                  new Promise<{ status: number | null; stdout: string }>((res) => {
                                    const c = spawn(cmd, args, { env: opts.env, stdio: ['ignore', 'pipe', 'pipe'] });
                                    let stdout = '';
                                    c.stdout.setEncoding('utf8');
                                    c.stdout.on('data', (d: string) => (stdout += d));
                                    c.stderr.resume();
                                    c.on('close', (status) => res({ status, stdout }));
                                  });
        test fn             'mole check emits git blame, … flushed before exit', () => {   →   …, async () => {
        call                `const r = spawnSync(process.execPath, [...same args...], { env, encoding: 'utf8' });` → `const r = await spawnAsync(process.execPath, [...same args...], { env });`
    2 telemetry-off.test.ts
        import + helper     same 2 changes as the on test (identical helper text)
        test fn             'mole check with MOLE_OTEL unset sends 0 requests …', () => {   →   …, async () => {
        call                same spawnSync → await spawnAsync change
        wait                insert directly before `expect(rec.requests).toBe(0);` in that test:
                                await new Promise((res) => setTimeout(res, 500));
    3 m13.ts
        import              `import { execFileSync, spawnSync } from 'node:child_process';` → `import { execFileSync, spawn, spawnSync } from 'node:child_process';`
        helper              insert right after the `const run = …` definition, before "// ---------- 1) OTel":
                                const runAsync = (cmd: string, args: string[], opts: { env?: NodeJS.ProcessEnv } = {}) =>
                                  new Promise<{ status: number | null; stdout: string; stderr: string }>((res) => {
                                    const c = spawn(cmd, args, { cwd: repoRoot, env: opts.env ?? process.env, stdio: ['ignore', 'pipe', 'pipe'], timeout: 240_000 });
                                    let stdout = '', stderr = '';
                                    c.stdout.setEncoding('utf8');
                                    c.stderr.setEncoding('utf8');
                                    c.stdout.on('data', (d: string) => (stdout += d));
                                    c.stderr.on('data', (d: string) => (stderr += d));
                                    c.on('close', (status) => res({ status, stdout, stderr }));
                                  });
        on call             `const c = run(process.execPath, ['--no-warnings', cli, 'check', …], { env: onEnv });` → `const c = await runAsync(…same args…, { env: onEnv });`
        off call            `const off = run(process.execPath, ['--no-warnings', cli, 'check', …], { env: offEnv });` → `const off = await runAsync(…same args…, { env: offEnv });`
        unchanged           the "no waiting" comment + immediate `[...receiver.spans]` read      the off 500 ms wait      every other run() call (MCP stop, MLflow, CI guard)
    after applying          run the checks line as committed (npm run check && node packages/telemetry/dist/bench/m13.js)      log the result in runs.jsonl      no other edit to these files without a new ruling
```
