# T28 insights

```notes
instrumentation choice (contract asked to pick and justify)
    picked                  a Vite transform (vitest runs every module through Vite) that wraps each function body with
                            enter/exit hooks: `const __F=__mf.e(id);try{ body }finally{__mf.x(__F)}`, ids computed with the
                            same rules as @mole/indexer describe(), inserted on the same lines (no newline: file:line stays)
    why not V8 coverage     precise coverage says which functions ran per test, not who called whom: no caller -> callee
                            edges at all, so it cannot recover a single dynamic edge; also block counts per script, not ids
    why not OTel spans      spans around exported functions only see exports (callbacks, registry lambdas, private
                            methods, class members are where the dynamic calls are) and parent spans ride on async
                            context, which credits a later callback to whoever registered it (the invented-edge case
                            the key's non-edges test); @mole/telemetry is off unless MOLE_OTEL=1 and needs an exporter
    caller tracking         one global `cur` frame + explicit hand-off at await/yield (s before suspending, r on resume,
                            c in catch/finally after a rejected await). AsyncLocalStorage was rejected: it propagates the
                            registering function's context into event/timer callbacks (server.on(handler) would read as
                            "startServer calls handler"). Implicit awaits (for await, await using, async generators) can't
                            be seen: those frames are muted (no edges inside, cur reset to null) -> misses, never invents
    lexical attribution     a closure runs as a frame of the node that contains it (what the static graph does);
                            a lambda inside a variable/class/file node (registry entry `register({perform: () => ...})`,
                            class field, module-level callback) counts as a call to that node; constructors are the class
                            (`new C()`) or C.constructor (`super()` from a subclass, via new.target)
    initializers            field initializers and parameter defaults run before/outside the body: wrapped in a frame of
                            their node so `new C()` / `f(a = g())` do not credit the caller with C's or f's calls
    harness setup files     the target's vitest setupFiles (Excalidraw setupTests.ts mocks) are not graph nodes: muted
                            frames (they hold the stack, never an edge end). Found by the bench's unknown-id check (3
                            edges to file:setupTests.ts in the first single-run Excalidraw try, before the fix)
    store                   .mole/local/flows/ (gitignored): run.json (meta) + tests/*.json (per test file per worker),
                            vitest.log, the generated wrapper config + setup file + Vite cache: the target repo is never
                            written (the Excalidraw clone is shared and read-only)
    dist -> src             Mole tests import other packages through dist/*.js: instrumented under the src/*.ts id

assumptions (Raymond away, nobody to ask)
    test sets               M20 uses 3 Mole + 3 Excalidraw test files (key "repos"), not whole suites: the bench runs
                            each set 6 times (3 plain + 3 instrumented, interleaved) and must stay minutes, not an hour
    static graph of Mole    indexed with @mole/* mapped to packages/*/src (bench/mole-graph.tsconfig.json); without it,
                            cross-package calls are unresolved and would count as "dynamic misses" that are not dynamic
    edge semantics          written into the key "definition" before the code: calls through library code (Array.map,
                            EventEmitter.emit, React) count for the innermost repo frame; event-loop callbacks are roots
    red stubs               src/index.ts exported the API with throwing stubs so tsc -b and the bench compiled (T18 pattern)
    daemon types            boundary allows only cli.ts in packages/daemon (no tsconfig reference / package.json dep):
                            the root tsconfig lists packages/flows before packages/daemon so tsc -b builds flows' .d.ts
                            first; `tsc -b packages/daemon` alone on a clean checkout would not find @mole/flows types
    usage line              the daemon CLI's shared usage string is not edited (one import + one call rule);
                            `mole flows` with no args prints its own usage
    first runs.jsonl line   the red run was logged before the red commit existed, so its commit field is the base
                            5b447f7 (tree = red commit 66f2c76 contents); kept as is (never edit old lines)

results (round 1, 92d6221)
    M20                     recovered 22/22 dynamic edges the static graph misses (Mole 2/2, Excalidraw 20/20)
                            invented 0 (11 non-edges never recorded, 0 unknown ids) · overhead mole 0.99x, excalidraw
                            1.00x (median of 3, machine load average 40-60 from parallel builders: wall times are noisy;
                            Excalidraw vitest "tests" time plain 35-46 s vs instrumented 49 s, transform ~2x)
                            static key edges seen at runtime 25/25
    npm run check           3 failures, all 5 s test timeouts in other packages under the load (langgraph-export CLI,
                            indexer barrel fixture, telemetry key-guard); the same langgraph timeout fails on the base
    unverified hand check   149 recorded edges touch key symbols but are neither key nor static edges. Each caller body
                            was scanned for the mechanism (scratch script, then read): 41 keyTest/perform registry calls
                            (handleKeyDown -> action variables), 8 executeAction perform, 95 test helpers
                            or App methods that render React synchronously (act / fireEvent / flushSync / setState ->
                            action PanelComponent / predicate lambdas inside the action variables), 2 getter calls
                            (alignSelectedElements / flipElements -> App.renderEnvironment, App.tsx:619 `get`),
                            getNonDeletedElements -> isNonDeletedElement (.filter callback, index.ts:57),
                            duplicateElements -> actionDuplicateSelection (opts.overrides lambda, duplicate.ts:461),
                            createTestHook -> Scene.replaceAllElements (elements setter, App.tsx:11476). All real calls
                            under the key's definition -> 0 added to invented
    key label error         E16 (validate -> satisfiesRemoval) labelled not exercised, recorded in every test: see
                            4 log/key-changes.md; outside the denominator either way

rounds 2-3 (900dc0a, same code; docs-only commit)
    M20                     both 22/22, invented 0, overhead mole 0.89x / 1.16x, excalidraw 1.02x / 0.80x (median of 3)
                            round 2 bench also flagged "instrumented runs broke tests in excalidraw": run 2 had 5 plain /
                            7 instrumented failures, all `Test timed out in 5000ms` / "still loading" under load 40-80 in
                            BOTH modes (the same bring forward / send back tests); runs 1 and 3 were 108/108 in both
    npm run check           round 2: 26 timeouts across packages (load ~45); round 3: only
                            agentstate/test/langgraph-export.test.ts "CLI: mole run <id> --export langgraph" (5 s timeout,
                            7.3 s alone) - the same test fails on the untouched base 5b447f7 (first npm run check of
                            this task, before any change) and in all 3 rounds -> R3 stop: blocked on a pre-existing,
                            load-sensitive test outside the boundary (packages/agentstate is not T28's)

risks / gaps
    subprocesses            code run by spawned processes (Mole's CLI/daemon tests, worker threads) is not instrumented:
                            formatRun -> stepLine (E25) stays invisible; a --import loader for child processes is the
                            follow-up
    React-heavy callers     "through library code" makes test helpers that trigger a synchronous React render callers
                            of every action PanelComponent rendered: true by the definition, noisy for a reader
    graph integration       runtime edges are stored and queryable (mole flows); merging them as a layer into the daemon
                            graph / the map picture is not done here (boundary: packages/flows + one cli line)
    sourcemaps              the transform returns map: null; lines are kept, columns shift inside instrumented lines
```
