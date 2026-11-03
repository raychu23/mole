# T65 insights — the agent loop now runs Mole's measured verifier

## Summary
Before T65, an agent using Mole's Claude Code plugin got only `mole check` (past fixes, questions) when it stopped;
the verifier behind the B2 numbers (cascade + T53 routing by meaning) never ran in the loop, and `cascade-check` only
took two commit SHAs. Now `mole cascade-check --worktree` checks uncommitted work through a snapshot commit (user's
index, refs and files untouched), the CLI uses the measured routing settings by default, and the Stop hook lists
judged violations first and, with MOLE_STOP_CONTINUE=1, asks the agent to fix them. Open: the model-judged replay
waits for quota (08:59); without a model the router's top pick missed D-002 on the sanity case.

```notes
code         cascade/worktree.ts snapshotWorktree (temp GIT_INDEX_FILE, commit-tree, .mole/ excluded) · cascade/semantic-docs.ts
             (same docs as run_t53_semantic_route_v3.mjs:43-51) · cli.ts --worktree, --no-route, SEMANTIC_ROUTE_DEFAULTS ·
             plugins/claude-code/scripts/verify.mjs (verifierParts, runVerifier) · stop.mjs verifier part first + continue
             text · hooks.json Stop timeout 60 → 120 s
tests        cascade-worktree.test.ts 6 · stop-verifier.test.ts 6 (red 4 log/red.txt) · decisions + plugin 380 pass
replay       4 log/replay.txt (no model): sanity export route → "may govern: D-010" (not D-002) · clean repo silent ·
             status unchanged · 1.8 s / 1.2 s
found        export-convention-trap (backlog): any decision title with a word starting "export" is treated as a JS
             module-export rule, so "audit every data export" fires crisply on any new TS export, no judge. Test
             fixture avoids it; fix = T66, before the T63 freeze
behaviour    CLI default changed: cascade-check now routes by meaning unless --no-route (INFERENCE: no caller relied on
             the old default; grep found only daemon + this hook)
```
