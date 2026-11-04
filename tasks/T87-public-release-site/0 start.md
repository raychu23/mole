---
state: proposed
owner: hermes-build
repo:
branch:
worktree:
base:
reviewer:
updated: 2026-11-03 22:26
status: ledger proposed
next: fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
---
```notes
T87-public-release-site      ledger task (rules.md §3 code features)      project tasks
    goal                    Public face in raychu23/mole-code-map (D99): regenerate the public copy from today's main with scripts/export-public.mjs (allowlist + private-string scan), keeping the existing code map as a feature/folder inside (not removed); a landing README that sells Mole's USPs honestly; an easy demo (`npx mole-code demo` or equivalent creating a sample repo with team decisions and showing Mole catch a change that breaks one, in the terminal and in Claude Code); a 60-second quickstart for Claude Code plugin, VS Code, npm CLI, MCP clients (Codex, Cursor, Gemini CLI); a GitHub Pages landing page; docs for each feature. Not pushed by the builder.
    done-when               1 product-claims table (closest existing tools, our difference, verdict) with dated sources · 2 every number on the page traced to a verified result file · 3 demo runs from a clean temp dir via the packed mole-code tarball · 4 export-public output scanned (no /Users/a1, no private notes) · 5 page renders (screenshot)
    status                  2026-11-03 proposed
    next                    fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
    pinned
    mode                    one worker
    boundary                scripts/export-public.mjs, scripts/public-README.md, docs/ (public), release/mole-code (demo command), site/ (Pages)
    checks                  npm run check
    non-goals               pushing, publishing, logins
    proof                   4 log/
    stop                    a claim or number without a verified source; publishing or pushing
    came from               USER 11-03 22:20: distribution all the way, publicly accessible, easy demos + intros, sell the USPs; D98-D100
    links                   4 log/ledger.md (every transition + its evidence)
    harness
```
