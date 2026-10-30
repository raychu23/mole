---
state: running
owner: mole-builder-12
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t41-head-to-head-benchmarks
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T41-head-to-head-benchmarks
base: c1663f3
reviewer:
updated: 2026-10-29 21:46
status: ledger running
next: worker finishes → ledger move <task> submitted --report … (ledger runs the checks row)
claimed: 2026-10-29 21:10
---
```notes
T41-head-to-head-benchmarks      ledger task (rules.md §3 code features)      project tasks
    goal                    Prove each Mole claim as a percentage against the most recognizable tool that does the same job, scored the way the field scores it (USER 10-29 23:55: 'percentage metrics agains tbest tools … more frecognizable … metrics that show i know what i talking abt, based on the job dsecriptoins amazion'). Six head-to-heads on Mole + the Excalidraw clone (~/.hermes/cache/mole-bench/excalidraw), each with a key written before any run: H1 call graph: Mole vs Sourcegraph scip-typescript vs tree-sitter vs dependency-cruiser, key = tsserver go-to-definition → precision/recall/F1, full index s, incremental p95 ms · H2 test selection: Mole vs Vitest 'vitest related' (built-in changed-file selection) vs run-all on planted regressions → regressions caught %, tests run %, CI wall-clock saved % · H3 stale knowledge: Mole vs Swimm Auto-sync (snippet-match algorithm per Swimm docs) vs Copilot Memory (citation-still-exists check per GitHub docs) vs path-touched (CODEOWNERS/ADR style), all baselines reimplemented from vendor docs and labeled so → precision/recall/F1 · H4 rename re-anchoring: Mole vs git rename detection (git log --follow -M) → precision/recall · H5 parallel-agent collisions: Mole vs git merge-tree textual conflicts vs same-file overlap (what worktree tools warn on) → recall, false-alarm rate · H6 agent 'done' claims: Mole vs tests-pass-only gate vs trust-the-summary → recall, false-flag rate. Plus T38's existing as-of 100% vs latest-only 45.3% and 34.9x GiST speedup copied in. Output: tasks/T41-head-to-head-benchmarks/4 log/scoreboard.json (row = claim · Mole · best baseline · tool · metric · n · Amazon JD line it shows) + scoreboard.md
    done-when               1) M35: all 6 head-to-heads run, every number from a frozen key committed before the first run; 2) each baseline actually executed (real tool) or reimplemented from cited vendor docs with the doc URL in the row; 3) scoreboard.json validates (script) and every row names its Amazon JD line (context/product-plan/systems/resume/jds/); 4) a loss or tie is reported as is (R7), never dropped; 5) npm run check green
    status                  2026-10-29 running      changes requested: review-2 P1: red commit bb1589d was NOT actually red (stale git index carried real impl forward past
    next                    worker finishes → ledger move <task> submitted --report … (ledger runs the checks row)
    pinned
    mode                    code
    boundary                packages/bench/** (new), tasks/T41-head-to-head-benchmarks/**, root package.json + package-lock.json (devDependencies only: @sourcegraph/scip-typescript, tree-sitter already present)
    checks                  npm run check && node packages/bench/dist/h2h.js --check
    non-goals               no paid API, no model calls, no Raymond accounts (CodeRabbit/Copilot/Swimm SaaS not run; their algorithms reimplemented from docs and labeled) · never edit keys after the red-tests commit (R2) · no brew installs (Universal Ctags not installed: skip it) · don't touch other tasks' packages beyond importing their exported functions
    proof                   runs.jsonl M35 + scoreboard.json + key commit before first run + fresh reviewer verdict
    stop                    R3 · a baseline can't run offline → reimplement from docs or drop that row with the reason
    came from               USER 2026-10-29 23:55 (context/product-plan/systems/resume/ask 2026-10-29 2355.txt) · D48
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
