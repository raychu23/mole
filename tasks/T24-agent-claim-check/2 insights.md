# T24 insights (assumptions, decisions, limits)

```notes
assumptions (Raymond away; written down instead of asked)
    answer                  "final answer" = the last assistant text before the next user message (Hermes row / JSONL line);
                            `mole claims <run>` checks the run's last one, `--at ROW` an earlier one; the bench also checks one
                            agent-written runs.jsonl line (H21) via claims(run, { text, before })
    evidence                the run's own tool calls + results strictly before the answer; a subagent's report
                            (delegate_task / Agent / Task / SendMessage result) is never evidence: a relayed claim is unsupported.
                            git is used to tell an unknown sha (contradicted: in no repo the run cd'ed into) from an unshown one
    verdict per clause      a clause can carry several categories (merged … (sha)); the worst verdict decides
    staleness               a pass claim with no count is backed only by a passing run that no later code edit (non-doc file)
                            made stale; doc/log writes (.md .json .jsonl …) do not make it stale
    index.ts                one line `export * from './claims/index.js'` added to packages/agentstate/src/index.ts (outside
                            src/claims/**) so MCP and library users get claims() from '@mole/agentstate'
    CLI dispatch            the brief said "add 'claims' to the dispatch list"; I first did, then replaced it with ONE separate
                            line `if (cmd === 'claims') return (await import('@mole/agentstate/dist/src/claims/cli.js')).claimsCli(…)`
                            (still one import + one call, the contract's boundary). Reason, measured: importing '@mole/agentstate'
                            loads LangGraph + checkpoint-sqlite + the TypeScript compiler (@mole/memory): 1.4 s idle, 5.3 s at
                            load 130, so the CLI tests timed out at 5 s and the Stop hook would pay it on every stop. The light
                            entry runs `mole claims` in 0.3 s at load 130. agentCli('claims') still works (same function).
    tests written           claims.test.ts and claims-hook.test.ts via terminal heredoc (cat > file <<'EOF') in the red commit
key
    labelled by me before any src/claims code existed; one label later found wrong (C03, see 4 log/key-changes.md), left frozen
loop
    round 1 (4ca908a)       recall 5/10, false flags 6/110: edit-tool diffs and code-printing commands counted as test runs,
                            'Test Files 8 passed' read as 8 tests, topic words matched outputs instead of commands, a branch name
                            ('…/t4-reddit-saved') read as a file 'saved', all-digit fixture sha (8619148) not read as a sha
    round 2                 recall 9/10, false flags 0/110 after: runs = commands (or process waits) with a test-summary output,
                            topic words matched on commands only, counts only in pass/test context, full-suite claims need a
                            suite-level command segment, durations ('3m47s') must show in an output, known places
                            ('Claude Code's local plugin folder' → .claude/plugins) must be written to, push = first person/passive
    rounds 3-5             b2d8ed6 / adbe972 / fb287cd: bench unchanged (9/10, 0/110) with answers extracted 39/39 after an
                            injected user message (subagent hand-back) also ends a Claude Code turn; check red only from 7/20/15
                            unrelated tests at the 5 s timeout (all ≥5 s, none in claims tests) at load 70-130; last full green
                            check is round 2 (6d3b17d, 195/195)
environment
    load average 90-140 from other builders during every full `npm run check`; 15+ unrelated tests time out at vitest's 5 s
    default (T18/T20 CLI tests, daemon call-site tests, hooks, key guard); a rerun at lower load is the honest fix, not a timeout edit
limits
    patterns are English and tuned on 40 answers (32 Hermes, 8 Claude Code), no Codex answer in the key
    claims outside the key that the tool flags are reported by the bench (14), not scored; most are metric prose ("M2 is 5/5 on
    the test cases") and descriptions of behaviour ("the wrong-hash ruling also exits 1")
    a claim whose clause has a negation/plan word (not, until, will, without, …) or names another agent is skipped, so e.g.
    "It now fails without the fix" is not checked
```

review round 1 → 2 (4 log/review-1.md, key-ruling-1.md)
    key-ruling-1            applied verbatim in 3212348: C03 claim 3 → supported (label/evidence/note only, `written` unchanged),
                            same bytes copied to the main checkout's gitignored copy; key.md sha256 → 06d9064e…; the bench reads
                            the sha from key.md, so bench/m16.ts is untouched. Effect with the old code: recall 9/9, false flags 0/111
    P1-1 (fixed)            red tests first (720b05b, packages/agentstate/test/claims-precision.test.ts, 19 failing), then cdb428c+:
                            not claims = count claims with a metric word (M#, target, score, recall, precision, accuracy, false flags)
                            or with no test verb ('traced (9 of 9)'); 'exits N' without I/we and 'exited N when/if …' (behaviour);
                            present-tense 'writes/deletes' without 'now' or I/we (feature description); 'was/were being', 'used to'
                            (the old bug); clauses after 'if/unless/whenever' in the same sentence unless first person; text in
                            ``` blocks and inside a "metrics" object (quoted runs.jsonl lines); bullets under an intro that reports
                            someone else's findings or lists bugs/issues ('It also confirmed:', 'The three serious bugs:') unless the
                            bullet says I/we/my/our.
                            verifier: a failing run in a temp copy (/tmp, /var/folders, $TMPDIR, mktemp, not the run's cwd) does not
                            decide a plain pass claim when the run also tested its own tree; 'earlier/previous/first … passed' and
                            'without/before the fix' are backed by any matching pass and never contradicted by a later run.
                            Bench: flagged outside key 14 → 0; I judged all 14 old flags wrong by the key rule (13 non-claims + H27, a
                            real claim with a wrong verdict from an unrelated daemon FAIL line); hand judgement in the gitignored
                            .mole/local/bench/m16-outside-judged.json, counted by run-check.sh into the runs.jsonl metric string
    test edited after red   claims-precision.test.ts H06 case: I dropped the sentence's lead '1. T16 (traces, runs, CI): merged, met.'
                            because 'merged' there is a real merge claim, not the out-of-key flag; the rest of the file is as committed
    P2-3 (fixed)            'without' left NOT_DONE; 'user' only bans when not 'user-…'; 'they' still bans except a leading pronoun
                            result ('They all pass now', "they're now fixed"); pronouns joined the topic stop words (else 'they' matched
                            a heredoc and picked an unrelated failing run). 'They fail on …' stays skipped (a limitation description)
    P2-4/P2-5 (fixed)       stop.mjs calls `mole claims` itself with a 10 s timeout and stderr ignored: unknown session, timeout or crash
                            = no output (new test plugins/claude-code/test/claims-hook-quiet.test.ts, red on the old stop.mjs by stash)
    P2-1 (partly)           the dead agentCli 'claims' branch + its import are removed (one route: daemon cli.ts → claims/cli.js).
                            The daemon's deep import '@mole/agentstate/dist/src/claims/cli.js' stays: adding an "exports" map to
                            @mole/agentstate would close every other deep import other packages may use (shared file, parallel
                            builders), and importing the package root loads LangGraph + the TS compiler (1.4-5 s) on every Stop hook
    P2-2 (noted)            outside-boundary lines now: agentstate/src/index.ts +1 export, agentstate/src/cli.ts usage text only (+2/-1)
    limits                  the precision rules are English patterns tuned on the review's examples + the 14 flags of this one sample;
                            an out-of-sample metric phrased without a metric word, or a bug description without was/were being or 'if',
                            can still be read as a claim

round 8 · 2026-10-29 (last fix round, review-2 P1-1 + P1-2)
```notes
held-out key            4 log/heldout-key.md (sha only; key gitignored, both checkouts): 16 real answers from 10-28/29 Hermes runs
                        (11 subagent hand-ins, 5 coordinator chats), none in the M16 key or review-2's 8; 158 claims hand-labelled
                        from each run's own tool rows with a read-only sqlite grep helper (not the code under test), committed
                        (e3ed678 09:33) before any code change. Only 1 flagged claim (a coordinator relaying a subagent's "two
                        blocking problems are fixed"): the agents in these runs mostly did re-run their checks, so recall on this
                        key is 0/1 or 1/1 and says little; precision is the useful number. No Claude Code answer (none on 10-28/29).
    before (round-7 code)  18 flags, 0 correct (precision 0%), recall 0/1  (runs.jsonl line e101cb3)
P1-2 (fixed)            a command's own literal text (heredoc bodies, echo/printf strings) is cut from its output before any matcher
                        sees it; a command that only moves its own text (cat/echo/printf/tee/tail/sed/git add|commit …) is not a
                        run; command hints match the command without heredocs/echo strings. Fixture A: 3/3 now unsupported; a real
                        run before the notes append stays the evidence (callId of the run, not the append).
P1-1 (a) (fixed)        printed exits ('bench-exit 1', 'exit=2', 'exit 7', 'exited with code 3', 'CHECK_EXIT=0'; not JSON "exit": and
                        not vitest test titles) beat the wrapper's exit; exit claims pick the call whose command / printed label
                        shares most claim words; 'round N / red / earlier / first' exit claims accept any matching call; the
                        exit number must match exactly (P2-a: exit 2 is no longer backed by exit 1).
P1-1 (b) (fixed)        runner summaries parsed into numbers (vitest Tests / Test Files, jest 'x failed, y passed, z total', pytest
                        'N passed, M failed', unittest Ran N + OK/FAILED) and matched field by field with the claim's counts
                        (files, passed, failed, total); 'Round 3 passed', 'step 2', 'P1', 'M16' numbers are labels, not counts;
                        `npm run X` claims also match a wrapper call whose output carries npm's '> pkg@ver X' banner.
P1-1 (c) (fixed)        a failing run outside the tree of the run's last passing check (cd target before the runner, $VAR and ~
                        resolved; /tmp, $TMPDIR, /var/folders, any /scratch/ or /cache/ dir, another worktree or repo) does not
                        contradict a pass claim, for test and fix claims.
P1-1 (d) (fixed)        present-tense description verbs (lists, prints, shows, returns, reports, gives, exits, …) without I/we or
                        'now' are not claims (except 'returns the same', a check result in the M16 rule); 'with exit N' after
                        is/are, adjectival 'exit-0 run'; test verbs inside 'before/after/while … -ing' clauses; '3 failing test
                        files' after contains/includes/has/with.
P2-a (fixed)            fix claims check after the last CODE edit (a notes / runs.jsonl append no longer counts as the fix).
precision guard (step 3)  after the P1 fixes the verdicts were still wrong out of sample: held-out 15 flags, 0 correct; with a first
                        guard (success claims, contradicted or absent class) the hook would have sent 5 lines, all wrong (counts /
                        exits read off the wrong call), then 2 ('reverted' = a working-tree undo, not git revert). Per the brief
                        I restricted the Stop hook to success claims whose whole class is absent from the run (no test or check
                        at all, no commit, no push, no merge, no edit, no write to the named file, a sha in no repository).
                        Claim.hook carries it; stop.mjs filters on it; `mole claims` still prints every verdict and marks the
                        rest "weak: not sent by the Stop hook".
    cost                Stop-hook recall on the frozen M16 key drops to 1/9 (C05; the frozen bench scores verdicts, still 9/9).
                        The hook now catches only the crude lie ("tests pass" with no test run, "pushed" with no push); count,
                        exit and stale-pass errors are visible in `mole claims` but not pushed.
after                   frozen M16 9/9, 0/111 · held-out verdict flags 15, correct 0 (precision 0%), recall 0/1 · held-out Stop-hook
                        lines 0 (precision n/a), recall 0/1 · review-2's 8 sessions: verdict flags 16, hook lines 0
honesty notes           I read the held-out flag list after the first fix (to decide the guard, as the brief allows), so the held-
                        out numbers for the guard are not blind; the matcher fixes were designed from review-2's examples only, and
                        two held-out-inspired matcher changes were dropped (a broader 'reverted' rule broke M16 H06). A new held-
                        out set is the real test of the guard. Tests for the guard (claim.hook) were written with it, not red-first.
```
