---
state: proposed
owner:
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch:
worktree:
base:
reviewer:
updated: 2026-10-29 01:38
status: ledger proposed
next: fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
---
```notes
T26-big-picture-view      ledger task (rules.md §3 code features)      project tasks
    goal                    The big picture a junior can trust (only if D30 says yes, since D23 recommends stopping structure-map work): a zoomable view system → component → function where every node shows meaning, not just structure: what it's for (first line of its docs/ADR/notes), risk (past-fix density × recent change, CodeScene-style hotspots), your understanding (seen / noted / stale, T11/T13), and agent activity (runs that touched it, T18); components come from a Backstage catalog-info.yaml or Structurizr/C4 file when present, else workspace packages + import-graph clusters
    done-when               1) panel view with semantic zoom (3 levels) and the 4 overlays; every node clicks to file:line; 2) M18: the 10-minute catch-up sheet (context/product-plan/systems/tool-trials/you-10-min.md) on an unfamiliar Excalidraw area, with vs without the view, 3+ juniors: time to 5 correct answers and correctness, n and order fixed before; 3) the view never shows a node without its purpose line or a 'no purpose recorded' marker; 4) failure case: repo without docs → purpose from exports + names, labeled inferred; 5) npm run check passes
    status                  2026-10-29 proposed
    next                    fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
    pinned
    mode                    code
    boundary
    checks
    non-goals
    proof
    stop
    came from               USER 2026-10-29 06:40 'go far beyond … proper systems or dev support tools … full enterprise-grade both … ui user feats and some backend tools … compiler-in-the-loop … ideas foundations from open source … full system the end user like a junior dev or senior dev is situated in … big pic understanding' · Mole full system.md · D30
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
