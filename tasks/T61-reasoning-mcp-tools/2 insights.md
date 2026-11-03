# T61 insights — reasoning features as read-only MCP tools

## Summary
Agents in any MCP harness (Claude Code, Hermes, Codex) can now call three read-only Mole tools: `mole_priorities`
(judge the decisions under a phase's tenet order, or compare two phases), `mole_incident_suggest` (losing arguments an
incident may revive) and `mole_proposals_compare` (this repo's what-if proposals vs their baseline). Each returns the same
JSON as its CLI. Accept/dismiss/create stay CLI-only, a person's act. Replay over real stdio on python-tuf ADR 0002:
the phase compare explains ADR-0002's flip; the proposal compare finds both proposals itself; repo unchanged.
Open: incident suggestions ignore the phase in force (0 candidates when arguments attack each other).

```notes
tools           reasoning-tools.ts · one register line in server.ts · READ_ONLY_ANNOTATIONS (readOnly, closed world)
equal to lib    each test compares structuredContent with the library call on the same temp repo (7 tests, red 7/7 first)
errors          unknown phase / incident / proposal → isError result with the library message (MCP 2025-06-18)
no paths in     proposals tool takes NAMES; it lists `git worktree list` and keeps worktrees whose meta.repo is this repo
                (an agent cannot point it at any folder) · prior art github-mcp-server --read-only
no writes       fingerprint test: git status + every file's mtime/size unchanged, repo and proposal worktrees
replay          4 log/mcp-replay.txt (stdio StdioClientTransport → packages/mcp/dist/cli.js, MOLE_ROOT = scratch copy)
gap             INFERENCE: suggestRevivals uses plain Dung; under T60 tags best-effort ⇄ parallel are both undecided,
                so the incident finds nothing to revive · backlog incident-under-phase
mcp tests       9 files, 22 tests
```

## 11-02 22:25 review 1 (deleg_ef4c137c) FAIL → fixed tests-first (2 red → green)
- HIGH a hand-written mole-proposal.json in an unrelated linked worktree was listed as a proposal (same name twice)
  → a proposal must ALSO have its own branch checked out: meta.branch = mole/proposal/<name> = the worktree's branch
  (createProposal's naming, proposals.ts:131) · one branch per worktree → names unique
- LOW limit 0 refused by the schema while the library returns [] → nonnegative, passed through
- confirmed OK by the reviewer: temp snapshot dirs removed, JSON round-trip loses nothing, compare+phase isError,
  different baselines isError, non-git root, prunable worktrees skipped, stdio tools/list, nothing written
- left: mole_priorities outputSchema is passthrough (validates anything) · mcp 24 tests
