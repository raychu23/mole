---
state: submitted
owner: mole-builder-7
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t34-one-panel
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T34-one-panel
base: 16ad3b2
reviewer:
updated: 2026-10-29 17:18
status: ledger submitted
next: fresh reviewer → ledger move <task> verified --reviewer … --findings …
claimed: 2026-10-29 15:43
---
```notes
T34-one-panel      ledger task (rules.md §3 code features)      project tasks
    goal                    Everything Mole knows about the code you're on, inside VS Code where you already work, never the terminal (USER 10-29 15:30 'why arent that stuff in the panel in vscode'). A Mole view in the Activity Bar (WebviewViewProvider, like GitLens or Copilot side views) follows the cursor's function and shows, decisions first: 1 decisions that govern it (T29 flag + why + evidence, click opens the record) · 2 past fixes behind its lines (T12) + their guarding tests · 3 your notes + an add-note box (T11) · 4 since you last looked (T13) · 5 up to 3 questions (T14) + an 'explain it back' box saved privately in .mole/local (read-back stub for T31) · 6 tests that guard it with a Run button and pass/fail (T22) · 7 agents: who touched it, the last session's unbacked claims (T24), collisions (T21), already tried (T18), the gate verdict (T25 when present), agent coverage (T35 `mole coverage --json` when present) · 8 blast radius: impact + the decisions, tests and runtime callers (T28) it reaches. Decision-rule violations (T27) show in the Problems panel. Every CLI read command gets a command-palette entry. The existing map panel stays.
    done-when               1) M26a: every CLI read feature (map, impact, note add, memory, since, past fixes, questions, decisions, rules, run-tests, claims, flows, collisions, tried) has a non-terminal surface (view section, hover, diagnostic or command), checked by apps/vscode/scripts/m26.mjs over package.json contributes + a real-VS-Code DOM dump of the view on the Mole repo → 14/14; 2) M26b: view refresh on cursor move or file switch p95 <= 300 ms in real VS Code on the Mole repo, 3 runs (reads off the UI thread, cached per file + commit); 3) failure cases: a repo with no .mole and no git → each section says what to do in one line, no errors in the extension host log; one failing data source degrades only its section; 4) packaged: npm run package -w @mole/vscode + node apps/vscode/scripts/install-check.mjs (FIXTURE=$HOME/.hermes/hermes-agent/ui-tui) pass; 5) screenshots of the view on the Mole repo in tasks/T34-one-panel/4 log/; 6) npm run check passes
    status                  2026-10-29 submitted      report: Built the Mole sidebar WebviewViewProvider (apps/vscode/src/panelData.ts, panelRunners.ts, panelView.ts, webview
    next                    fresh reviewer → ledger move <task> verified --reviewer … --findings …
    pinned
    mode                    code
    boundary                apps/vscode/** (src, webview, media, package.json contributes, scripts, test, esbuild.mjs), packages/*/src read-only (import exported functions; export a helper with a one-line change only), packages/daemon/src/cli.ts (add --json only where a section needs it, one call each), tasks/T34-one-panel/**
    checks                  npm run check && node apps/vscode/scripts/m26.mjs
    non-goals               no paid API or model calls from Mole code (a model only behind an interface, tests use recorded fixtures) · no publishing or pushing · Raymond's accounts never used (no GitHub App registration, no Slack workspace, no marketplace) · prototype/ rejected · don't edit benchmark keys after the red-tests commit (R2) · shared registries (MCP tool list, CLI usage, workspace deps, extension package.json contributes) tested with toContain, never an exact set · never start Docker Desktop (disk ~6 GB free): local Postgres via /opt/homebrew/bin/pg_ctl in a temp dir or PGlite · kill processes by pid only, never pkill -f
    proof                   runs.jsonl last line with the metric + npm run check output + the red-tests commit dated before the first implementation commit + the fresh reviewer's verdict
    stop                    same check failure 3 rounds in a row (R3) · needs Raymond's accounts, paid API spend, people or a product decision (log it in 4 log, move on to the next task)
    came from               USER 2026-10-29 15:30 (context/product-plan/systems/full-build/ask 2026-10-29 1530.txt): 'build full system based on establisseh dopen soruce repos or big company systs or startups … why arent that stuff in the panel in vscode … which agents cover which files … blast radius … tjhe reamining stuff that dont work make it work'
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
