---
state: proposed
owner:
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch:
worktree:
base:
reviewer:
updated: 2026-10-28 22:22
status: ledger proposed
next: fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
---
```notes
T16-traces-runs-ci      ledger task (rules.md §3 code features)      project tasks
    goal                    Make the build loop's evidence industry-standard without moving the record: OpenTelemetry traces for mole check + daemon + MCP tool calls, MLflow 3 as a local viewer over tasks/*/4 log/runs.jsonl, and a GitHub Actions workflow running npm run check + every bench
    done-when               1) mole check emits OTel spans (git blame, index, questions) to a local OTLP endpoint when MOLE_OTEL=1, nothing otherwise; 2) a script loads every runs.jsonl line into a local MLflow (file store) as runs with params task+commit and metrics M1–M5; re-running it adds nothing twice; 3) .github/workflows/check.yml runs npm run check + benches and fails when a bench key file differs from its checks-first commit (R2); tested locally on a branch where a key was edited → fails; 4) no network, no accounts; 5) npm run check passes
    status                  2026-10-28 proposed
    next                    fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
    pinned
    mode                    code
    boundary
    checks
    non-goals
    proof
    stop
    came from               USER 2026-10-28 21:25 'also whats the current tools being used maybe also use more advantaced current industry tools maybe the ml ops tools stuff actually relevant ot industry jobs. we;ll see .' · D26 OPEN · Agentic workflow + integrations.md §11
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
