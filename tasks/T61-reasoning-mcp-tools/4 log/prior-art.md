# T61 prior art — reasoning features as MCP tools (fetched 2026-11-02)

```notes
source                                       what it says                                         we borrow
MCP spec 2025-06-18 server/tools             outputSchema + structuredContent; a tool returning   every tool: outputSchema, structuredContent = the
  raw.githubusercontent.com/modelcontext…    structured content SHOULD also return it as a        library's JSON, same JSON as a text block
  /docs/specification/2025-06-18/server/     TextContent block · invalid input / business logic  library errors (unknown phase, incident, path) →
  tools.mdx                                  errors → result with isError: true, not a protocol   isError result with the message, never a throw
                                             error
MCP schema 2025-06-18 ToolAnnotations        readOnlyHint "does not modify its environment"; all  readOnlyHint true + openWorldHint false (local
  schema/2025-06-18/schema.ts                annotations are HINTS, clients must not trust them   files only) · the hint is backed by a test that
                                                                                                  git status + .mole mtimes are unchanged
github/github-mcp-server README (main)       --read-only: "write tools are skipped … even if      ship only the read half (priorities, incident
                                             explicitly requested"                                suggest, proposals compare); accept/dismiss/
                                                                                                  create stay CLI = a person's act (T58/T59 rule)
this repo: packages/mcp server.ts +          READ_ONLY_ANNOTATIONS, sc(), executeTool pattern,    same helpers; add the 3 names to READ_ONLY_TOOLS
  tool-annotations-schema.test.ts (T50)      READ_ONLY_TOOLS list enforced by listTools()
```
