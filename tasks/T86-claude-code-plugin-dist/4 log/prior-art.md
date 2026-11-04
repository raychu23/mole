# T86 prior art: Claude Code plugins, plugin manifest, marketplaces (fetched 2026-11-03)

Sources fetched today (browser, full page text, not snippets) + one web-search result set used to
cross-check field names. All on code.claude.com (Anthropic's official Claude Code docs), the canonical
reference per AGENTS.md's instruction to treat it as authoritative for Hermes/Claude Code questions.

1. https://code.claude.com/docs/en/plugins-reference (fetched 2026-11-03)
   - Standard plugin layout: `.claude-plugin/plugin.json` (manifest, optional), `hooks/hooks.json` OR inline
     `hooks` in plugin.json, `.mcp.json` OR inline `mcpServers` in plugin.json, `scripts/`, `commands/`,
     `agents/`, `skills/`, `bin/` (added to PATH). Only `.claude-plugin/` is special; every other directory
     lives at the plugin root, never inside `.claude-plugin/`.
   - `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}`, `${CLAUDE_PLUGIN_OPTION_*}` and `${CLAUDE_PROJECT_DIR}`
     are exported as env vars to hook/MCP/LSP subprocesses; `${CLAUDE_PLUGIN_ROOT}` substitutes inline in
     `command`/`args` for both hook commands and MCP `stdio` servers.
   - Full plugin.json schema: name, displayName, version, description, author{name,email,url}, homepage,
     repository, license, keywords, metadata, skills, commands, agents, hooks, mcpServers, outputStyles,
     lspServers, experimental, dependencies.

2. https://code.claude.com/docs/en/plugins/manifest-reference (fetched 2026-11-03)
   - Confirms the three path variables and exactly which fields substitute them per component; MCP `stdio`
     servers substitute `command`, `args`, `env`.
   - `${CLAUDE_PLUGIN_ROOT}` changes when the plugin updates (points at the install dir of THIS version) --
     never write state there; use `${CLAUDE_PLUGIN_DATA}` for anything that must survive an update (installed
     node_modules, caches). This is why our build output (dist/) stays plugin-root-relative, not
     plugin-data-relative: it's build output checked in/produced with the plugin, not runtime state.

3. https://code.claude.com/docs/en/plugins/marketplace-reference (fetched 2026-11-03)
   - `.claude-plugin/marketplace.json` at the marketplace root (here: repo root). Required top-level fields:
     `name`, `owner`; each `plugins[]` entry needs `name` + `source` at minimum.
   - Plugin `source` as a bare string (e.g. `"./plugins/claude-code"`) is a **relative path within the
     marketplace repo**, resolved from the marketplace root (the dir containing `.claude-plugin/`), not from
     `.claude-plugin/` itself, and must start with `./`. Other source kinds: `github`, `url`, `git-subdir`,
     `npm`, `archive`, `command` (the last runs a local build command to produce the plugin dir).
   - Claude Code copies an installed plugin into `~/.claude/plugins/cache` and installs its eligible Node
     package deps -- i.e. a relative-path source does NOT run any build step itself. For our case this means
     the repo's checked-in plugin directory is installed byte-for-byte; a prebuilt `dist/` (built by
     `plugins/claude-code/scripts/build.mjs`) is what makes that directory self-contained.

4. https://code.claude.com/docs/en/hooks (fetched 2026-11-03)
   - Exact JSON input shapes used for the standalone smoke test's sample stdin: SessionStart
     (`session_id`, `transcript_path`, `cwd`, `hook_event_name`, `source`, ...), UserPromptSubmit (+`prompt`),
     PreToolUse (+`tool_name`, `tool_input.file_path` always absolute, backslash-normalized on Windows), Stop
     (+`stop_hook_active`, `last_assistant_message`). Output: `hookSpecificOutput.additionalContext` for
     SessionStart/PreToolUse/UserPromptSubmit; `systemMessage` (or `decision:"block"`+`reason`) for Stop.
   - Confirms the existing plugin's hooks already follow this shape (scripts/lib.mjs's header comment already
     cites this exact page); nothing in this task changed the hook I/O contract, only how the scripts find
     their CLI dependency and what ships alongside them.

5. https://code.claude.com/docs/en/plugin-marketplaces (fetched 2026-11-03, via search result + confirmed
   against marketplace-reference above) -- a worked example of plugin.json + marketplace.json side by side,
   matching the shapes used in sources 1-3; used only to cross-check field names, not as a separate source of
   new facts.

## What this task borrows from the docs (not invented)
- marketplace.json at the repo root, one entry with `source: "./plugins/claude-code"` (source 3).
- plugin.json version bump with the documented optional fields that apply (displayName; author/license/
  keywords already present) -- homepage/repository skipped: there is no public URL for this private repo yet,
  and the docs list them as optional.
- `${CLAUDE_PLUGIN_ROOT}`-relative paths in `.mcp.json` and `hooks/hooks.json` (already followed before this
  task for the hook scripts; this task fixes `.mcp.json`'s one remaining `../../packages/...` escape so the
  whole plugin resolves inside its own directory, per source 1/2's variable semantics).

## What prior art did NOT answer (own design, stated as such)
- How to bundle a TypeScript-workspace CLI + MCP server with native (better-sqlite3) and ESM-top-level-await
  dependencies into a single portable plugin directory is not covered by the Claude Code docs (they describe
  the plugin contract, not how to build one). This repo already has a working precedent for most of it --
  apps/vscode/esbuild.mjs, which bundles the same @mole/daemon CLI + worker for the VS Code extension's .vsix
  (same import.meta.url shim, same dependency-cruiser external-and-degrade pattern) -- so this task's
  scripts/build.mjs follows that file's approach rather than inventing a new one, and only adds what vscode's
  case didn't need: an MCP server bundle and a vendored native module. The MCP-specific ESM/CJS bundling
  problem (esbuild's ESM output can't shim a CJS dependency's dynamic `require`) was diagnosed empirically
  against this repo's own real dependencies (typescript, yaml) and resolved by moving the one `await` the MCP
  entry point needs into a wrapper function so the whole bundle can stay CommonJS like the other two -- this
  is a build-tooling workaround, not a documented Claude Code feature, and is called out as such in
  scripts/build.mjs's own comments.
