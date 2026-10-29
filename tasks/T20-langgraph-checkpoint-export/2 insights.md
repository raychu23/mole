# T20 insights (mole-builder-2, 2026-10-29)

```notes
write path              saver.put per step, not replay through a compiled StateGraph
    why                 invoke() writes several checkpoints per super-step (input + loop) and updateState stamps now() as ts;
                        put gives exactly one checkpoint per step, ts = the step's own time, parent = previous step, and
                        metadata carries T18's checkpoint id + harness/operation/kind (metadata.mole)
    format              mimics what LangGraph's own updateState stores (probed): v 4, channel_values, channel_versions
                        (every channel = step number), versions_seen {}, metadata {source 'update', step, parents {}}
    ids                 uuid6 (from @langchain/langgraph-checkpoint), forced to rise: SqliteSaver.list orders by
                        checkpoint_id DESC, so T18's '<run>:<index>' ids would sort run:10 before run:2
read back               bench + tests build their OWN StateGraph(Annotation.Root same channels) + SqliteSaver on the file;
                        the exporter also exports runGraph(file) / RunState for users, but no check uses them
values                  {step {id,index,kind}, contextVersion {repo,gitSha,files}, filesRead, tried, changed}
    tried = per step    INFERENCE: kept T18's per-step semantics (this step's attempt), LastValue channel. A cumulative
                        append-reducer channel would store the whole list in every checkpoint (SqliteSaver stores full
                        channel_values): a 1216-step run with ~1 KB commands -> O(n^2), hundreds of MB. Full list = walk history
    filesRead/changed   cumulative so far (as T18 has them); 15 runs / 3747 checkpoints = 13 MB file
empty run               0 checkpoints (LangGraph has no row for a thread without one) + note in the result, the CLI output
                        and a mole_threads row (thread_id, harness, cwd, start, end, checkpoints, note, exported_at)
re-export               deleteThread first: same run into the same file replaces its chain, other threads stay
setup                   SqliteSaver.setup() is protected and deleteThread doesn't call it -> cast call before deleteThread
fork                    graph.updateState(config of step k, {tried: [marker]}, 'replay'): node name can't equal a channel
                        name ('step' is a channel), hence node 'replay'
sample (key)            T18 M7 sessions minus 3 being resumed today (20261013_231752_0135ee, 20261015_064949_38dbe5,
                        20261017_092042_a6584e: 38dbe5 grew 1199 -> 1207 steps between two key runs minutes apart) +
                        local-9982f… + 3 claude-code + 4 codex; forks at floor(n/2) in one run per harness; empty = 1
                        claude-code + 1 codex 0-step run. Chosen + fixed before the red commit (key written 01:45)
    drift risk          if a sampled session is resumed later, the bench says "source drifted since the key" (not a pass)
deps                    @langchain/langgraph 1.5.3, -checkpoint-sqlite 1.1.0, -checkpoint 1.2.1, @langchain/core 1.3.1
                        better-sqlite3 installed from prebuilt on node v22.21.0, no build issue
privacy                 key = ids, counts, sha256 only. Exported files quote commands: bench writes to os.tmpdir() and deletes
```
