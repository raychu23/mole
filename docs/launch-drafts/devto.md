# DRAFT -- NOT POSTED. Dev.to supports longer, more tutorial-shaped posts than HN/Reddit; expand the
# "how it works" section with a real code sample before posting (pull a real .mole/decisions/*.md example
# from this repo, redacted of any private references the same way scripts/export-public.mjs already does).

## Title
Decisions behind the code: a tool that re-checks your team's "why" on every edit

## Tags
mcp, ai, devtools, opensource

## Body (outline -- flesh out before posting)

1. The problem: a team writes down why a thing is built a certain way once, in a design doc or a Slack
   thread, and it's never checked again. Six months later an agent (or a person) undoes the reasoning
   without knowing it existed.
2. What Mole does differently from memory tools (claude-mem, Mem0, ai-memory): those remember WHAT happened;
   Mole checks whether a specific, anchored decision is still TRUE for the code as it is right now.
3. How it's anchored: `.mole/decisions/*.md` files with a `rules:` block naming the functions/files a
   decision governs; a daemon re-checks the anchor on every file-change event.
4. Where it shows up: VS Code panel, Claude Code plugin (SessionStart/PreToolUse/Stop hooks), MCP server
   (`mole_map`, `mole_check`, `mole_decisions`, and more -- full list in packages/mcp).
5. What we measured and didn't inflate: [link the B2/B3/T79/T63 numbers from channels.md's "VERIFIED
   RESULTS" -- cite them exactly, never round up].
6. Try it: npm install (once published), the GitHub Action for PR checks, or add the MCP server to any
   client (see docs/install-mcp-clients.md in the repo).

Repo: https://github.com/raychu23/mole-code-map
