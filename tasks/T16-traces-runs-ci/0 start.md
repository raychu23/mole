---
state: integrated
owner: mole-builder-2 (Hermes chat)
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t16-traces-runs-ci
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T16-traces-runs-ci
base: c8e53f7
reviewer: reviewer-T16-r1
updated: 2026-10-29 02:42
status: ledger integrated
next: record outcome → ledger move <task> done --outcome … --resources … --prevents …
claimed: 2026-10-29 01:11
---
```notes
T16-traces-runs-ci      ledger task (rules.md §3 code features)      project tasks
    goal                    Make the build loop's evidence industry-standard without moving the record: OpenTelemetry traces for mole check + daemon + MCP tool calls, MLflow 3 as a local viewer over tasks/*/4 log/runs.jsonl, and a GitHub Actions workflow running npm run check + every bench
    done-when               1) mole check emits OTel spans (git blame, index, questions) to a local OTLP endpoint when MOLE_OTEL=1, nothing otherwise; 2) a script loads every runs.jsonl line into a local MLflow (file store) as runs with params task+commit and metrics M1–M5; re-running it adds nothing twice; 3) .github/workflows/check.yml runs npm run check + benches and fails when a bench key file differs from its checks-first commit (R2); tested locally on a branch where a key was edited → fails; 4) no network, no accounts; 5) npm run check passes
    status                  2026-10-29 integrated      merge 6463b51 · combined checks exit 0 · note: npm run check && node packages/telemetry/dist/bench/m13.js on main 6463b5
    next                    record outcome → ledger move <task> done --outcome … --resources … --prevents …
    pinned
    mode                    code
    boundary                packages/telemetry/** (new), packages/history/src + packages/daemon/src (span calls only, behind MOLE_OTEL=1), scripts/mlflow/** (new, Python loader), .github/workflows/check.yml (new), tasks/T16-traces-runs-ci/**
    checks                  npm run check && node packages/telemetry/dist/bench/m13.js
    non-goals               no PR comments/bot (D24) · no structure-map work (D23) · prototype/ rejected · no publishing or pushing · Raymond's accounts never used · don't edit benchmark keys after the red-tests commit (R2) · no network, no accounts, MLflow local file store only
    proof                   M13 line in runs.jsonl (stage span coverage, MLflow run count = runs.jsonl lines, CI key-guard red/green proof) + npm run check
    stop                    same check failure 3 rounds in a row (R3) · needs Raymond's accounts, paid API spend or a product decision
    assumptions             builder 2, 2026-10-29, Raymond not watching · 'index' stage = symbol resolution (mole check never opens the code index)
                            MCP span calls in packages/mcp (outside listed boundary; goal names MCP tool calls) · CI runs only self-contained benches (M3, M13), the rest print why they skip
                            MLflow = mlflow-skinny 3.17.2 in a venv outside the repo, needs MLFLOW_ALLOW_FILE_STORE=true (loader sets it) · key ruling 1: harness spawnSync → async spawn
                            open P2 (review-1): key guard accepts a self-written ruling + matches APPROVE anywhere · loader lets env re-enable MLflow telemetry
    came from               USER 2026-10-28 21:25 'also whats the current tools being used maybe also use more advantaced current industry tools maybe the ml ops tools stuff actually relevant ot industry jobs. we;ll see .' · D26 OPEN · Agentic workflow + integrations.md §11
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
