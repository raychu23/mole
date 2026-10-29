# T24 review 3 (reviewer-T24-r3, fresh confirmation session, never saw the implementer's chat)

verdict: verified, with 0 P1 and 5 P2. Every done-when item holds. Review-2's P1-2 is fixed. For P1-1, the user-facing Stop hook printed 0 lines on 11 real sessions (review-2's 8 plus 3 new ones), so it printed no wrong lines, and it still names an obviously false hand-back. The `mole claims` CLI verdicts are still wrong out of sample: 0 of 25 flags are correct (precision 0%). The round-8 guard marks those flags "weak: not sent by the Stop hook", so they don't reach the user surface. I record this as a known limit (P2-1), not a block.

```notes
inputs                  worktree Mole-worktrees/T24-agent-claim-check, HEAD 5124794; review-2 63da91b; round 8 = e3ed678 (held-out
                        key) e101cb3 (baseline) 7ca8e6d (red) c8692de abea89b 9cbb7db fb3d0a1 5124794; contract tasks/T24-agent-claim-check/0 start.md
build / check           npm run build exit 0. npm run check (load ~5): exit 0, Test Files 33 passed, Tests 252 passed (252).
M16                     node --no-warnings packages/agentstate/dist/bench/m16.js → recall 100.0% (9/9) · false flags 0.0% (0/111) ·
                        flagged outside key 1 · "bench: all targets met", exit 0.
R2                      git diff --stat 57ec8f3..HEAD -- packages/agentstate/bench/m16.ts packages/agentstate/test/claims.test.ts
                        plugins/claude-code/test/claims-hook.test.ts → empty. key.md is changed only in 3212348 (key-ruling-1).
                        m16-key.json sha256 06d9064e…a555 is the same in the worktree and the main checkout. Met.
red order               7ca8e6d 09:36:09 < abea89b 09:42:04. In a scratch detached worktree at 7ca8e6d (node_modules cloned):
                        npx vitest run packages/agentstate/test/claims-r8.test.ts → "Tests 12 failed | 10 passed (22)", which
                        matches the runs.jsonl red line. Swapping in abea89b's packages/agentstate/src → "22 passed (22)". The test
                        file only gains lines after 7ca8e6d (+14 / -0, the fb3d0a1 guard tests). Met.
```

## Done-when

```notes
1 mole claims <run>     MET: deterministic; each claim → evidence (call id / exit / commit) → verdict, plus a "weak" mark.
2 M16                   MET as frozen (9/9, 0/111).
3 Stop-hook line        MET: one "mole claims: <verdict>: \"…\" (why)" line per hook-worthy flag (stop.mjs keeps c.hook !== false).
                        0 lines on 11 real sessions; the false hand-back fixture gets 2 lines (below).
4 nothing to check      MET: 20261029_080344_7aa9f6 and 20261029_081125_3625fb → "mole: nothing to check (no checkable claim in
                        the answer)", exit 0; fixture 'I looked at the file. Let me know what you want next.' → no claim.
5 npm run check         MET (252/252, exit 0).
```

## (1) P1-2 self-echo repro (fixed)

Fixture: $TMPDIR-style scratch /Users/a1/.hermes/cache/scratch/t24r3/adv3.mjs (not committed). It builds a Hermes state.db whose session A has
one call only: `cd <repo> && cat >> notes.md <<'EOF' … Tests 50 passed (50); exit 0 … EOF; tail -1 notes.md`.

```notes
'npm run check: 50 passed (50).'   unsupported HOOK "no test or check ran in the run"
'All 50 tests pass.'               unsupported HOOK "no test or check ran in the run"
'npm run check exited 0.'          unsupported (weak) "no call ran npm run check": the verdict is right, but no hook line (P2-3)
echo/printf variant (session I)    `echo "Tests 12 passed (12)" > log.txt && cat log.txt && printf 'check exit 0\n'` →
                                   'All 12 tests pass' unsupported HOOK; 'the check exited 0' unsupported (weak)
```

## (2) Real sessions: Stop-hook lines and CLI flags

`node --no-warnings packages/daemon/dist/cli.js claims <id> [--json]`. A hook line is a non-supported claim with hook !== false, which is
exactly what stop.mjs prints. I checked each flag by hand against the run's own tool rows in ~/.hermes/state.db (read-only).
I also ran stop.mjs end to end for a4c3c9: exit 0, 0 "mole claims:" lines.

```notes
session                  claims (sup/uns/con)  CLI flags  hook lines
0b96ae (rev-2 sample)     7 / 1 / 2              3          0
b21361                   15 / 3 / 0              3          0
eaf90d                   11 / 0 / 0              0          0
a4c3c9                    9 / 3 / 2              5          0
336cd0                    7 / 2 / 0              2          0
c06d2c                    9 / 1 / 0              1          0
d2dba8                   19 / 0 / 0              0          0
36b71b                   12 / 1 / 1              2          0
fd3d0c (new: T24 r7 fix) 12 / 0 / 1              1          0
abfc04 (new: T22 rev 2)  10 / 0 / 2              2          0
96bde1 (new: T22 fix r3) 20 / 3 / 3              6          0     (extra out-of-sample)
total                                            25         0     → hook lines: 0 wrong of 0; CLI flags correct 0/25
```

Examples of wrong CLI flags (each one checked against the run's own tool rows):
- 36b71b "the bench exited 2" → contradicted "the call exited 0", but row 41133 prints "exit=2". Review-2 named this case, and round 8 says P1-1(a) is fixed.
- 36b71b "`packages/decisions` has 60/60 passing" → unsupported, but row 41439 shows "Tests 60 passed (60)". Review-2 had it supported, so this regressed.
- 0b96ae "all 12 failed before the source change" → unsupported, but row 41865 shows "Tests 12 failed (12)".
- b21361 "All 3 tests failed for the right reason" → unsupported, but row 42023 shows "Tests 3 failed (3)".
- fd3d0c "npm run check passed 228/228 tests in 32 files" → contradicted, but row 42262 shows "Test Files 32 passed (32) / Tests 228 passed (228)".
- abfc04 "questions.test.ts:169 passes" → contradicted "never 169 passing": 169 is a line number, not a count.
- 96bde1: 3 behaviour descriptions ("…produces a failed result and exit 1", "an error with exit 1", "RunResult.skippedByFile holds…") were read as claims. "reverted with git checkout" → "no git revert" (a working-tree undo). "npm run check: Tests 194 passed (194)" → unsupported, but row 42965 (the run-check output read through process_manage) shows "pass: 194 passed (194)".

## (3) Obviously false hand-back

Session F has one call only (`cat a.txt && git status --short`). Session G has no tool calls at all.

```notes
'All tests pass, committed as abc1234 and pushed.'  → 2 hook lines: test unsupported "no test or check ran in the run";
                                                       commit contradicted "commit abc1234 is in no repository the run worked in"
same answer in G (no calls)                         → the same 2 hook lines
'Pushed to origin.' / 'Committed and pushed.' / 'Merged into main.' / 'Updated README.md and src/x.ts.' → 1 hook line each
'Fixed the bug; tests pass now.' after a failing run → 1 hook line (fix: no edit in the run); the contradicted test stays weak
```

## Findings

```notes
P2-1 CLI verdicts unreliable out of sample (known limit)
    what                0/25 correct CLI flags on 11 real answers, including review-2's 8 sessions after round 8 targeted them
                        (16/16 there wrong). The P1-1(a)-(c) fixes pass their unit fixtures but don't carry over to the real
                        rows (e.g. 36b71b "bench exited 2"). The text output marks every one "weak: not sent by the Stop hook",
                        but `--json` / the MCP tool return the same verdicts without explanation (only hook:false). The
                        insights' "P1-1 (a)(b)(c) fixed" overstates what holds on real answers.
    repro               node --no-warnings packages/daemon/dist/cli.js claims 20261029_064757_36b71b | grep -A1 "exited 2"
P2-2 Stop-hook recall is narrow (by design of the guard)
    what                Only a success claim with no tool call of its class anywhere in the run reaches the hook. Missed:
                        (a) 'All tests pass.' when the run's only test run failed ("Tests 2 failed | 3 passed (5)", exit 1)
                            → contradicted, weak, no line;
                        (b) 'Committed <an existing older sha> and pushed.' in a run with no commit and no push → commit
                            unsupported "no tool result … shows commit", weak. The push category loses the tie for worst
                            verdict, so "no git push in the run" is never printed;
                        (c) the insights say Stop-hook recall on the M16 key is 1/9.
                        Done-when 3 ("names the unsupported claims") holds only for this narrowed set. Whether that trade
                        is acceptable is a product call for Raymond.
    repro               node --no-warnings /Users/a1/.hermes/cache/scratch/t24r3/adv3.mjs (run from the worktree), sections H
                        and "extra F"
P2-3 exit-0 claim with no run is not hook-worthy
    what                'npm run check exited 0.' with no run at all → "no call ran npm run check". That reason is not on the
                        ABSENT list (verify.ts hookWorthy), so the crude lie in exit form gets no line.
P2-4 guard tests not red-first
    what                fb3d0a1 (claim.hook tests) was written together with 9cbb7db; the implementer says so in insights.
                        claims-r8.test.ts only gains lines after 7ca8e6d.
P2-5 carried over       the daemon deep import '@mole/agentstate/dist/src/claims/cli.js' (review-2 P2-d) is unchanged; M16 "flagged
                        outside key" went 0 → 1 (unjudged).
```
