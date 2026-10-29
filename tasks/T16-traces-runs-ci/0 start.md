---
state: verified
owner: mole-builder-2 (Hermes chat)
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t16-traces-runs-ci
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T16-traces-runs-ci
base: c8e53f7
reviewer: reviewer-T16-r1
updated: 2026-10-29 02:35
status: ledger verified
next: merge → ledger move <task> integrated --merge … (ledger reruns checks in the repo)
claimed: 2026-10-29 01:11
---
```notes
T16-traces-runs-ci      ledger task (rules.md §3 code features)      project tasks
    goal                    Make the build loop's evidence industry-standard without moving the record: OpenTelemetry traces for mole check + daemon + MCP tool calls, MLflow 3 as a local viewer over tasks/*/4 log/runs.jsonl, and a GitHub Actions workflow running npm run check + every bench
    done-when               1) mole check emits OTel spans (git blame, index, questions) to a local OTLP endpoint when MOLE_OTEL=1, nothing otherwise; 2) a script loads every runs.jsonl line into a local MLflow (file store) as runs with params task+commit and metrics M1–M5; re-running it adds nothing twice; 3) .github/workflows/check.yml runs npm run check + benches and fails when a bench key file differs from its checks-first commit (R2); tested locally on a branch where a key was edited → fails; 4) no network, no accounts; 5) npm run check passes
    status                  2026-10-29 verified      reviewer reviewer-T16-r1 · findings: P0 none, P1 none. P2-1 key guard accepts a self-written ruling (no reviewer id, sam
    next                    merge → ledger move <task> integrated --merge … (ledger reruns checks in the repo)
    pinned
    mode                    code
    boundary                packages/telemetry/** (new), packages/history/src + packages/daemon/src (span calls only, behind MOLE_OTEL=1), scripts/mlflow/** (new, Python loader), .github/workflows/check.yml (new), tasks/T16-traces-runs-ci/**
    checks                  npm run check && node packages/telemetry/dist/bench/m13.js
    non-goals               no PR comments/bot (D24) · no structure-map work (D23) · prototype/ rejected · no publishing or pushing · Raymond's accounts never used · don't edit benchmark keys after the red-tests commit (R2) · no network, no accounts, MLflow local file store only
    proof                   M13 line in runs.jsonl (stage span coverage, MLflow run count = runs.jsonl lines, CI key-guard red/green proof) + npm run check
    stop                    same check failure 3 rounds in a row (R3) · needs Raymond's accounts, paid API spend or a product decision
    came from               USER 2026-10-28 21:25 'also whats the current tools being used maybe also use more advantaced current industry tools maybe the ml ops tools stuff actually relevant ot industry jobs. we;ll see .' · D26 OPEN · Agentic workflow + integrations.md §11
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
