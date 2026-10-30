```notes
T39 insights      build 2026-10-30 (mole-builder-16/a21)
    M33 result      link recall 100% (30/30), wrong 0; stale-flag recall 100% (6/6); false-on-whitespace 0/3; model calls 0
                    all targets MET (>=95% recall wrong 0, 100% stale recall, 0 false, 0 model calls) · tasks/T39-import-agent-session-logs/4 log/runs.jsonl
    scope honestly  M33's fixtures test the 3 parsers + anchor/recheck logic against hand-built content in each documented format -- the thing that is
                    actually measurable and frozen before code. The 3 real-repo readers (src/importers/external.ts: git-ai via `git notes --ref=ai`,
                    Entire via the entire/checkpoints/v1 git-branch backend, Agent Trace via a `.agent-trace/*.json` sidecar convention) are best-effort
                    and NOT separately exercised by M33 (no repo in this environment actually runs any of the three real tools to test against). This is
                    the known gap, not a hidden one: see 4 log/prior-art.md addendum.
    entire gap      only the legacy git-branch backend (entire/checkpoints/v1, one shared ref) is walked. The newer default git-refs-per-checkpoint
                    backend (refs/entire/checkpoints/<shard>/<id>) has no single enumerable ref from outside Entire's own CLI's index -- would need either
                    `git for-each-ref 'refs/entire/checkpoints/**'` (works once any such ref exists) or shelling to `entire checkpoint list`. Decision:
                    add the for-each-ref variant if/when Raymond points this at a real Entire-using repo; not invented here untested.
    agent-trace gap the v0.1.0 spec itself does not define a standard on-disk storage location (unlike Entire/git-ai, which both commit to git objects);
                    the `.agent-trace/*.json` sidecar convention here is this reader's own inference from how Cognition/Jujutsu integrations are described,
                    not a documented path. Labelled INFERENCE in the code comment and in prior-art.md.
    connected       mole_agent_intent MCP tool (packages/mcp/src/server.ts, one import + one registerTool call); `mole agent-intent <target>` CLI
                    (packages/agentstate/src/cli.ts, registered in packages/daemon/src/cli.ts's existing agentstate dispatch array); the VS Code one-panel
                    'agents' section (apps/vscode/src/panelData.ts Runners.agentIntent + panelRunners.ts, one import + one call each) -- same function,
                    3 callers, so T39 shows up where T18/T21/T24 already do instead of a 4th separate surface.
    environment gap `generated data/m0-engine-report.json` is gitignored and was missing in this fresh worktree (T41/T25's dependency), copied in from the
                    main checkout to get `npm run check` green here; not a T39 regression (same note as T25's handoff 2026-10-30 22:35).
    re-check design recheckIntents reuses T11's own normalizedHash (via @mole/memory symbolsInFile), so "a later edit changes the function" means exactly
                    what it means for a T11 note: whitespace/comment-only edits never flag, any token-level body change always does. No separate staleness
                    logic was invented for T39.
```
