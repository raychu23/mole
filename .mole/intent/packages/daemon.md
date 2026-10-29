---
folder: packages/daemon
purpose: One background process per repo that keeps the TypeScript index warm and answers map/impact requests for the editor, the CLI and the MCP server.
end_state: Starts on first use, survives editor reloads, stops on its own when nobody uses it (0007 with the 0008/0009 exceptions).
risk: Accepted that a cold start after an idle stop costs one full index; not accepted that the map stops while someone types.
ask: raymond
tenets: [tenet-2, tenet-3]
---

The CLI (`src/cli.ts`) is a thin client; heavy modules load only in the subcommand that needs them (0013).
