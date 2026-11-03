---
state: submitted
owner: hermes-build
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t84-steer-inbox-bootstrap
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T84-steer-inbox-bootstrap
base:
reviewer:
updated: 2026-11-03 09:59
status: ledger submitted
next: fresh reviewer → ledger move <task> verified --reviewer … --findings …
claimed: 2026-11-03 08:35
---
```notes
T84-steer-inbox-bootstrap      ledger task (rules.md §3 code features)      project tasks
    goal                    Race in @mole/steer (T74/T75): the inbox bootstrap writeFileSync(canonical, ..., {flag:'wx'}) runs OUTSIDE the lock and is not atomic (create, then write), so a concurrent sender can take the lock and JSON.parse an empty file (store.ts:184 'Unexpected end of JSON input'), crashing sendSignal. Caught by the instrumented steer-stress test in T79's ledger check 11-03 08:33. Fix: atomic bootstrap (write temp file, linkSync to the canonical path, EEXIST = someone else won, unlink temp) and, under the lock, treat an empty inbox file (legacy crash mid-write) as an empty inbox.
    done-when               1 red test: an empty inbox file makes sendSignal throw today · 2 atomic bootstrap + empty-file tolerance · 3 steer tests incl. stress pass 3x · 4 no other JSON.parse of the inbox outside the lock can see a partial file (audit store.ts:69,108)
    status                  2026-11-03 submitted      report: tasks/T84-steer-inbox-bootstrap/2 insights.md, proof 4 log/red.txt (exact production error reproduced), green.tx
    next                    fresh reviewer → ledger move <task> verified --reviewer … --findings …
    pinned
    mode                    one worker
    boundary                packages/steer/src/store.ts + tests
    checks                  npm run check
    non-goals               changing the lock library or delivery semantics
    proof                   4 log/
    stop                    weakening the stress test
    came from               T79 ledger verified check 11-03 08:33, steer-stress sender error
    links                   4 log/ledger.md (every transition + its evidence)
    harness
```
