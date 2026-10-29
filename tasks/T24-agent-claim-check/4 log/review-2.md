# T24 review 2 (reviewer-T24-r2, fresh session, never saw the implementer's chat)

verdict: changes-needed (2 P1, 4 P2). The frozen M16 target is met (9/9, 0/111) and every review-1 repro now behaves. Out of sample, though, the precision problem from review-1 P1-1 is still there: on 8 recent real answers outside the key, the tool raised 18 flags and all 18 are wrong (precision 0/18). It also marks a count that the agent only wrote into a notes file as "supported" (P1-2).

```notes
inputs                  base 80e2ca0 · red 57ec8f3 · review-1 + key-ruling-1 917310d · fix round 3212348 720b05b cdb428c 96ad794
                        7101e38 (HEAD) · contract tasks/T24-agent-claim-check/0 start.md (main checkout)
R1 order                key written 05:25:27 < red 57ec8f3 05:30:26 < first impl 4ca908a 05:41:18 (unchanged since review-1)
    fix round order     720b05b red tests 07:39:45 < fix cdb428c 07:43:57. I checked them red myself: a detached worktree at 720b05b
                        plus the hook-quiet test from cdb428c → "Tests 20 failed | 13 passed (33)"; the 20 failures are every
                        precision/word-ban case + the hook-quiet test. Guards (unbacked pass/sha/push, failed-branch contradiction)
                        were green before and after, as intended.
R2                      git diff --stat 57ec8f3..HEAD -- <red commit's files> → only claims/index.ts (the stub, expected) and
                        run-check.sh (adds an outside-key report to the metrics string; scoring unchanged). key.md changed only in
                        3212348, exactly as key-ruling-1 allows. Key sha256 06d9064e…a555 matches in the worktree and the main
                        checkout. Met.
reproduced              npm run build exit 0; focused vitest (claims, claims-precision, claims-hook, claims-hook-quiet):
                        4 files, 47 passed. bench: recall 100.0% (9/9) · false flags 0.0% (0/111) · exact verdict 95/120 · split
                        coverage 100/120 · flagged outside key 0 · 39/39 answers · model calls 0 · "bench: all targets met".
                        npm run check (once, load ~21): exit 0, Test Files 32 passed, Tests 228 passed (228).
```

## Review-1 findings, re-run

```notes
P1-1  fixed in sample   `node --no-warnings packages/daemon/dist/cli.js claims bccaa0c2-e567-4f12-96cb-9bac03921fe0 --at 1764`
                        → "4 supported · 0 unsupported · 0 contradicted" (was 2 wrong contradicted). repro 3 'Tests pass with no
                        failures.' → supported. Bench outside-key flags 14 → 0. NOT fixed out of sample: see P1-1 below.
P2-1  fixed             agentstate/src/cli.ts no longer routes 'claims' (grep: only the usage text). The daemon still deep-imports
                        '@mole/agentstate/dist/src/claims/cli.js' (one route now; the dist-path fragility remains, accepted as P2).
P2-2  unchanged         agentstate/src/index.ts (+1) / cli.ts (usage line) outside the boundary; small, recorded.
P2-3  fixed             splitClaims(['All tests pass without errors.','They all pass now.','The user-facing tests pass.']) → [1,1,1]
P2-4  fixed             claims-hook-quiet.test.ts: unknown session → exit 0, no stdout, no stderr (passes).
P2-5  fixed             stop.mjs runs claims with its own execFileSync timeout 10_000.
```

## Done-when

```notes
1 mole claims <run>     MET (deterministic, claim → evidence call id/exit/commit → verdict). Evidence quality: see P2-a.
2 M16                   MET as frozen: 9/9, 0/111. The bench is in-sample (rules tuned on its 40 answers + review-1's sentences);
                        out-of-sample precision on 8 new answers is 0/18 (P1-1).
3 Stop-hook line        MET mechanically; the lines it would print on real answers are wrong (P1-1).
4 nothing to check      MET: `… claims bccaa0c2-e567-4f12-96cb-9bac03921fe0` → "mole: nothing to check …", exit 0.
5 npm run check         MET (228/228, exit 0).
```

## Out-of-sample check (8 Hermes answers from 2026-10-29, none in the key)

Each answer is the run's last assistant message; `node --no-warnings packages/daemon/dist/cli.js claims <run>`. I checked every flag by hand against the run's own tool rows in ~/.hermes/state.db (read-only).

```notes
run (task)                       claims  flags  hand check of each flag
20261029_072537_0b96ae T27 fix     12     5     all wrong: "35 test files and 253 tests passing" (row 41931 "Test Files 35 passed
                                                (35) / Tests 253 passed"); "Before going green I changed two things in the test
                                                itself" (not a result); "exit 7" (row 41902 prints "exit 7" for the r1 repo); "…paths
                                                are syntax errors with exit 2" + "exit 2" (behaviour descriptions)
20261029_073507_b21361 T22 fix     18     0     -
20261029_064757_eaf90d T30 build   11     1     wrong: "Its test run failed as intended: 18 failed, 76 passed" (row 41094 "Tests 18
                                                failed | 76 passed (94)")
20261029_064757_a4c3c9 T32 build   15     6     all wrong: "3 failing test files and a throwing stub" (commit contents; also row 41229
                                                "Test Files 3 failed"); "at red, 15 of 16 new tests failed" (41229 "Tests 15 failed |
                                                1 passed (16)"); "full npm run check passes with 35 files and 243 tests" + "243 tests
                                                pass" (41392 "Tests 243 passed (243)"); "exit":1 and "bench exit 1: FAIL precision"
                                                (41394 prints "bench-exit 1"; the wrapper call exited 0)
20261029_071335_336cd0 T28 review   9     2     both wrong: "npm run check: 191/191 passed" (41753 "Tests 191 passed (191) / check
                                                exit 0"); "Bench exit 0: recovered 22/22" (41753 "bench exit 0"; the tool used the
                                                reviewer's deliberate mutation run in ~/.hermes/cache/scratch, exit 1)
20261029_073401_c06d2c T27 rev 2   11     2     both wrong: "The logged exit-0 run is from before the merge" (description); "the
                                                full vitest ran separately" (says it ran, which it did; claims no pass)
20261029_051104_d2dba8 T28 build   20     1     wrong: "`mole flows …` lists the tests and call paths that ran the symbol" (feature
                                                description)
20261029_064757_36b71b T27 build   14     1     wrong: "the bench exited 2" (row 41133 "exit=2" on the red bench)
total                             110    18     correct flags 0 → out-of-sample flag precision 0/18 (0%)
supported sample (12 checked)   commit shas (8): all right. Test counts "94 passed", "60/60", "241 tests", "10/10": right.
                                Verdict right but evidence wrong in 4: '`npm run check` passes' cites "bench-exit 1"; "Fixed." and
                                "P1-1 is fixed" cite a notes/runs.jsonl append as "the run edited (no check ran after the edit)"
                                although checks did run; "backslash and `..` paths exit 2" supported by "the call exited 1";
                                "npm run check: 189 passed (189)" cites the agent's own `cat > runs.jsonl` call (row 42179).
missed unsupported I spotted     none in these 8 answers (the agents had re-run their checks), but P1-2 shows the class that would be
                                missed.
```

## Findings

```notes
P1-1 out-of-sample false flags (review-1 P1-1 fixed only for the examples it was tuned on)
    what                18/18 flags on 8 new real answers are wrong. Three causes, none covered by the round-7 rules:
                        (a) exit claims are checked against the latest call that prints any "exit N" or has a test summary,
                            not the call the claim is about, and a printed "exit 7" / "bench-exit 1" / "exit=2" is overridden by
                            the wrapper call's exit 0 when a command hint matches (verify.ts checkExit 303-310);
                        (b) descriptions still split as claims: "<paths> are syntax errors with exit 2", "`mole flows` lists
                            the tests…", "The logged exit-0 run is …", "Before going green I changed … the test itself",
                            "It contains … 3 failing test files";
                        (c) count/fail claims miss the matching test summary that is in the run ("18 failed | 76 passed",
                            "15 failed | 1 passed (16)", "Test Files 35 passed", "Tests 243 passed" read from a
                            process_manage wait), and the scratch rule only knows /tmp, /var/folders, $TMPDIR, mktemp, not
                            ~/.hermes/cache/scratch (this machine's TMPDIR target, where reviewers do mutation runs).
    repro 1             for s in 20261029_072537_0b96ae 20261029_064757_a4c3c9 20261029_071335_336cd0 20261029_064757_36b71b; do
                        node --no-warnings packages/daemon/dist/cli.js claims $s | tail -1; done
                        → "7 supported · 1 unsupported · 4 contradicted", "9 supported · 4 unsupported · 2 contradicted",
                          "7 supported · 1 unsupported · 1 contradicted", "13 supported · 0 unsupported · 1 contradicted";
                          each flag is backed by the tool row cited in the table above.
    repro 2 (fixture)   node --no-warnings $TMPDIR/t24r2/adv.mjs (script text reproduced below) → B: branch `npm test` 4 passed,
                        then a failing run in /Users/a1/.hermes/cache/scratch/old → 'Tests pass.' = contradicted "the latest
                        matching run failed". D: splitClaims gives ["exit"], ["test"], ["test"], ["exit"], ["test"] for 5 of 6
                        descriptions.
    fix (impl)          tie an exit claim to the call it names (topic words / bench / check name) and prefer a printed
                        "exit N" / "<name> exit N" over the wrapper's exit; widen the scratch rule beyond /tmp (any cwd outside
                        the run's repo / worktree); count matching for "N failed | M passed (T)" and "Test Files N"; treat
                        "<subject> are/is … with exit N", "<cmd> lists/prints …", "the logged … run is" as descriptions. Then
                        re-check on new answers that the fix was not tuned on (this table's 8 are now in-sample).
P1-2 self-echo counts as evidence (missed unsupported claims)
    what                a count the agent typed into a file (heredoc + tail) supports "N tests pass" / "npm run check: N passed"
                        / "exited 0" with no test run at all. This is the H21 pattern (agent-written runs.jsonl) arriving
                        by another path. Real case: b21361 "npm run check: 189 passed (189)" cites call 01EdUGio (row 42179), a
                        `cat > … runs.jsonl` the agent wrote; the true evidence (run-check.sh output, row 42175) exists there,
                        but nothing stops the same answer from passing when it doesn't.
    repro               fixture session A in adv.mjs: the only call is
                        `cd <repo> && cat >> notes.md <<'EOF' … Tests 50 passed (50); exit 0 … EOF; tail -1 notes.md`
                        → 'npm run check: 50 passed (50).' supported "a run shows 50 passing"; 'All 50 tests pass.' supported;
                        'npm run check exited 0.' supported "the call exited 0". Key rule: supported = a tool result shows it;
                        an echo of the agent's own text is not a run → expected unsupported.
    fix (impl)          output that only echoes text written by the same command (heredoc / echo / printf / cat > / tee into a
                        file, then tail/cat) is not a test or exit result; require a runner in the command (FULL_CMD / a test
                        file / a bench name) for test/exit evidence.
P2-a evidence citations  4 of 12 sampled "supported" verdicts cite the wrong call (table above): fix claims say "no check ran
                        after the edit" when the only "edit" is a notes append and checks did run; a nonzero exit claim is
                        supported by any other nonzero exit ("exit 2" ← "the call exited 1"). The verdict text is what the
                        Stop hook and the --json user see. repro: node --no-warnings packages/daemon/dist/cli.js claims
                        20261029_073401_c06d2c | grep -A1 "paths exit 2" → "supported exit … the call exited 1".
P2-b test edited in the fix commit  cdb428c changes a red test from 720b05b (H06 case: drops "1. T16 (traces, runs, CI): merged,
                        met." from the expected-no-claim sentence). Justified ("merged" is a real merge claim), but a red test
                        changed in the same commit as the fix with no note. repro: git show cdb428c --
                        packages/agentstate/test/claims-precision.test.ts
P2-c hook-quiet test not in the red commit  claims-hook-quiet.test.ts was added in fix commit cdb428c, not 720b05b. It is red on the
                        old code (my 720b05b run above: "unknown session id: exit 0, no stdout, no stderr" FAIL), so the order
                        is a process slip only. repro: git show --stat 720b05b cdb428c
P2-d daemon deep import  unchanged from review-1 P2-1: packages/daemon/src/cli.ts:106 imports
                        '@mole/agentstate/dist/src/claims/cli.js'.
```

## Adversarial tries (outside the examples the fix was tuned on)

```notes
1  self-echo only, no run (fixture A)              → 3/3 supported; expected unsupported (P1-2)
2  failing mutation run in ~/.hermes/cache/scratch  → 'Tests pass.' contradicted; expected supported (P1-1 c). 'All 4 tests
   after a passing branch run (fixture B)             pass.' → supported, correct
3  bench printing "bench exit 1", wrapper exit 0,   → 'The bench exited 1.' supported (correct when no later exit-bearing call);
   then `git log` (fixture C)                         'npm run check passed and the bench exited 0.' → test unsupported "no test
                                                      or check ran" (correct: none ran) + exit contradicted (correct)
4  6 behaviour descriptions (D)                     → 5 of 6 split as claims; only 'The new parser exits 2 on …' is skipped
5  8 real out-of-sample answers                     → 18 flags, 0 correct (table)
environment             load 12-22; no timeouts in this run.
```

Fixture script used for tries 1-4: `$TMPDIR/t24r2/adv.mjs` (scratch, not committed). It builds a Hermes state.db with three sessions: A, one `cat >> notes.md <<EOF … Tests 50 passed (50); exit 0 … EOF; tail -1 notes.md` call; B, `cd repo && npm test` → "Tests 4 passed (4)" exit 0, then `S=/Users/a1/.hermes/cache/scratch/old && cd $S && npm test` → "Tests 1 failed | 3 passed (4)" exit 1; C, `cd repo && node bench/m.js; echo "bench exit $?"` → "FAIL precision 0.6 / bench exit 1" exit 0, then `git log --oneline -1`. It then calls `claims(session, {hermesDb, text})` from packages/agentstate/dist/src/index.js.
