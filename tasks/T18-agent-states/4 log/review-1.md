```notes
T18 review round 1 (reviewer-T18-r1, fresh: no implementer chat seen; 2026-10-29)

verdict                 NOT VERIFIED: 2 P1 findings (done-when 4 and 7) · checks row passes · back to running

checks I ran (worktree at 3262703, load avg ~9)
    npm run check                                   → exit 0, Test Files 20 passed, Tests 144 passed
    node packages/agentstate/dist/bench/m6.js      → exit 0, M6 100.0% (542/542; via edit 50, via commit 492)
    node packages/agentstate/dist/bench/m7.js      → exit 0, M7 recall 100.0% (3116/3116), wrong 0.8% (25 outcome), 10 sessions, 25 compactions
    mole runs --root <wt>                           → exit 0, 222 runs · runs --all --json: 823 hermes, 47 claude-code, 14 codex, skipped []
    mole run 20261015_064949_38dbe5 --json          → 7 compactions, segments match compaction positions (0 mismatches), checkpoint
                                                      chain parent→id intact, LangGraph keys + values {context, tried, changed}, 7 children with spawnedBy + mergedAt
    mole run 940c0cc7 --json                        → claude-code, 1 compaction, 1 subagent child, chain intact
    mole tried 940c0cc7 --json                      → 254 items, 223 before compaction 1, 31 after
    mole agents packages/daemon/src/server.ts#Daemon.start → exit 0, 0 edits (see F2: data has no edit-tool calls on that file)
    mole agents packages/history/src/index.ts#check / #formatCheck → symbol filter works (2 vs 1 edit steps), newest first
    edit-link probe (attribute() over RANGE, 50 edit links): every linked call's new text is in the commit's diff, 0 links after the commit

test diff
    agentstate.test.ts                              unchanged since red 9add41d
    bench/m6.ts after 9add41d                       only key ruling 1's allowed edit: namesCommit() helper + the no-sha branch in verify()
                                                      + header comment; TARGET, RANGE, edit rule, sha rule, population unchanged
    bench/m7.ts                                     unchanged since red
    attribute-quiet.test.ts                         new regression test (added, nothing weakened)
    mcp.test.ts                                     1 line toEqual → toContain, as the contract's assumption allows

findings
F1  P1  done-when 7: one unreadable Claude Code transcript crashes `mole runs` in its default (root-scoped) mode
    repro               S=$TMPDIR/p; mkdir -p $S/claude/p $S/codex
                        echo '{"type":"user","cwd":"/x","sessionId":"s1","timestamp":"2026-10-01T00:00:00Z"}' > $S/claude/p/s1.jsonl
                        cp $S/claude/p/s1.jsonl $S/claude/p/s2.jsonl; chmod 000 $S/claude/p/s2.jsonl
                        MOLE_HERMES_DB=$S/none.db MOLE_CLAUDE_DIR=$S/claude MOLE_CODEX_DIR=$S/codex node packages/daemon/dist/cli.js runs --root "$PWD"
    observed            "mole: EACCES: permission denied, open …/s2.jsonl", exit 1, no runs listed
    expected            s2.jsonl listed as skipped (unreadable: EACCES), the other runs listed, exit 0 (with --all it does this)
    cause               index.ts listAll(): `filter(claudeCwd(r).cwd)` runs before the try that turns errors into Skipped entries

F2  P1  done-when 4: `mole agents <file>` misses most commit steps the library's own attribution links
    repro               node packages/daemon/dist/cli.js agents packages/daemon/src/server.ts --root "$PWD"
    observed            "mole: no agent run edited packages/daemon/src/server.ts"
    expected            the 4 steps attribute() links for its 4 commits (9224561, fd7ed34, 6a546ec, 9e19c51; all hermes 20261019_180211_ec7893)
    scale               31 sampled packages/ files with attribute() links: agents() empty for 23, missing some linked commits for 4
    cause               agentsIn() uses Step.commits (only '[branch sha]' / 'commit sha' at line start), while attribute() also takes any
                        sha in the output, background polls and the -m subject / ledger rule; quiet `git commit -q` steps have commits []

F3  P2  done-when 7: an unreadable transcript FOLDER is silently empty, not skipped
    repro               mkdir $S/c2; chmod 000 $S/c2; MOLE_CLAUDE_DIR=$S/c2 MOLE_HERMES_DB=$S/none.db MOLE_CODEX_DIR=$S/nope node packages/daemon/dist/cli.js runs --all
    observed            skipped lines for hermes + codex only; nothing for claude-code
    expected            "skipped claude-code $S/c2: not a readable directory"
    cause               listJsonl(): isDir() passes, readdirSafe() swallows EACCES and returns []

F4  P2  done-when 3: checkpoint gitSha = newest commit on ANY branch at that time, not the agent's HEAD
    repro               mole run 20261015_064949_38dbe5 --json --root <wt>: last checkpoint gitSha 9add41d, which only
                        ledger/t18-agent-states contains; the run's cwd is the main checkout (main)
    scale               63 of 1140 checkpoints differ from the main checkout's HEAD reflog at that time; AGENTS.md object id
                        differed in 0 of them, so stale-context flags were not affected in this run
    also                context.repo reports the --root worktree, not the run's own checkout

F5  P2  human output shows UTC times with no zone marker
    repro               mole runs --root <wt>: first row "2026-10-29 05:53" for a run started 00:53 CDT

F6  P2  docs: key.md still says "26 compactions"; the key has 25 (KC-2 in key-changes.md notes it, key.md not fixed)

F7  P2  privacy wording: key-changes.md (KC-1 evidence) quotes one full tool-call command from a transcript (a git commit
        with its -m subject). The subject is already public in git log and no chat prose is quoted, so low risk, but it
        goes beyond "counts + the key's sha256". Suggest replacing it with the message id + commit sha

no finding
    read-only           SQLite opened readOnly; JSONL via openSync 'r'; repo writes covered by the test at agentstate.test.ts:339
    compaction segments segment k for every step before compaction k (checked on 2 runs, 0 mismatches); M7 per-segment recall 100%
    outcome correctness M7 outcome contradictions 25/3116 (0.8%)
    attribution         50 edit links checked against commit diffs: all correct; commit links re-verified by the M6 bench
    stale-note flag     covered by agentstate.test.ts:275; one context-changed flag seen on real data (AGENTS.md read at step 0)
    boundary            only the paths listed in boundary + assumptions; daemon cli.ts is one dynamic import + call line
    privacy             no transcript text in packages/ (test fixtures synthetic); M7 key not committed, sha256 only

what to fix (for running)
    F1: move claudeCwd() inside the try in listAll() (or catch it there) + a test with an unreadable transcript in root mode
    F2: give agentsIn() the same commit evidence attribute() uses (or reuse attribute's committer matching) + a test with a quiet commit
    F3 optional: report EACCES on the folder as skipped
```
