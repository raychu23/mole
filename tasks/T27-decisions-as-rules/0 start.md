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
T27-decisions-as-rules      ledger task (rules.md §3 code features)      project tasks
    goal                    Turn decisions into checks: a decision record can carry an architecture rule (e.g. 'ui never imports db', 'only api/ calls fetch'), compiled to dependency-cruiser rules (and TS-compiler call rules where imports aren't enough); violations at the hand-back cite the decision and its why instead of a bare lint error
    done-when               1) .mole/decisions/*.md front matter 'rules:' → generated .dependency-cruiser config + mole's own call rules; 2) M19 bench: 10 planted violations across Mole + Excalidraw → 10/10 caught, each citing its decision; 0 false positives on Mole's last 13 changes; 3) a rule with a syntax error fails loudly with file:line; 4) npm run check passes
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
