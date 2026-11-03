# T62 insights — Reasoning section in the VS Code sidebar

## Summary
The Mole sidebar panel now has a "Reasoning" section: the phase in force with its tenet order, what changed when it
started (or what changes at the next phase) with the winning attack, both tenets and ranks; incidents and the dissent
they may revive (with the CLI command a person runs to accept); and each proposal's decision changes vs its baseline.
Read-only; every line is rendered from the same CLI JSON agents get over MCP. Proven in a real Extension Development
Host window on the python-tuf ADR 0002 replay (4 log/reasoning-panel.png). Open: incidents and proposals are judged
without the phase in force (backlog incident-under-phase).

```notes
data            panelData.ts buildReasoning: 3 parts (phase · incidents · proposals), each failing alone (part());
                section status from the parts: all failed → unavailable/error · nothing recorded → empty · else ok
phase           `mole priorities list` + `mole priorities --at <today>` (no flag = plain engine by T60 design: found in
                the replay) + compare earlier → later: next phase if any, else previous → current (reads forward in time)
render          webview/reasoning.ts pure data → HTML (since.ts idiom) · all record strings escaped · accept shown as
                the CLI command, no button (a person's act) · panel.ts ORDER + countOf + scrollTo message
one source      listProposals / summarizeProposals moved from packages/mcp into @mole/proposals; MCP + daemon
                `mole proposals` + panel use it; MCP keeps "no proposals" as isError (its T61 contract)
incident list   `mole incident list` → incidentSummary (title from the record via T58's readIncident; the graph's
                incident node title is the id — loader left untouched, it is shared)
proof           4 log/panel-replay.txt (extension runners → bundled daemon.cjs → section JSON + HTML) ·
                4 log/reasoning-panel.png (real window, cropped to it; full-screen capture deleted) · replay repo
                git status clean after both
tests           apps/vscode reasoning-section 12 · proposals list 2 · decisions incident list 1 · red 3 + missing module
                first (4 log/red.txt) · the direction-wording test was changed with its code in one step (not red first)
gap             INFERENCE: incidents (0 candidates) and proposals (contested → defeated) use plain Dung, not the phase
                in force · backlog incident-under-phase widened to proposals
```

## 11-02 23:10 review 1 (deleg_b945a465) PASS
- real CLI JSON → render checked: 3 phases with current in the middle, via-only flip, two because args, escaping
  through real data, unreadable incident (own line), unknown proposal, different baselines, runner throw / bad JSON /
  hang (15 s execFile timeout) → one-line errors · no writes · MCP output identical after the move · 485 tests
- notes kept: panel.test title says "8 sections" (stale, assertions use SECTION_IDS) · a hang's fallback message
  echoes the invoked command line (local paths)
