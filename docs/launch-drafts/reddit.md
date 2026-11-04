# DRAFT -- NOT POSTED. Pick one subreddit (r/ClaudeAI fits the Claude Code plugin angle best; r/mcp fits
# the MCP-server angle; check each subreddit's self-promotion rules before posting -- several require a
# minimum account age/karma or a specific flair). Edit in your own voice.

## Title
I built a tool that checks whether a team's past decisions are still true for the code, not just stored

## Body

Most "AI memory" tools (claude-mem, Mem0, ai-memory) are great at REMEMBERING things across agent sessions.
None of them check whether what's remembered is still TRUE for the code as it exists right now.

Mole does one narrower thing: your team's decisions (why something is built the way it is, what broke
before, what's deliberately not done) live as markdown files next to the code, anchored to the functions
they govern. On every edit, Mole checks whether that anchor still matches -- if a function was gutted or
rewritten, the decision gets flagged stale instead of silently going out of date.

It shows up as a VS Code panel, a Claude Code plugin (puts the relevant decisions in context when a
session starts, warns before an agent edits a governed line, checks at stop), and an MCP server any
MCP-capable agent (Cursor, Codex, Gemini CLI, etc.) can call directly.

Not claiming a productivity win yet -- ran a 72-task pre-registered test and it wasn't statistically
significant vs. no context or a plain rules file. Being upfront about that because most launch posts
aren't.

Repo (MIT): https://github.com/raychu23/mole-code-map

Happy to answer questions about the MCP tool schemas, the decision file format, or the test design.
