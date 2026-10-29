---
state: submitted
owner: mole-builder-5
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t24-agent-claim-check
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T24-agent-claim-check
base: 80e2ca0
reviewer:
updated: 2026-10-29 07:09
status: ledger submitted
next: fresh reviewer → ledger move <task> verified --reviewer … --findings …
claimed: 2026-10-29 05:08
---
```notes
T24-agent-claim-check      ledger task (rules.md §3 code features)      project tasks
    goal                    Check what an agent says it did against what it did: parse an agent's final answer for claims ('tests pass', 'fixed X', 'updated file Y', 'committed') and verify each against its own transcript (tool calls + their results, from T18's run states) and the git state; flag claims with no or contrary evidence (3C1 line 672: 'verificatn: sure thing u tell it to do actually done')
    done-when               1) mole claims <run> lists each claim → evidence (tool call id, exit code, commit) → supported / unsupported / contradicted, deterministic matchers only (sentence split + patterns, no model call tonight, a model splitter stays a later option), 2) M16 bench: 40 final answers from Hermes + Claude Code sessions, labeled before the code (incl. the builder chat's own self-corrected 'exit 0' runs.jsonl line) → recall >= 90% of unsupported/contradicted claims, false flags <= 10%, 3) Stop-hook output names the unsupported claims in one line each, 4) failure case: an answer with no checkable claims → 'nothing to check', exit 0, 5) npm run check passes
    status                  2026-10-29 submitted      report: packages/agentstate/src/claims: answers.ts (turn-final answers, read-only), split.ts (sentence/clause split + pa
    next                    fresh reviewer → ledger move <task> verified --reviewer … --findings …
    pinned
    mode                    code
    boundary                packages/agentstate/src/claims/** + packages/agentstate/bench/m16*, packages/daemon/src/cli.ts (register the subcommand with one import + one call only), packages/mcp/src (new mole_claims tool only), plugins/claude-code/** (Stop hook output line only), tasks/T24-agent-claim-check/**
    checks                  npm run check && node packages/agentstate/dist/bench/m16.js
    non-goals               no PR comments/bot (D24) · no structure-map work (D23) · prototype/ rejected · no publishing or pushing · Raymond's accounts never used · no paid API or model calls from Mole code · don't edit benchmark keys after the red-tests commit (R2) · shared registries (MCP tool list, CLI usage, workspace deps) tested with toContain, never an exact set
    proof                   runs.jsonl last line with the metric + npm run check output + the red-tests commit sha dated before the first implementation commit + the fresh reviewer's verdict
    stop                    same check failure 3 rounds in a row (R3) · needs Raymond's accounts, paid API spend, people or a product decision (log it in 4 log, move on to the next task)
    came from               USER 2026-10-29 06:15 pasted vertical-AI chat ('does this info add anything useful … critically understand and expand') · Vertical AI chat, checked.md · D29
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
