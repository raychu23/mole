---
state: submitted
owner: mole-builder-16
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t39-import-agent-session-logs
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T39-import-agent-session-logs
base: 23b81c1
reviewer:
updated: 2026-10-29 22:57
status: ledger submitted
next: fresh reviewer → ledger move <task> verified --reviewer … --findings …
claimed: 2026-10-29 22:40
---
```notes
T39-import-agent-session-logs      ledger task (rules.md §3 code features)      project tasks
    goal                    Unite existing agent-session memory into Mole's code-anchored store instead of rebuilding capture (USER 10-29 22:50: 'map oiut the logs from chats or like unite w ecisitng memory systems'): read Entire Checkpoints (entire/checkpoints/v1 branch or refs/entire/checkpoints, commit trailer → transcript, prompts, files touched, attribution), git-ai Authorship Logs (Git Notes refs/notes/ai: line → agent, model, prompt) and Agent Trace records (agent-trace.dev v0.1.0: file ranges + content_hash → conversation), map each session's intent onto the functions it touched (T11 anchors), and re-check that intent like any note: flag it when a later edit changes the function. No capture of our own where one of these exists; Mole's own T18 reader stays the fallback for Claude Code/Hermes logs
    done-when               1) M33 key written before code: 3 fixture repos (one per format, generated with the real tools' documented formats or their published examples) with >= 30 labeled (session, function) links → recall >= 95%, wrong links 0; 2) after planted later edits, stale-intent flags 100% recall, 0 false on whitespace/comment-only edits; 3) the VS Code hover shows the intent with its source tool; 4) 0 model calls; 5) npm run check green
    status                  2026-10-29 submitted      report: Entire/git-ai/Agent Trace import onto function anchors, M33 MET (recall 100% 30/30 wrong 0, stale recall 100% 6/
    next                    fresh reviewer → ledger move <task> verified --reviewer … --findings …
    pinned
    mode                    code
    boundary                packages/agentstate/src/importers/** (new), tasks/T39-import-agent-session-logs/**, one import + one call in packages/mcp/src and apps/vscode
    checks                  npm run check && node packages/agentstate/dist/bench/m33.js
    non-goals               no new capture hooks where Entire/git-ai/Agent Trace already capture · no paid API or model calls · no Raymond accounts · don't edit the M33 key after the red-tests commit
    proof                   runs.jsonl M33 + npm run check + red-tests commit first + fresh reviewer verdict
    stop                    3 identical check failures (R3) · format docs unavailable offline → log + stop
    came from               USER 2026-10-29 22:50 (systems/resume/ask 2026-10-29 2250.txt) · D45 OPEN: launch only on his go
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
