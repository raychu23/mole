# T20 review 1 (reviewer-T20-r1, 2026-10-29)

```notes
verdict                 VERIFIED: no P0, no P1; 4 P2 below
reviewed                base 24cf82c · red 626a462 · head 18faa26 (branch ledger/t20-langgraph-checkpoint-export)
                        read the checks diff first (24cf82c..626a462), then the implementation diff

checks (R1)             626a462 = key + 5 red tests + bench + exporter stub (throws); impl 8d3d596 comes after
    key date            m10-key.json written 2026-10-29T01:45:04-05:00 < red commit 01:46:00 < impl 01:47:31
    key independent     m10-keygen.mjs uses only T18 getRun: per run count + sha256 of canonical values; no exporter existed
    read-back           bench + test build their OWN StateGraph(Annotation.Root) + SqliteSaver on the file and call
                        graph.getStateHistory; neither imports runGraph/RunState from the exporter
    bench checks        count = key · parent chain oldest-first · step index order = T18 · sha256 = key (+ live diff)
                        · fork via updateState: parent = step k, values = step k + update, originals unchanged · empty
R2                      git diff 626a462 HEAD -- packages/agentstate/bench packages/agentstate/test → empty
R7                      green came from the impl commit only (langgraph.ts, cli.ts, index.ts export line)

done-when
    1 export CLI        MET  `mole run <id> --export langgraph <file>`: one thread per run (thread_id = run id), one
                             checkpoint per step via saver.put, parent = previous checkpoint, values {step, contextVersion,
                             filesRead, tried, changed}; CLI test passes; bad format → exit 2
    2 M10 100%          MET  bench: 15/15 runs, 3747 checkpoints, exit 0 (my run)
                             extra probe, all of B5 not just the sample: 897/897 runs (155 empty, 20455 checkpoints) equal
                             via getStateHistory, 0 failures
    3 fork              MET  bench forks 3/3 (hermes, claude-code, codex, step floor(n/2)); probe: updateState at step 50
                             then graph.invoke from the fork runs, filesRead kept, history 197 → 201
    4 0-step run        MET  bench empty 2/2; CLI on e6d2803f… exit 0, "0 checkpoints" + note line
    5 npm run check     MET  21 files, 150 tests passed (my run)

mutation (dist langgraph.js patched, bench run, restored; cmp = identical)
    drop step 5                  exit 1  5/15  "history 1215 checkpoints, key 1216"
    swap steps 3/4               exit 1  2/15  "step order differs"
    last filesRead altered       exit 1 11/15  "values sha256 differs … at checkpoint 1215"
    tried emptied                exit 1  1/15  "values sha256 differs"
    T18-style ids, no rise guard exit 1  2/15, forks 0/3  "checkpoint 2 parent x:9 != x:1"
    no parent link               exit 1  1/15  "checkpoint 1 parent none != …"
    → the check can fail on every broken-exporter shape tried

edge cases
    unknown id          `mole run does-not-exist-xyz --export langgraph $T/x.sqlite` → "mole: no run …", exit 1, no file
    missing file arg    `mole run e6d2803f --export langgraph` → usage, exit 2
    privacy             key fields: ids, harness, group, counts, sha256, fork step only; keygen holds run ids only;
                        test fixture synthetic; no .sqlite tracked (git ls-files); bench writes to tmpdir and deletes

findings
P0                      none
P1                      none
P2-1 re-export drops forks
                        exportLangGraph calls saver.deleteThread(run id) before writing: any fork a user made on that
                        thread in the same file is deleted silently; checkpoint ids are fresh uuid6, so saved configs go stale
                        repro: grep -n deleteThread packages/agentstate/src/langgraph.ts → line with "re-export = replace"
                        fix idea: refuse or warn when the thread has checkpoints the exporter did not write
P2-2 protected API      `(saver as unknown as {setup(): void}).setup()` relies on a non-public SqliteSaver method;
                        a langgraph-checkpoint-sqlite bump can break it with no type error
P2-3 sample breadth     key = 15 runs; contract says "every run in the B5 sample". 15 is a fixed sample, defensible;
                        my all-B5 probe (897/897) backs it, but that probe is not part of the checks
                        repro: node ~/.hermes/cache/scratch/t20_probe.mjs <worktree> → "ALL-B5 round-trip 897/897"
P2-4 audit              npm audit high = @azure/msal-node via @vscode/vsce/ovsx (apps/vscode); present at base 24cf82c,
                        not from T20's langgraph deps. Moderate: vitest/@vitest/mocker
note                    "empty thread" exists only as a mole_threads row: LangGraph has no thread without a checkpoint
                        (documented in 2 insights.md); tried is per step, not cumulative (documented INFERENCE)

commands run
    npx tsc -b && npx vitest run packages/agentstate     → 3 files, 22 tests passed
    npm run check                                        → 21 files, 150 tests passed
    node packages/agentstate/dist/bench/m10.js           → M10 round-trip 100.0% (15/15, 3747) · fork 3/3 · empty 2/2, exit 0
```
