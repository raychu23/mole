---
state: proposed
owner: hermes-build
repo:
branch:
worktree:
base:
reviewer:
updated: 2026-11-02 23:50
status: ledger proposed
next: fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
---
```notes
T64-hooks-route-by-meaning      ledger task (rules.md §3 code features)      project tasks
    goal                    Mole's Claude Code hooks surface decisions with no file scope by MEANING before the agent edits: (1) a record with no scope: counts as repo-wide (today it is never surfaced pre-edit); (2) repo-wide decisions are ranked by BM25 (T53's scoring, mirrored dependency-free in lib.mjs with a parity test) against the text of the moment instead of id order; (3) new UserPromptSubmit hook injects the top decisions for the task prompt once per session; (4) PreToolUse ranks by the edited path + new text. Found by T63 prep: on dcbench's 15 unscoped decisions every pre-edit hook printed nothing.
    done-when               1 tests first (red) · 2 lib.mjs bm25 scores == packages/decisions/src/route/bm25.ts on a fixture corpus (parity test) · 3 unscoped + repo-wide records ranked by BM25 against the prompt / edit text, top REPO_WIDE_CAP with score > 0, zero-score dropped; with no text the old id order stays · 4 user-prompt-submit.mjs registered in hooks.json, emits additionalContext once per decision per session, never blocks, silent when nothing scores · 5 existing plugin tests unchanged and green · 6 replay on the dcbench repo copy with the generated records: the CSV-export prompt (TASK-001) surfaces D-002 (audit log) in the top 5 — recorded, NOT tuned against (protocol freeze rule) · 7 npm run check
    status                  2026-11-02 proposed
    next                    fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
    pinned
    mode                    one worker
    boundary                plugins/claude-code/scripts/{lib,pre-tool-use,session-start,user-prompt-submit}.mjs, hooks.json, plugin tests
    checks                  npm run check
    non-goals               LLM stage (zero-LLM only in hooks) · changing check/route.ts · dcbench-specific wording or thresholds
    proof                   4 log/replay.txt
    stop                    any hook that blocks or fails the session, or a threshold chosen by looking at dcbench gotchas
    came from               T63 prep 11-02 23:59: session-start and pre-tool-use print nothing for unscoped records; USER D93 build everything
    links                   4 log/ledger.md (every transition + its evidence)
    harness
```
