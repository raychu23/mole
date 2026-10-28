---
state: submitted
owner: unclaimed
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t10-public-repo-and-marketplace
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T10-public-repo-and-marketplace
base: f2fcf8c
reviewer:
updated: 2026-10-28 08:15
status: ledger submitted
next: fresh reviewer → ledger move <task> verified --reviewer … --findings …
claimed: 2026-10-28 08:03
---
```notes
T10-public-repo-and-marketplace      ledger task (rules.md §3 code features)      project tasks
    goal                    Publish Mole as a public MIT-licensed source repo (clean export, no private context) and release mole-code-map 0.1.0 to Open VSX and the VS Code Marketplace, doing every step an agent can and giving Raymond exact links for the rest
    done-when               1) LICENSE (MIT) + manifest license/repository/homepage/bugs; 2) public export script that copies only an allowlist (apps, packages, configs, public README, LICENSE) with fresh history and a scan for private strings/paths; 3) public GitHub repo pushed from it; 4) new cropped screenshot of the panel on an MIT repo (no desktop, no menu bar); 5) .vsix rebuilt with repository set and published to Open VSX (namespace created) if the account can be made from Raymond's logged-in browser; 6) VS Code Marketplace publisher + PAT: done if possible, else exact direct links + steps; 7) npm run check passes; listing URL(s) checked by opening them
    status                  2026-10-28 submitted      report: public repo https://github.com/raychu23/mole-code-map + release v0.1.0 (vsix installs clean), marketplaces need
    next                    fresh reviewer → ledger move <task> verified --reviewer … --findings …
    pinned
    mode                    code
    boundary                apps/vscode/**, LICENSE, scripts/export-public.*, root README for the public export only, tasks/T10*
    checks                  npm run check
    non-goals               no change to the private repo's history, no secrets in any file or chat, no product features
    proof                   public repo URL, install of the PUBLISHED extension id in a clean profile
    stop                    needs a password, 2FA code, payment, or Raymond's own identity verification (those are only his)
    came from               USER 2026-10-28 'so get it done marketplace do all... stuff you cant tell me exactly what to do or put me directly there'
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 any
```
