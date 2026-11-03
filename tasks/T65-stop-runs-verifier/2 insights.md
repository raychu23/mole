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

## Review 1 (deleg_6ddeb28d) FAIL → fixed tests-first
```notes
HIGH      nested pkg/.mole entered the snapshot (pathspec only excluded root .mole)      fix: ':(exclude,glob)**/.mole/**' too · test red first
LOW       repo with no commit: cascade-check --worktree exited 1      fix: snapshot {base:'',head:''} → "no commit yet, nothing to check", exit 0
LOW       done-when 3 asked for file:line per violation      NOT met by design: cascade verdicts are decision-level (CascadeVerdict has no
          file/line); message names decision id + title + judge reason. Contract amended here, not faked
verified  snapshot leaves index/refs/HEAD/status/files identical (tracked, untracked, staged, symlinks, unicode, gitignored, mid-merge) ·
          NO_JUDGE classifies only the 2 no-judge reasons; crisp match:/rule: stay violations · hang → moleJson 100 s cut, hook quiet ·
          semantic docs + defaults == run_t53_semantic_route_v3.mjs · MCP cascade tool unaffected (calls library, no semanticRoute)
env       reviewer's full npm run check in this worktree, run while main's check ran, had 44 files fail with "invalid object …
          .mole/tenets.md"; files pass alone. INFERENCE: concurrent checks on worktrees sharing one object store (intake throwaway
          worktrees) — never run two full checks at once
after     decisions + plugin 382 pass
```
