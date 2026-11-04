# DRAFT -- NOT POSTED. Review and edit in your own voice before posting; Show HN has strict norms against
# marketing language and requires the poster to answer questions in the thread themselves.

## Title (Show HN character limit ~80)
Show HN: Mole – the team's decisions behind the code, checked against today's code

## Text (goes in the first comment, per Show HN convention)

Mole keeps a team's decisions (why a file is built the way it is, what broke before, what's intentionally
NOT done) as plain markdown files next to the code (`.mole/decisions/*.md`), then surfaces them exactly
where you're already working: a VS Code panel, a Claude Code plugin (session-start context, a guard on
edits to governed lines, a stop-time check), and an MCP server any agent can call.

What it's not: another AI memory tool. It doesn't try to remember what an agent did across sessions
(claude-mem, Entire and git-ai already do that well). It answers one narrower question: is a decision
still true for the code as it stands right now, at the function it governs, re-checked on every edit.

Honest numbers from our own testing (not independent, not at scale yet): a decision-conflict check caught
28/29 cases a model-based reviewer also caught (29/29), at about 1/13th the cost, with fewer false alarms
(4/60 vs 9/60). A 72-run productivity test on real tasks did NOT find a significant difference vs. no
context or a plain rules file -- we're not claiming Mole makes you faster yet, that test just isn't done.

Repo: https://github.com/raychu23/mole-code-map (GitHub Action, VS Code extension, MCP server, CLI --
npm/Marketplace publishing in progress).

Would love feedback especially from anyone running multiple coding agents against the same repo.
