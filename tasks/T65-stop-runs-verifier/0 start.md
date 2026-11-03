---
state: proposed
owner: hermes-build
repo:
branch:
worktree:
base:
reviewer:
updated: 2026-11-02 23:56
status: ledger proposed
next: fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
---
```notes
T65-stop-runs-verifier      ledger task (rules.md §3 code features)      project tasks
    goal                    The agent loop uses Mole's measured verifier: `mole cascade-check --worktree` checks uncommitted work (working tree incl. untracked snapshot as a temp commit built with a temp index: user's index, refs and files untouched) and the Claude Code Stop hook runs it when the repo has decision records, returning each violation with its decision, reason and evidence as the systemMessage (so the agent fixes it before finishing). Today stop.mjs runs only `mole check` (past fixes/questions) + T27 rule checks; the cascade (T46 + T53 routing, B2 97% catch) never runs in the loop. MOLE_STOP_VERIFY=0 turns it off.
    done-when               1 tests first (red) · 2 cascade-check --worktree == cascade-check --base HEAD --head <commit of the same tree> on fixtures (same verdicts), and git status / index / refs byte-identical after · 3 stop.mjs: violation → systemMessage naming decision id, verdict reason and file:line; no violation → unchanged output; --no-llm path when MOLE_STOP_VERIFY_LLM=0; never blocks or fails the session; respects hooks.json timeout (raise Stop to 120 s if measured need) · 4 sanity replay: dcbench copy + generated records + an export route without withAuditLog is flagged (D-002); the unmodified repo is not · 5 npm run check
    status                  2026-11-02 proposed
    next                    fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
    pinned
    mode                    one worker
    boundary                packages/decisions/src/cascade/cli.ts (+ a worktree snapshot helper), plugins/claude-code/scripts/stop.mjs + a new verify.mjs, hooks.json timeout, tests
    checks                  npm run check
    non-goals               changing cascade/route logic or thresholds · PreToolUse · lib.mjs (T64 in flight)
    proof                   4 log/replay.txt
    stop                    any write to the user's index, refs or working files; any hook that blocks or fails the session
    came from               T63 sanity 11-03 00:45: Stop hook's mole check missed an export without withAuditLog; cascade-check needs SHAs; USER D93
    links                   4 log/ledger.md (every transition + its evidence)
    harness
```
