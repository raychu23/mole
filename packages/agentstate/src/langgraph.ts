// T20: export a run T18 reconstructs as real LangGraph checkpoints, written with LangGraph.js's SQLite checkpointer
// (@langchain/langgraph-checkpoint-sqlite SqliteSaver), so LangGraph's own tooling (getStateHistory, time travel,
// updateState forks, LangGraph Studio) can open the file. One thread per run (thread_id = run id), one checkpoint per step,
// chained by parent checkpoint id; channel values = RunState below. Written with saver.put (not by invoking a graph), so
// the checkpoint ts is the step's own time and there is exactly one checkpoint per step (see tasks/T20…/2 insights.md).
// The file quotes commands the agent ran: keep it under .mole/local/ or a scratch dir, never commit it.
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { uuid6, type Checkpoint as LGCheckpoint, type CheckpointMetadata } from '@langchain/langgraph-checkpoint';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import type { ContextVersion, RunGraph, StepKind, TriedItem } from './types.js';

/** The graph state of a run at one step (each key is a LangGraph channel, last value wins). */
export interface RunValues {
  step: { id: string; index: number; kind: StepKind };
  contextVersion: Omit<ContextVersion, 'read'>;
  filesRead: string[]; // files read so far in the run
  tried: TriedItem[]; // what this step tried (the run's full list = walk the history)
  changed: { files: string[]; commits: string[] }; // so far in the run
}

/** The channels, for anyone building a StateGraph over an exported file (same keys as RunValues). */
export const RunState = Annotation.Root({
  step: Annotation<RunValues['step']>(),
  contextVersion: Annotation<RunValues['contextVersion']>(),
  filesRead: Annotation<string[]>(),
  tried: Annotation<TriedItem[]>(),
  changed: Annotation<RunValues['changed']>(),
});
const CHANNELS = ['step', 'contextVersion', 'filesRead', 'tried', 'changed'] as const;

/** A compiled one-node graph over an exported file: getStateHistory / getState / updateState (fork, as node 'replay'). */
export function runGraph(file: string) {
  const saver = SqliteSaver.fromConnString(file);
  const graph = new StateGraph(RunState).addNode('replay', () => ({})).addEdge(START, 'replay').addEdge('replay', END).compile({ checkpointer: saver });
  return { saver, graph };
}

/** RunValues per checkpoint, from T18's RunGraph (checkpoints[i] belongs to steps[i]). */
export function runValues(g: RunGraph): RunValues[] {
  return g.checkpoints.map((c, i) => {
    const s = g.steps[i]!;
    const { repo, gitSha, files, read } = c.values.context;
    return { step: { id: s.id, index: s.index, kind: s.kind }, contextVersion: { repo, gitSha, files }, filesRead: read, tried: c.values.tried, changed: c.values.changed };
  });
}

export interface LangGraphExport {
  file: string;
  thread_id: string;
  checkpoints: number;
  note: string | null;
}

const THREADS = `CREATE TABLE IF NOT EXISTS mole_threads (
  thread_id TEXT PRIMARY KEY, harness TEXT NOT NULL, cwd TEXT, start TEXT, end TEXT,
  checkpoints INTEGER NOT NULL, note TEXT, exported_at TEXT NOT NULL)`;

/** Write run g into file as LangGraph thread g.run.id (replacing an earlier export of the same run; other threads stay).
 * A 0-step run becomes an empty thread: no checkpoints, a note in the result and in the file's mole_threads table. */
export async function exportLangGraph(g: RunGraph, file: string): Promise<LangGraphExport> {
  const path = resolve(file);
  mkdirSync(dirname(path), { recursive: true });
  const saver = SqliteSaver.fromConnString(path);
  const thread_id = g.run.id;
  const values = runValues(g);
  const note = values.length === 0 ? `run ${thread_id} has 0 steps (no tool calls): exported as an empty thread with no checkpoints` : null;
  try {
    (saver as unknown as { setup(): void }).setup(); // create LangGraph's tables (protected; put/getTuple call it lazily, deleteThread does not)
    await saver.deleteThread(thread_id); // re-export = replace, never a second chain in the same thread
    saver.db.exec(THREADS);
    saver.db.exec('BEGIN');
    try {
      let parent: string | undefined;
      for (let i = 0; i < values.length; i++) {
        let id = uuid6(-1);
        while (parent !== undefined && id <= parent) id = uuid6(-1); // list() orders by checkpoint_id: ids must rise with the steps
        const v = values[i]!;
        const c = g.checkpoints[i]!;
        const checkpoint: LGCheckpoint = {
          v: 4,
          id,
          ts: c.ts,
          channel_values: { ...v },
          channel_versions: Object.fromEntries(CHANNELS.map((k) => [k, i + 1])),
          versions_seen: {},
        };
        const metadata = {
          source: 'update',
          step: v.step.index,
          parents: {},
          mole: { checkpoint_id: c.checkpoint_id, harness: c.metadata.source, operation: c.metadata.operation, kind: c.metadata.kind },
        } as CheckpointMetadata;
        const cfg = await saver.put({ configurable: { thread_id, checkpoint_ns: '', ...(parent ? { checkpoint_id: parent } : {}) } }, checkpoint, metadata);
        parent = cfg.configurable?.checkpoint_id as string;
      }
      saver.db
        .prepare('INSERT OR REPLACE INTO mole_threads (thread_id, harness, cwd, start, end, checkpoints, note, exported_at) VALUES (?,?,?,?,?,?,?,?)')
        .run(thread_id, g.run.harness, g.run.cwd, g.run.start, g.run.end, values.length, note, new Date().toISOString());
      saver.db.exec('COMMIT');
    } catch (e) {
      saver.db.exec('ROLLBACK');
      throw e;
    }
  } finally {
    saver.db.close();
  }
  return { file: path, thread_id, checkpoints: values.length, note };
}
