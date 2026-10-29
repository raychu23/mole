```notes
T16 insights (builder: mole-builder-2 worker, 2026-10-29)

OTel
    packages            @opentelemetry/api 1.10 · sdk-trace 3.0 (OTel JS 3.0 merged sdk-trace-base/node into it) · context-async-hooks 3.0 ·
                        exporter-trace-otlp-http 0.300 (OTLP/HTTP JSON) · resources 3.0 · semantic-conventions 1.44
    off path            @mole/telemetry has no static OTel import (only `import type`); startTelemetry() returns false unless
                        MOLE_OTEL=1, so nothing is loaded and no socket opens (test: sdkLoaded() false, 0 requests)
    flush               CLI awaits shutdownTelemetry() in a finally around mole check; bounded at 3 s so a dead collector can't hang it.
                        daemon flushes after d.closed; MCP server flushes on stdin end / SIGINT / SIGTERM; BatchSpanProcessor 500 ms
    endpoint            OTEL_EXPORTER_OTLP_TRACES_ENDPOINT, else OTEL_EXPORTER_OTLP_ENDPOINT + /v1/traces, else http://127.0.0.1:4318
    span tree           mole.check (root, mole-cli; mole.change.*, mole.hunks, mole.past_fixes, mole.questions.count)
                          > mole.questions (cli wrap of questions(); questions package is outside the boundary)
                            > mole.history.check > mole.git.resolve_change, mole.git.blame, mole.history.fix_lookup, mole.history.symbol_resolution
    INFERENCE           "index" stage of done-when 1 = symbol resolution: mole check never touches the TS code index (only the daemon's
                        map does); the nearest real stage is history step 3 (enclosing symbol -> tests at the base via git grep)
    INFERENCE           mole.questions contains mole.history.check because questions() calls check() itself; separating them needs a
                        questions-package edit (outside the boundary)
    GenAI semconv       MCP tools/call -> span `execute_tool mole_map`, gen_ai.operation.name=execute_tool, gen_ai.tool.name,
                        gen_ai.tool.call.id (MCP request id), mcp.method.name=tools/call; errors set error.type + status ERROR
    daemon              span mole.daemon.rpc {mole.rpc.method} per RPC except ping (ping polls would flood)
    BOUNDARY NOTE       packages/mcp/src/{server,cli}.ts + packages/mcp package/tsconfig edited (span wrap + start/flush): the goal names
                        MCP tool calls but the boundary lists only history + daemon; edits are span calls only, behind MOLE_OTEL=1
    bundle              apps/vscode esbuild inlines @mole/telemetry + the OTel SDK into dist/daemon.cjs (dynamic imports are bundled);
                        bundle built OK (9.9 MB, mostly TypeScript) and `daemon.cjs check` still runs; not measured: vsix size delta

MLflow
    version             mlflow-skinny 3.17.2 in /Users/a1/.hermes/cache/scratch/mole-mlflow-venv (115 MB, outside the repo); skinny is enough
                        for the loader; `mlflow ui` needs the full package (not installed)
    file store          MLflow 3.17 raises on a file: store unless MLFLOW_ALLOW_FILE_STORE=true ("maintenance mode, migrate to sqlite");
                        the loader sets it (contract says file store); sqlite would need sqlalchemy/alembic (full mlflow)
    no network          loader sets MLFLOW_DISABLE_TELEMETRY=true + DO_NOT_TRACK=true before import (checked in mlflow/telemetry/utils.py)
                        and refuses any non-file: tracking URI
    idempotency         tag mole.line_hash = sha256(task + line number + raw line); runs.jsonl is append-only so line numbers are stable;
                        identical duplicate lines still count as 2 runs (run count = line count)
    default store       .mole/local/mlruns (already gitignored by T13's .mole/local/ rule)
    metric parser       hand-written cases in m13-key.json (10/10): "label N[%|/T| ms]" -> <metric>.<label>, /T -> .total, ms -> _ms,
                        "over N things" -> <metric>.things, pass/fail -> 1/0, bare "a/b" -> metric + .total; raw string kept as tag

CI (.github/workflows/check.yml, never pushed)
    steps               checkout fetch-depth 0 · setup-node 22 · setup-python 3.12 · npm ci + pip -r scripts/mlflow/requirements.txt ·
                        key guard · npm run check · bench M3 · bench M13 · print of skipped benches
    benches run         M3 (memory/m3: scripted temp repo) · M13 (this task: needs full history, which fetch-depth 0 gives)
    benches skipped     M1 memory/m1 (replays commits from the local excalidraw clone) · M2/M5 history/m2 (excalidraw) · M4 questions/m4
                        (excalidraw) · M0 indexer/bench/run.mjs (ui-tui fixture + engine downloads) · daemon/bench/m1.mjs (FIXTURE copy) ·
                        daemon/bench/m15 (paid agent sessions)
    key guard           scripts/ci/key-guard.mjs: keys = tracked + ever-added packages/*/bench/*-key.json, packages/*/bench/keys/*.json,
                        apps/*/bench/*-key.json; baseline = the commit that first added the path; byte-equal or red; changed/deleted
                        allowed only by tasks/*/4 log/key-ruling-*.md containing APPROVE and one line with the path + sha256 of the new
                        content ("deleted" for a deletion); shallow clone -> exit 2
    existing rulings    T11 + T12 key-ruling-1 changed a test timeout and m2.ts (bench script), not a key JSON: no JSON key has changed since
                        its red commit, so main is green (checked: main, T15, T18, T19 worktrees all "0 changed")
    INFERENCE           not guarded: bench scripts and red tests (also R2) and study/m15-learner/keys.json (T5, predates R1, changed in
                        T5 review fixes). Guarding scripts/tests would need hashed rulings for T11/T12's past approved edits
    local proof         m13 parses check.yml, takes the "key guard" step's run command, runs it in a temp `git worktree add --detach HEAD`
                        -> 0; edits + commits m3-key.json -> 1; adds an APPROVE ruling with the sha256 -> 0; wrong hash -> 1; worktree removed

open
    key-changes.md      the red-commit bench + 2 tests await `mole check` with spawnSync while the OTLP receiver is in-process, so the
                        CLI's spans cannot be received (proposal + evidence there); waiting for a ruling (R2) — until then M13 reads
                        22.2% and npm run check has 1 failing test
```
