---
state: verified
owner: hermes-build
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t75-steer-own-package
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T75-steer-own-package
base:
reviewer: hermes-subagent deleg_8c98e468 PASS (fresh, claude-sonnet-5)
updated: 2026-11-03 05:26
status: ledger verified
next: merge → ledger move <task> integrated --merge … (ledger reruns checks in the repo)
claimed: 2026-11-03 04:43
---
```notes
T75-steer-own-package      ledger task (rules.md §3 code features)      project tasks
    goal                    Mole's own rule check (decision 0014: agent states are read-only over the harness transcripts; rule mole-0014-1 forbids write calls in packages/agentstate) fails on main after T74: packages/agentstate/src/steer/store.ts writes the steering inbox (7 violations, rules-check.test.ts dogfood test red, 1218/1219 pass). Respect the accepted decision instead of weakening it: move the steering inbox (write side: store, signal/update/deliver, validate, cli) into its own package @mole/steer that depends on @mole/agentstate only for the read-only query; agentstate goes back to zero write calls.
    done-when               1 rules-check dogfood test green (`mole rules` on Mole: 0 violations) · 2 steer behaviour unchanged: the T74 tests (steer.test.ts, steer-stress.test.ts, steer-hook.test.ts) move with the code and pass unchanged in substance · 3 daemon `mole steer` + plugin hooks work (hook tests) · 4 npm install, package-lock committed, tsc -b clean · 5 full npm run check green on the branch
    status                  2026-11-03 verified      reviewer hermes-subagent deleg_8c98e468 PASS (fresh, claude-sonnet-5) · findings: PASS: .mole untouched, mole rules 0 vi
    next                    merge → ledger move <task> integrated --merge … (ledger reruns checks in the repo)
    pinned
    mode                    one worker
    boundary                packages/agentstate/src/steer -> packages/steer (new), daemon cli, plugin scripts if they import it, tests, package-lock, tsconfig refs
    checks                  npm run check
    non-goals               changing decision 0014 or its rule; changing steering behaviour
    proof                   4 log/
    stop                    editing .mole/decisions/0014 or the rule to make the check pass
    came from               main check 11-03 05:40 after T74 merge: mole rules 7 violations of 0014
    links                   4 log/ledger.md (every transition + its evidence)
    harness
```
