# MCP server (`mole-mcp`)

## Core (default) vs opt-in (T113, D77 "cut to a core")

By default `mole-mcp` registers only 5 **core** tools -- an intent-based set covering the two jobs Mole's own
evidence backs ("why is this code like this", "is the agent's hand-back true") plus what changed since you last
looked:

| tool | job |
|---|---|
| `mole_map` | the neighbourhood of a file/symbol (read this before touching unfamiliar code) |
| `mole_decisions` | the decisions/tenets governing the code you're about to touch, with their flags |
| `mole_check` | past fixes + guarding tests + up to 3 questions for a change (the "is it true" gate) |
| `mole_claims` | an agent run's own claims checked against its tool calls and git |
| `mole_tried` | what an agent run already tried (commands/tests/edits), so a retry doesn't repeat it |

Every other tool this package ships (`mole_collisions`, `mole_priorities`, `mole_incident_suggest`,
`mole_proposals_compare`, `mole_recall`, `mole_hotspots`, `mole_coupling`, `mole_outcomes`, `mole_oneonone`,
`mole_compile_draft`, `mole_compile_review`, `mole_cascade_check`, `mole_agent_intent`, `mole_coverage`,
`mole_interrogate`, `mole_decisions_asof`) still exists, is still fully tested
(`packages/mcp/test/tool-annotations-schema.test.ts` proves the whole roster's schemas, not just the core 5), and
still works exactly as documented in `packages/mcp/src/server.ts` -- it is just not advertised to a client by
default, so a model choosing among tools sees 5 short entries instead of 21. Measured (T113):
`tasks/T113-core-cut/4 log/mcp-tool-measurement.txt` -- the default tool-description payload is ~1,601 tokens vs
~6,553 tokens for the full set (~76% smaller), at a 4 chars/token estimate.

Set `MOLE_MCP_ALL_TOOLS=1` in the environment (stdio `mole-mcp`/`mole-mcp-http`), or pass `allTools: true` to
`createServer()`/`startMoleHttpServer()` directly, to get every tool back. This is reversible and config-only:
no tool's behavior, schema or annotations changed, only which ones get registered by default.

## How to use

`mole-mcp` is a stdio MCP server bundled in the `mole-code` npm package. Point any MCP client's command at
it with no arguments; it picks the repo from `MOLE_ROOT` (env var) or the current working directory. See the
root README's "Install → MCP, any client" section for Codex/Cursor/Gemini CLI/Claude Desktop config
snippets.

Exposed tools mirror the CLI's read paths (map/impact, decisions, check, recall, outcomes, and more — see
`packages/mcp` for the exact tool list and schemas shipped in a given version). All are read-only queries
over the same on-disk state the CLI and VS Code extension use; none of them write to your repo or call out
to a model.

## What it reads / writes

- **Reads:** the same files as the equivalent CLI command (source tree, `.mole/decisions`, `.mole/notes`,
  the index database).
- **Writes:** nothing from the MCP tools themselves. The first `mole_map`/`mole_impact` call may start the
  same short-lived background daemon the CLI's `map`/`impact` commands do, which writes the index under
  `.mole/`.

## Limits

- No authentication layer: anything that can start the `mole-mcp` process can query your repo's decisions
  and map — treat it like any other local dev tool, not a networked service (it only ever listens on stdio).
- Same per-feature limits as the CLI commands it mirrors (TypeScript-only `map`/`impact` indexing;
  `rules` enforcement also reads a pre-built SCIP index for other languages, see
  `docs/decisions-and-rules.md`) — see the other docs pages.
