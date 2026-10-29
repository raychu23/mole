```notes
T18 review round 2 (reviewer-T18-r2, fresh: no implementer chat seen; 2026-10-29)

verdict                 VERIFIED: 0 P0, 0 P1 · review-1 F1 F2 F3 F5 F7 fixed, F4 partly fixed (P2 below) · 3 P2

checks I ran (worktree at 807695a, fixes in 39baf15, load avg ~6)
    npm run check                                   → exit 0, Test Files 20 passed, Tests 145 passed (run twice, both exit 0)
    node packages/agentstate/dist/bench/m6.js      → exit 0, M6 100.0% (542/542; via edit 50, via commit 492)
    node packages/agentstate/dist/bench/m7.js      → exit 0, M7 recall 100.0% (3116/3116), wrong 0.8% (25 outcome), 10 sessions, 25 compactions

test diff (59fcb0d..HEAD, and 9add41d..HEAD)
    agentstate.test.ts, bench/m7.ts                unchanged since red 9add41d
    bench/m6.ts                                     unchanged since 59fcb0d (only key ruling 1's edit since red)
    attribute-quiet.test.ts                         additions only: 2 agents() asserts (F2) + 1 new test (F1 + F3)
    regression proof                                scratch copy (no git ops on the worktree) with packages/agentstate/src from 3262703:
                                                    both tests fail (agents() → [] ; EACCES thrown from listRuns); with 39baf15 src: 2 passed

review-1 findings, re-run with review-1's reproducers
    F1  fixed       unreadable s2.jsonl in root mode → "skipped claude-code …/s2.jsonl: unreadable: EACCES …", exit 0
    F2  fixed       mole agents packages/daemon/src/server.ts → the 4 commit steps 9e19c51 6a546ec fd7ed34 9224561 (hermes ec7893)
                    scale: every attribute() link on the M6 RANGE (542 links, 201 files) appears in agents(<file>): 0 missing
                    agents() now calls the same indexRuns/linkCommits as attribute(); ~1.1 s per call on this machine
    F3  fixed       chmod 000 claude folder → "skipped claude-code …/c2: not a readable directory", exit 0
    F4  partly      context.repo is now the run's own checkout (main for 38dbe5); last checkpoint no longer 9add41d. See R2-F1
    F5  fixed       local times + "times UTC-05:00" header in `runs` and `run` (see R2-F2 for DST)
    F6  open        key.md still says 26 compactions (key frozen under R2; KC-2 records it); left as is, not a finding
    F7  fixed       key-changes.md KC-1 evidence now ids + shas only

findings
R2-F1  P2  done-when 3: checkpoint gitSha can still be a task-branch commit that the run's checkout never had
    repro               node: getRun('20261015_064949_38dbe5', {root: <wt>}).checkpoints vs `git -C <main> reflog HEAD --date=unix`
    observed            25 of 1144 checkpoints differ (e.g. 2026-10-28T13:07:01Z gitSha e9cf5bb, a T10-branch commit merged later by
                        595d636; main HEAD then 22f4083) · run 20261019_180211_ec7893: 89 of 581 differ (8af8f81, 78c0c94: T1 branch)
    cause               timeline() uses `git log HEAD`: after a merge, the side branch's commits are in HEAD history with their own
                        commit times. The review-1 repro (9add41d) reappears once T18 itself is merged into main
    impact              AGENTS.md object id equal in all 4 sampled mismatches → stale/changed-context flags not affected here
    fix                 `git log --first-parent HEAD`, or the checkout's HEAD reflog where it covers the time

R2-F2  P2  the zone header uses today's UTC offset for every row
    cause               zone() reads new Date().getTimezoneOffset(); when() prints each time in its own local offset.
                        After DST ends (2026-11-01) runs from October print in CDT under a "times UTC-06:00" header (1 h off)
    fix                 print the offset per time, or convert every row with the header's fixed offset

R2-F3  P2  privacy wording: key-ruling-1.md quotes two truncated `git commit -qm "<subject prefix> …"` commands (bff4ba9, bdbb1ee).
           Same class as review-1 F7; subjects are public in git log, no chat prose. Suggest ids + shas only

no finding
    F4 side effects     repoOf() picks the longest scope dir holding the cwd (scopeDirs sorted by length), so worktree runs keep
                        their worktree; dirs stays scopeDirs(root) for any checkout in scope
    agents() symbol     #Symbol path still edit-only (commit steps only without a symbol), as before
    read-only           no new writes; sources still opened read-only
    privacy             no transcript text added in packages/ or tests (synthetic fixtures)
```
