```notes
T21 insights      builder-2 worker, 2026-10-29      contract: tasks/T21-parallel-agent-collisions/0 start.md (main)
    definition (fixed in bench/m11-key.json before code)
        parallel            windows [first, last complete step] within N = 15 min of each other
        collision           one run edits f; the other edited/read g; f == g, or a DIRECTED call chain f->..->g or g->..->f <= 2 calls edges
        not                 parent/subagent (delegation), siblings under a common caller, common callee, 3+ hops, same file other fn
        INFERENCE           directed chains only: undirected 2 hops through a hub like daemon cli.ts#main flags every package pair
        evidence            only complete steps: tool result present + outcome != fail; a pending call / cut last JSONL line is ignored
        touched fn          edit text located in the file -> innermost function/method; whole-file write = every function;
                            file changed since -> lines of the fragment that occur once; read offset/limit -> functions in range
        graph               T1 indexRepo over root + every worktree a candidate pair touched, temp tsconfig maps workspace
                            packages (@mole/*) to <pkg>/src/index.ts so cross-package calls resolve (T1 alone had none)
    real sessions       found: local-fc6c6dc0… (B8 builder, 10-28 21:12 CDT) and local-39d6ac07… (T18 chat, 10-29 00:13)
        finding             that B8 pair did NOT run in parallel (79 min gap): labelled not; the real parallel pairs are the
                            subagents (T11 x T12, T13 x T14, T16 x T19 x T18 chat, T16 x T20 ...) -> 9 collision + 7 not labels
        T15 builder 1       no session in the last hours in Hermes/Claude/Codex under the Mole cwd: not in the key (n/a)
        this builder        live, so not labelled (future edits unknown); `mole collisions --since 2` already shows it x T19
    M11 (bench)         recall 100% (16/16), false alarms 0% (0/16): planted 7/7 0/7, real 9/9 0/9; ~24 s (real indexes ~11 checkouts)
        INFERENCE           labels and detector share one definition, so 100% says the code matches the rule, not that the
                            rule is the right product rule; reviewer should challenge the rule (hub nodes, N) not only the score
    known gaps
        edits via terminal  sed/python/cat > f edits are invisible (T18 steps only see edit tools); T11's cli main edit was one
        reads via terminal  cat/sed/grep reads are not reads; only read_file/Read count
        graph = now         each checkout's current code, not the code at the time of the run
        speed               no graph cache: CLI ~15 s on Mole (indexes every touched worktree); cache by HEAD+mtime later
        big pairs           a whole-file write x whole-file read lists every function (38 changes for T14 x T14-fix)
    outside boundary    packages/daemon/src/cli.ts: one word ('collisions' in the agentstate dispatch list) so `mole collisions` runs
    hook follow-up (after T15 lands; plugins/claude-code/** only, ~10 lines)
        call                node <mole>/packages/daemon/dist/cli.js collisions --json --run "$SESSION_ID" --since 4 --root "$CWD"
                            (or import { collisions } from '@mole/agentstate': collisions({ ...defaultSources(), root, run: sessionId }))
        SessionStart        if pairs.length: print "mole: N parallel runs touch code near yours" then per pair (max 3):
                            "<b.harness> <b.run> <changes of b: edited|read symbol, local time>" + "  path: <path or shared>"
        Stop                same call; print only pairs whose changes include an EDIT by this session:
                            "mole: you changed <symbol>; <b.harness> <b.run> relies on it (<path>)" + notes[]: "edited <symbol> under note <file>"
        silence             nothing printed when pairs and notes are empty (done-when 4: unrelated files = no output)
```

```notes
T21 builder 3 follow-up      mole-builder-3      2026-10-29
    merge                   main (T15 hooks, T16, T20 LangGraph) merged into the branch 400d21f: conflicts were both-sides adds (agentstate deps,
                            index exports, cli usage, mcp server tool registrations) → kept both
    M11 drift               rerun after the merge: false alarms 20% (4/20), cause = resumed chat fc6c6dc0's window spanned its idle gap → fixed by
                            activity segments (key-changes.md note 2) → 0/16 again at be95f3c
    hook output             done-when 2 second half (T15 landed): session-start.mjs + stop.mjs call mole collisions --json --run <session> --since 4
                            only when the session's transcript already has a tool_use (new sessions can't collide, and the CLI reads every
                            harness's runs: ~1-20 s, kept out of T15's hook tests that use unknown sessions)
                            root passed in the session's own path form (sameFormRoot): transcripts keep /var/... while git says /private/var/...
    write gate              red tests created with terminal heredocs (6c201a1), as the brief allows
    gaps INFERENCE          a fresh session (SessionStart source=startup) has no steps → never warned; it would need 'live runs touching files in
                            play', not built · a pair counts touches from any segment once segments overlap (an edit 5 h earlier still counts)
```
