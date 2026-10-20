---
state: proposed
owner:
repo:
branch:
worktree:
base:
reviewer:
updated: 2026-10-19 23:52
status: ledger proposed
next: fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
---
```notes
T1-m0b-alias-barrel-fixture      ledger task (rules.md §3 code features)      project Mole
    goal                    Add a second M0 fixture with real tsconfig-paths aliases and barrel re-exports and re-run the engine benchmark on it, so alias/barrel evidence is not one ambient module + 15 sites
    done-when               1) a real permissively licensed TS repo with >=100 call sites via tsconfig paths aliases and >=100 via barrel index.ts re-exports is chosen and recorded (name, URL, commit, license) 2) packages/indexer/bench runs on it via FIXTURE/TSCONFIG env, no engine code change, read-only 3) generated data/m0b-engine-report.json has per-stratum recall for TS API, scip-typescript, tree-sitter (CodeGraph optional) with n>=100 in alias and barrel 4) plan.json P2 m0_result updated: confirm or change the recommendation
    status                  2026-10-19 proposed
    next                    fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
    pinned
    mode                    code
    boundary                packages/indexer/bench/** · generated data/m0b-* · plan.json P2 m0_result only · scratch clone outside the repo
    checks                  npm run check
    non-goals               no new engine code, no UI, no daemon; do not vendor the fixture; no GPL deps
    proof                   generated data/m0b-engine-report.json + npm run check + change-log entry in context/product-plan/0 start.md
    stop                    stop and report if no suitable permissive fixture is found or the bench needs engine changes beyond config
    came from               T1 review 2026-10-19; USER 'yes do rec all'
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 any
```
