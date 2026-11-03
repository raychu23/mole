# T63 insights — dcbench Mole arm (proposed; harness prep only, no model runs)

## Summary
Prep done without model calls: dcbench cloned at 9f507ce (scratch/dcbench/repo), generator written (4 log/generate.mjs)
that turns its 15 seeded decisions into arm R (CLAUDE.md) and arm M (.mole/decisions) with identical text. Finding: no
decision names a file path, so M's records are all unscoped. Runner spawns `claude -p` (installed, v2.1.293; earlier not
logged in) — adapter to hermes -z still to write. Waits on Raymond: run count, M0 vs M1. Quota resets 08:59 11-03.

```notes
pinned          brief-hq/dcbench 9f507ce (MIT) · runner.ts:143 spawn("claude", ["-p", prompt, "--output-format", "json",
                "--dangerously-skip-permissions"]) · scorer regex per gotcha (grep_diff etc.)
generator       D-001..D-015 in seed order = tasks.ts decisionIds (checked) · R/CLAUDE.md + M/.mole/decisions/d-0NN.md
                (Decision + Rationale sections, severity) · manifest.json · scoped 0/15
next            adapter (hermes -z instead of claude -p, diff only the spawn) · M wiring (mole MCP + Stop-hook check in
                the run worktree) · dry run 1 task × 3 arms · freeze sha256 · then scored runs
```
