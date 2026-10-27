---
state: ready
owner: unclaimed
repo:
branch:
worktree:
base:
reviewer:
updated: 2026-10-27 16:41
status: ledger ready
next: worker claims it → ledger move <task> running --orca | --git-worktree | --worktree PATH
---
```notes
T8-m1-click-every-node      ledger task (rules.md §3 code features)      project tasks
    goal                    Close the M1 acceptance gap 'every node opens file:line': in the real VS Code window, open EVERY node of a file map and a symbol map, and for callers check the landed line is a real call site of the focus symbol (T7 changed the click target and was only unit-tested in the webview)
    done-when               1) selftest opens every non-focus node of the shotFile map and of a symbol map through the same line rule the webview uses (clickLine), records landed path/line per node; 2) every node lands on its path:line (100%); 3) for the symbol map each caller's landed line text contains the focus symbol name; 4) generated data/m1-click-all.json with counts + any failing node; 5) selftest still passes the earlier checks (latency, restore, impact, failure cases); 6) npm run check passes
    status                  2026-10-27 ready      owner unclaimed
    next                    worker claims it → ledger move <task> running --orca | --git-worktree | --worktree PATH
    pinned
    mode                    code
    boundary                apps/vscode/src/extension.ts, apps/vscode/scripts/selftest.mjs, apps/vscode/webview/render.ts (export clickLine only), generated data/m1-click-all.json
    checks                  npm run check
    non-goals               no product behaviour change, no new UI, no packaging
    proof                   node apps/vscode/scripts/selftest.mjs output + generated data/m1-click-all.json + npm run check
    stop                    VS Code cannot be launched headless-ish as in T2, or the fixture would be modified
    came from               T2 open item (click-to-open driven for one node) + T7 changed the click target; M1 acceptance 'every node opens file:line'
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 any
```
