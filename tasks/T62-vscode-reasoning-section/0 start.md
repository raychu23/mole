---
state: proposed
owner: hermes-build
repo:
branch:
worktree:
base:
reviewer:
updated: 2026-11-02 22:40
status: ledger proposed
next: fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
---
```notes
T62-vscode-reasoning-section      ledger task (rules.md §3 code features)      project tasks
    goal                    IDE half of backlog reasoning-surfaces: a 'Reasoning' section in the VS Code sidebar panel (T34 one-panel) showing, in plain lines: the phase in force and which decisions/arguments flip at the adjacent phase with the winning attack + tenets + ranks (T60); open incident revival suggestions (T58, suggest only); this repo's proposals and the decisions each changes vs the baseline (T56). Read-only. One source: proposal discovery moves from packages/mcp into @mole/proposals (listProposals) and both MCP and the panel use it.
    done-when               1 tests first (red) · 2 panelData builds the section from stub runners; each sub-source failing degrades only its own line (T34 failure case b); nothing to show → status empty · 3 pure renderer webview/reasoning.ts → HTML with every flip's decision, before→after, winning attack, both tenets + ranks; all text escaped · 4 daemon CLI: mole proposals (same JSON as mole_proposals_compare) and mole incident list (incidents + top suggestions); MCP tool output unchanged (its tests) · 5 real proof: the bundled extension's runners on the T61 replay repo produce the section, rendered to a screenshot · 6 npm run check
    status                  2026-11-02 proposed
    next                    fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
    pinned
    mode                    one worker
    boundary                apps/vscode/src/{panelData,panelRunners}.ts, apps/vscode/webview/{panel,reasoning}.ts, packages/proposals/src (listProposals, summary), packages/mcp/src/reasoning-tools.ts (use it), packages/decisions/src/cli.ts (incident list), packages/daemon/src/cli.ts (one line), tests
    checks                  npm run check
    non-goals               accept/dismiss/create buttons (writes, a person's act at the CLI for now) · filtering by the open file · new reasoning logic · incident-under-phase
    proof                   4 log/panel-replay.txt + 4 log/reasoning-panel.png
    stop                    any write from the panel, or a section line that differs from the CLI JSON it renders
    came from               Hermes chat 11-02 'yes do rest whatever. needed as planned'; backlog reasoning-surfaces; D90 'surfaced in the IDE and in the agent harness'
    links                   4 log/ledger.md (every transition + its evidence)
    harness
```
