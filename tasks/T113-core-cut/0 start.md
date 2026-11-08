# T113 core cut (Q7, D77 "19 Can it stand up.md" fix 5)

## Goal
Cut Mole to a core (Wealthfront/Iris simplicity): define the core (decisions + rules + verifier + engine +
VS Code / Claude Code / PR check surfaces), mark other packages and commands experimental in docs + CLI help
(no deletions of tested code without a usage check), reduce the MCP default toolset to ~5 intent-based tools
with the rest behind an opt-in flag (keep tests green, update docs/mcp.md), one-page README core section.
Measure: MCP tools exposed by default, tool-description tokens before/after.

## Done-when
- [x] MCP server exposes 5 core tools by default; the other 16 are gated behind `allTools`/`MOLE_MCP_ALL_TOOLS=1`,
      unchanged in behavior/schema, still fully tested.
- [x] docs/mcp.md documents the core/opt-in split and the measured token reduction.
- [x] CLI help (`mole --help`) marks experimental command groups, every dispatched command still present
      (`packages/daemon/test/cli-help.test.ts` still passes word-for-word).
- [x] README.md has a one-page "Core" section naming decisions+rules / verifier / engine / 3 surfaces.
- [x] Nothing deleted: every package/command still builds, still has its own tests, still runs.
- [x] Measured and logged: tools exposed by default (5 vs 21) and tool-description token estimate
      (~1,601 vs ~6,553, ~76% smaller).

## Status: done, awaiting review/merge

## Scope decision (see `4 log/prior-art.md`)
The plan doc's "MCP 9 -> 5" section describes merging/renaming tool implementations (e.g. one `mole_agents_here`
tool folding `mole_tried` + `mole_agent_intent` + `mole_coverage`). That is a deeper refactor than this bounded
task allows under AGENTS.md's "no deletions of tested code without a usage check" and the queue brief's
scope rules. Implemented instead: **exposure gating** -- the existing 21 tools are untouched in code, schema
and tests; only which ones get *registered* by default changed. This satisfies the literal Q7 ask ("reduce the
MCP default toolset to ~5 ... with the rest behind an opt-in flag") without the larger, riskier consolidation.
Tool/package consolidation is named here as a candidate follow-up, not done.

Core 5 chosen from the repo's own proven jobs (`context/product-plan/19 Can it stand up.md` scorecard: B1/B2
PARTLY-to-PROVEN claims track "why is this code like this" and "is the agent's hand-back true"):
`mole_map`, `mole_decisions`, `mole_check`, `mole_claims`, `mole_tried`.

## Next
- If Raymond wants the literal tool-merge (`mole_agents_here`, `mole_questions` renames) later, that is a
  separate, larger task: new tool names, new schemas, a migration note for any existing client config.
- Package-level merges (21 -> 14 packages) from the same cut-down doc were NOT done here (code-structure
  change, separate from "mark experimental in docs", out of this task's scope).

## Checks run (targeted, per brief -- orchestrator runs full `npm run check` after merge)
- `npx tsc -p packages/mcp/tsconfig.json --noEmit` -- clean (`4 log/` -- no errors to log)
- `npx tsc -b packages/mcp packages/daemon` -- clean
- `npx vitest run packages/mcp/test/` -- 14 files / 56 tests passed (`4 log/vitest-final-green.txt`)
- `npx vitest run packages/daemon/test/cli-help.test.ts` -- 3/3 passed (`4 log/vitest-cli-help.txt`)
- RED proof before GREEN: `4 log/red1.txt` (the new core-cut test fails against the pre-change server.ts/cli.ts)
- Measurement: `4 log/mcp-tool-measurement.txt`
- NOT RUN: full `npm run check` (brief: orchestrator runs it after merge); root-level `knip`/package-count
  audit (out of this task's scope, see "Scope decision" above).
