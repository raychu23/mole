```notes
T18 key ruling 1 (loop rules R2/R7; fresh reviewer, no implementer chat seen; 2026-10-29)

ruling                  ACCEPT KC-1 WITH CHANGES: the subject/ledger evidence is accepted, the proposed time window is not
    why accept          the frozen rule is factually wrong for how these agents commit: `git commit -q[m]` prints no sha, so the
                        step that made the commit can never show the sha in its own result (verified for all 9 miss commits below)
    why change          the proposed window (call time in [commit − 1800 s, commit + 60 s]) accepts a call that STARTED AFTER the
                        commit, and ledger naming (task + target state) matches 2–4 calls inside 30 min for 30+ ledger commits.
                        That is looser than the sha rule, which ties the result to that exact commit.
    required rule       accept a commit link with no sha in the result only if ALL hold:
                        (a) a shell/code tool in the call matches COMMIT_CMD and its args name the commit: subject prefix
                            (e.subject up to the first " ' ` $ \, max 50 chars, min 12 chars) is a substring of the args, or for
                            'ledger move: <task> <a> → <b>' / 'ledger new: <task> proposed' the args contain `ledger`, the task's
                            last path part, and (move) <b> as a whole word
                        (b) the commit happened while the call ran: call time <= commit time + 2 s AND result time (link's
                            resultRow) >= commit time − 1 s (git %ct is truncated to the second; observed call lag up to +0.8 s)
                        the existing result-time window [ct − 120, ct + 1800] stays. The sha rule stays as is.

evidence (hermes ~/.hermes/state.db, opened read-only; git in this worktree)
    bench now               node packages/agentstate/dist/bench/m6.js → M6 94.8% (514/542), 28 misses in 9 commits, all
                            "result does not contain the sha"
    library links (attribute() on RANGE, 9 miss commits) and the raw rows they point at:
      bff4ba9  call 34064 / res 34065   call +0.6 s, res +0.9 s   `git commit -qm "T11 run log: round 4 …"`, result = unrelated grep
      46f879d  call 34183 / res 34184   −41.0 / +0.8             npm run check, then two -q commits; 2nd is this subject
      bdbb1ee  call 34223 / res 34224   +0.2 / +0.6              `git commit -qm "T12 run log: correct …"`, result "ok"
      c1cd1d2  call 34416 / res 34417   −0.6 / +0.2              2nd -q commit "T14 run log: rounds 1-2"; result shows the 1st sha only
      a0b46a9  call 34747 / res 34748   +0.3 / +1.3              -qm commit, then a ledger move prints a DIFFERENT sha (1824f59)
      ac8e02d  call 31080 / res 31081   −0.1 / +0.6              `git commit -q -m "T10 review fixes: …"` then merge
      cfcce41  call 30088 / res 30089   +0.8 / +21.3             -q commit, then ledger move prints another sha (3f905f8)
      9224561  call 18481 / res 18484   +0.3 / +4.4              `git commit -q -m "T2: core Neighborhood types, …"`
      637956f  call 19210 / res 19211   +4.3 / +4.6              WRONG STEP, see counterexample
    all 8 non-ledger links: the linked call is the one that made the commit (read the args; unique match under rule (b))

counterexample (proposed rule verifies a wrong link)
    637956f  ledger move: tasks/T2-m1-per-file-map verified → integrated   commit 13:39:42 -0700
      19208  call −17.4 s, result +1.1 s, output ""          ledger move … T2-m1-per-file-map integrated   ← made the commit
      19210  call +4.3 s, result +4.6 s, output "ledger: integrated → integrated not allowed"   ← failed retry
      the library links 19210 (it takes the LATEST match in the window); KC-1's +60 s bound and task+state naming accept it.
      KC-1's evidence line names 19208, and its "542/542" claim counts the 19210 link. Candidates in KC-1's window: 19199,
      19201, 19208, 19210. Under rule (b) only 19208 remains.
    ambiguity scan (all 179 commits, hermes commit-making calls, KC-1 window): 37 commits match >1 call (mostly ledger moves,
      plus failed-then-retried commits such as 822106c: 18492 attempt, 18494 commit). Under rule (b): 0 real ambiguities
      (3 left, 7e6562d 7d478ac bf7e575, are identical-timestamp duplicate rows 19585/19590 vs 19995/19997 of the same call)

expected effect with the required rule
    8 of 9 miss commits (26 edits) verify with the library as it is → 540/542 = 99.6%
    637956f (2 edits) stays a miss until the library links 19208 (implementation change, allowed by R7; e.g. require the
    commit inside [call, result] instead of picking the latest match)

allowed edit to packages/agentstate/bench/m6.ts (nothing else)
    1. verify(), commit branch, the line `if (!res.text.includes(e.short)) return { ok: false, why: 'result does not contain the sha' };`
       becomes: if the result lacks e.short, return ok only when rule (a) holds for some tool in call.tools (match against
       t.args and, if it parses as JSON, its parsed command/code string) AND call.time <= e.time + 2 AND res.time >= e.time − 1;
       otherwise return the same 'result does not contain the sha' miss. A short helper next to verify() for rule (a) is allowed.
    2. the header comment's "commit link" lines updated to state the alternative rule.
    no change to TARGET, RANGE, edit-link rule, sha rule, population, or tests from 9add41d.
```
