// T20 bench M10 (checks: `npm run check && node packages/agentstate/dist/bench/m10.js`).
// M10 LangGraph round-trip fidelity. The key (bench/m10-key.json, committed: ids, counts and hashes only) was written BEFORE
// the exporter by tasks/T20-langgraph-checkpoint-export/4 log/m10-keygen.mjs with T18's reader (getRun): per sampled run the
// checkpoint count and a sha256 of the canonical per-step values. Here each run is exported with exportLangGraph and read
// back ONLY through LangGraph's own API: a StateGraph built here (Annotation.Root with the same channels), compiled with
// checkpointer = SqliteSaver on the exported file, then graph.getStateHistory({configurable: {thread_id}}).
//   run ok      history length = key count · parent links form one chain, oldest first · step index order = T18's step order
//               · sha256 of the read-back values = key sha256 (and deep-equal to the live T18 values)
//   fork ok     graph.updateState(config of step k, {tried: [marker]}, 'replay') makes a checkpoint whose parent is step k, its
//               values = step k's with only tried changed, and the original checkpoints are unchanged (ids, parents, values)
//   empty ok    a 0-step run exports without throwing, returns a note, and getStateHistory on its thread is empty
// Target: 100% runs ok, every fork ok, every empty case ok. A missing source run fails the bench (exit 2) and says which.
// The exported file quotes commands, so it lives in a temp dir (TMPDIR) and is deleted at the end.
// usage: node packages/agentstate/dist/bench/m10.js [--metrics-out FILE] [--keep FILE.sqlite]
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { Annotation, END, START, StateGraph, type StateSnapshot } from '@langchain/langgraph';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import { defaultSources, exportLangGraph, getRun, type RunGraph } from '../src/index.js';

interface Key {
  written: string;
  runs: Array<{ id: string; harness: string; checkpoints: number; sha256: string }>;
  forks: Array<{ id: string; harness: string; step: number }>;
  empty: Array<{ id: string; harness: string }>;
}

const args = process.argv.slice(2);
const flag = (n: string): string | undefined => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const here = dirname(fileURLToPath(import.meta.url));
const keyPath = resolve(here, '../../bench/m10-key.json'); // dist/bench -> bench
const git = (a: string[]): string => execFileSync('git', a, { encoding: 'utf8', cwd: here }).trim();

function fail(msg: string): never {
  console.log(`M10 FAIL ${msg}`);
  const out = flag('--metrics-out');
  if (out) writeFileSync(out, JSON.stringify({ M10: `FAIL ${msg}` }));
  process.exit(2);
}
if (!existsSync(keyPath)) fail(`key not found at ${keyPath}`);
const key = JSON.parse(readFileSync(keyPath, 'utf8')) as Key;
// R1: the key is older than the red commit (the commit that added this bench)
const top = git(['rev-parse', '--show-toplevel']);
const red = git(['-C', top, 'log', '--diff-filter=A', '--format=%cI', '--', 'packages/agentstate/bench/m10.ts']).split('\n').filter(Boolean).at(-1);
if (red && Date.parse(key.written) > Date.parse(red)) fail(`key written ${key.written} after the red commit ${red}`);

// ---- the read-back side: LangGraph's own API only
const State = Annotation.Root({
  step: Annotation<{ id: string; index: number; kind: string }>(),
  contextVersion: Annotation<{ repo: string | null; gitSha: string | null; files: Record<string, string | null> }>(),
  filesRead: Annotation<string[]>(),
  tried: Annotation<unknown[]>(),
  changed: Annotation<{ files: string[]; commits: string[] }>(),
});
const CHANNELS = ['step', 'contextVersion', 'filesRead', 'tried', 'changed'] as const;
const compile = (saver: SqliteSaver) =>
  new StateGraph(State)
    .addNode('replay', () => ({}))
    .addEdge(START, 'replay')
    .addEdge('replay', END)
    .compile({ checkpointer: saver });
type Graph = ReturnType<typeof compile>;

const sortKeys = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys((v as Record<string, unknown>)[k])])) : v;
const pick = (v: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(CHANNELS.map((c) => [c, v[c]]));
const sha = (vals: unknown[]): string => createHash('sha256').update(JSON.stringify(vals.map(sortKeys))).digest('hex');
const same = (a: unknown, b: unknown): boolean => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
/** T18's values, mapped the way the key generator mapped them */
const liveValues = (g: RunGraph): unknown[] =>
  g.checkpoints.map((c, i) => {
    const s = g.steps[i]!;
    const { repo, gitSha, files, read } = c.values.context;
    return { step: { id: s.id, index: s.index, kind: s.kind }, contextVersion: { repo, gitSha, files }, filesRead: read, tried: c.values.tried, changed: c.values.changed };
  });
const cid = (s: { config: { configurable?: Record<string, unknown> } } | undefined): string | undefined => s?.config.configurable?.checkpoint_id as string | undefined;
const pid = (s: StateSnapshot): string | undefined => s.parentConfig?.configurable?.checkpoint_id as string | undefined;

async function history(graph: Graph, thread: string): Promise<StateSnapshot[]> {
  const out: StateSnapshot[] = [];
  for await (const s of graph.getStateHistory({ configurable: { thread_id: thread } })) out.push(s);
  return out.reverse(); // LangGraph lists newest first
}
/** history as one parent chain, oldest first; a problem string when it is not one */
function chain(h: StateSnapshot[]): string | null {
  for (let i = 0; i < h.length; i++) {
    const want = i === 0 ? undefined : cid(h[i - 1]);
    if (pid(h[i]!) !== want) return `checkpoint ${i} parent ${pid(h[i]!) ?? 'none'} != ${want ?? 'none'}`;
  }
  return null;
}

const dir = mkdtempSync(join(tmpdir(), 'mole-m10-'));
const file = flag('--keep') ?? join(dir, 'runs.sqlite');
const src = defaultSources();
const missing: string[] = [];
const lines: string[] = [];
let runsOk = 0;
let checkpoints = 0;
let drift = 0;
let forksOk = 0;
let emptyOk = 0;
let exportMs = 0;
let readMs = 0;
try {
  const saver = SqliteSaver.fromConnString(file);
  const graph = compile(saver);
  const graphs = new Map<string, RunGraph>();
  for (const r of key.runs) {
    const g = getRun(r.id, { ...src, all: true });
    if (!g) {
      missing.push(`${r.harness} ${r.id}`);
      continue;
    }
    graphs.set(r.id, g);
    const live = liveValues(g);
    const liveSha = sha(live);
    if (liveSha !== r.sha256) drift++;
    let t = performance.now();
    let why: string | null = null;
    try {
      const res = await exportLangGraph(g, file);
      if (res.thread_id !== r.id || res.checkpoints !== g.checkpoints.length) why = `export said thread ${res.thread_id} ${res.checkpoints} checkpoints`;
    } catch (e) {
      why = `export threw: ${e instanceof Error ? e.message : String(e)}`;
    }
    exportMs += performance.now() - t;
    t = performance.now();
    const h = await history(graph, r.id);
    readMs += performance.now() - t;
    const vals = h.map((s) => pick(s.values as Record<string, unknown>));
    if (!why && h.length !== r.checkpoints) why = `history ${h.length} checkpoints, key ${r.checkpoints}`;
    if (!why) why = chain(h);
    if (!why) {
      const idx = vals.map((v) => (v.step as { index: number } | undefined)?.index);
      const want = g.steps.map((s) => s.index);
      if (!same(idx, want)) why = 'step order differs';
    }
    if (!why && sha(vals) !== r.sha256) {
      const at = vals.findIndex((v, i) => !same(v, live[i]));
      why = `values sha256 differs from key${liveSha !== r.sha256 ? ' (source drifted since the key: live T18 values differ too)' : ''}${at >= 0 ? `; first live difference at checkpoint ${at}` : ''}`;
    }
    if (!why) runsOk++;
    checkpoints += h.length;
    lines.push(`  ${why ? 'FAIL' : 'ok  '} ${r.harness.padEnd(11)} ${r.id.slice(0, 40).padEnd(40)} ${String(h.length).padStart(5)}/${r.checkpoints}${why ? `  ${why}` : ''}`);
  }
  for (const f of key.forks) {
    const g = graphs.get(f.id);
    if (!g) {
      lines.push(`  FAIL fork ${f.id}: run not exported`);
      continue;
    }
    let why: string | null = null;
    try {
      const before = await history(graph, f.id);
      const target = before[f.step];
      if (!target) throw new Error(`no checkpoint ${f.step}`);
      const marker = [{ command: `mole-m10 fork marker ${f.id}:${f.step}`, kind: 'command', outcome: 'unknown', at: new Date(0).toISOString(), segment: null, run: f.id, step: 'fork' }];
      const forkCfg = await graph.updateState(target.config, { tried: marker }, 'replay');
      const fork = await graph.getState(forkCfg);
      const after = await history(graph, f.id);
      const kept = after.filter((s) => cid(s) !== cid(fork));
      if (pid(fork) !== cid(target)) why = `fork parent ${pid(fork)} != step ${f.step} ${cid(target)}`;
      else if (!same(pick(fork.values as Record<string, unknown>), { ...pick(target.values as Record<string, unknown>), tried: marker })) why = 'fork values != step k values + update';
      else if (after.length !== before.length + 1) why = `history ${after.length} after the fork, want ${before.length + 1}`;
      else if (!same(kept.map((s) => [cid(s), pid(s), pick(s.values as Record<string, unknown>)]), before.map((s) => [cid(s), pid(s), pick(s.values as Record<string, unknown>)])))
        why = 'original checkpoints changed';
      else {
        const replay = await graph.getState(target.config); // time travel: step k is still readable as it was
        if (!same(pick(replay.values as Record<string, unknown>), pick(target.values as Record<string, unknown>))) why = 'step k changed';
      }
    } catch (e) {
      why = `threw: ${e instanceof Error ? e.message : String(e)}`;
    }
    if (!why) forksOk++;
    lines.push(`  ${why ? 'FAIL' : 'ok  '} fork  ${f.harness.padEnd(11)} ${f.id.slice(0, 40)} @ step ${f.step}${why ? `  ${why}` : ''}`);
  }
  for (const e of key.empty) {
    const g = getRun(e.id, { ...src, all: true });
    if (!g) {
      missing.push(`${e.harness} ${e.id} (empty case)`);
      continue;
    }
    let why: string | null = null;
    try {
      const res = await exportLangGraph(g, file);
      const h = await history(graph, e.id);
      if (g.checkpoints.length !== 0) why = `run now has ${g.checkpoints.length} steps`;
      else if (res.checkpoints !== 0 || h.length !== 0) why = `exported ${res.checkpoints}, history ${h.length}`;
      else if (!res.note) why = 'no note';
    } catch (err) {
      why = `threw: ${err instanceof Error ? err.message : String(err)}`;
    }
    if (!why) emptyOk++;
    lines.push(`  ${why ? 'FAIL' : 'ok  '} empty ${e.harness.padEnd(11)} ${e.id}${why ? `  ${why}` : ''}`);
  }
  saver.db.close();
} finally {
  // threads in the file are the one record of the export; count them with plain SQL for the summary line
  try {
    if (existsSync(file)) {
      const db = new DatabaseSync(file, { readOnly: true });
      const n = db.prepare('SELECT COUNT(DISTINCT thread_id) AS n FROM checkpoints').get() as { n: number };
      lines.push(`  file ${Math.round(statSync(file).size / 1024)} KB · ${n.n} threads with checkpoints`);
      db.close();
    }
  } catch {
    /* summary only */
  }
  if (!flag('--keep')) rmSync(dir, { recursive: true, force: true });
}

const pct = (a: number, b: number): string => `${b ? ((100 * a) / b).toFixed(1) : '0.0'}%`;
const summary = `M10 round-trip ${pct(runsOk, key.runs.length)} (${runsOk}/${key.runs.length} runs, ${checkpoints} checkpoints) · fork ${forksOk}/${key.forks.length} · empty ${emptyOk}/${key.empty.length}${missing.length ? ` · MISSING ${missing.length}` : ''}${drift ? ` · source drift ${drift}` : ''} · export ${Math.round(exportMs)} ms, read ${Math.round(readMs)} ms · target 100%, all forks, all empty`;
console.log(summary);
console.log(`  key written ${key.written} · ${key.runs.length} runs, ${key.forks.length} forks, ${key.empty.length} empty`);
for (const l of lines) console.log(l);
for (const m of missing) console.log(`  MISSING source run ${m}`);
const out = flag('--metrics-out');
if (out) writeFileSync(out, JSON.stringify({ M10: summary.slice(4), M10_runs: runsOk / key.runs.length, M10_forks: `${forksOk}/${key.forks.length}`, M10_empty: `${emptyOk}/${key.empty.length}` }));
if (missing.length) process.exit(2);
process.exit(runsOk === key.runs.length && forksOk === key.forks.length && emptyOk === key.empty.length ? 0 : 1);
