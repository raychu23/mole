// T20 red tests (contract tasks/T20-langgraph-checkpoint-export/0 start.md): done-when 1 (`mole run <id> --export langgraph
// <file.sqlite>`: one thread per run, one checkpoint per step, parent links, values {contextVersion, filesRead, tried, changed}
// + step id/kind), 2 (read back through LangGraph's own getStateHistory = same steps, order, values), 3 (fork from a mid-run
// checkpoint with LangGraph's updateState), 4 (0-step run = empty thread + note, no crash).
// The read-back graph is built HERE from @langchain/langgraph (not imported from the exporter), so the test checks the file
// against LangGraph's API, not against the exporter's own reader. Fixture: a synthetic Hermes state.db (T18's format).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Annotation, END, START, StateGraph, type StateSnapshot } from '@langchain/langgraph';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import { exportLangGraph, getRun, type RunGraph, type Sources } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const cli = resolve(here, '../../daemon/dist/cli.js');
const R1 = '20261102_100000_cccccc'; // 4 tool calls
const R0 = '20261102_110000_dddddd'; // no tool calls: 0 steps

let base: string;
let root: string;
let src: Required<Sources>;

function hermesDb(file: string, t0: number): void {
  const db = new DatabaseSync(file);
  db.exec(`CREATE TABLE sessions (id TEXT PRIMARY KEY, source TEXT NOT NULL, cwd TEXT, parent_session_id TEXT, started_at REAL NOT NULL,
    ended_at REAL, message_count INTEGER DEFAULT 0, tool_call_count INTEGER DEFAULT 0, title TEXT, model TEXT);
  CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT,
    tool_call_id TEXT, tool_calls TEXT, tool_name TEXT, timestamp REAL NOT NULL, _compressed_summary INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1, compacted INTEGER NOT NULL DEFAULT 0);`);
  const ses = db.prepare('INSERT INTO sessions (id, source, cwd, parent_session_id, started_at, ended_at, message_count, title) VALUES (?,?,?,?,?,?,?,?)');
  ses.run(R1, 'cli', root, null, t0, t0 + 100, 9, 'export me');
  ses.run(R0, 'cli', root, null, t0 + 200, t0 + 210, 2, 'just talk');
  const ins = db.prepare('INSERT INTO messages (session_id, role, content, tool_call_id, tool_calls, tool_name, timestamp) VALUES (?,?,?,?,?,?,?)');
  const call = (id: string, name: string, a: unknown): string => JSON.stringify([{ id, call_id: id, type: 'function', function: { name, arguments: JSON.stringify(a) } }]);
  const step = (id: string, name: string, a: unknown, result: unknown, t: number): void => {
    ins.run(R1, 'assistant', null, null, call(id, name, a), null, t0 + t);
    ins.run(R1, 'tool', JSON.stringify(result), id, null, name, t0 + t + 1);
  };
  ins.run(R1, 'user', 'fix it', null, null, null, t0 + 1);
  step('c1', 'terminal', { command: 'npm test' }, { output: 'Tests 1 failed | 3 passed', exit_code: 1, error: null }, 2);
  step('c2', 'read_file', { path: join(root, 'src/a.ts') }, { content: '1|x' }, 4);
  step('c3', 'patch', { path: join(root, 'src/a.ts'), old_string: 'a', new_string: 'b' }, { success: true }, 6);
  step('c4', 'terminal', { command: 'npm test' }, { output: 'Tests 4 passed', exit_code: 0, error: null }, 8);
  ins.run(R0, 'user', 'hello', null, null, null, t0 + 201);
  ins.run(R0, 'assistant', 'hi', null, null, null, t0 + 202);
  db.close();
}

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'mole-t20-'));
  root = join(base, 'repo');
  spawnSync('mkdir', ['-p', join(root, 'src')]);
  src = { hermesDb: join(base, 'state.db'), claudeDir: join(base, 'none-claude'), codexDir: join(base, 'none-codex') };
  hermesDb(src.hermesDb, Date.parse('2026-11-02T10:00:00Z') / 1000);
});
afterAll(() => rmSync(base, { recursive: true, force: true }));

// ---- LangGraph's side, built independently of the exporter
const State = Annotation.Root({
  step: Annotation<{ id: string; index: number; kind: string }>(),
  contextVersion: Annotation<{ repo: string | null; gitSha: string | null; files: Record<string, string | null> }>(),
  filesRead: Annotation<string[]>(),
  tried: Annotation<unknown[]>(),
  changed: Annotation<{ files: string[]; commits: string[] }>(),
});
const open = (file: string) => {
  const saver = SqliteSaver.fromConnString(file);
  const graph = new StateGraph(State).addNode('replay', () => ({})).addEdge(START, 'replay').addEdge('replay', END).compile({ checkpointer: saver });
  return { saver, graph };
};
async function history(file: string, thread: string): Promise<StateSnapshot[]> {
  const { saver, graph } = open(file);
  const out: StateSnapshot[] = [];
  for await (const s of graph.getStateHistory({ configurable: { thread_id: thread } })) out.push(s);
  saver.db.close();
  return out.reverse();
}
const cid = (s: StateSnapshot | undefined): unknown => s?.config.configurable?.checkpoint_id;
const pid = (s: StateSnapshot): unknown => s.parentConfig?.configurable?.checkpoint_id;
const expected = (g: RunGraph) =>
  g.checkpoints.map((c, i) => ({
    step: { id: g.steps[i]!.id, index: g.steps[i]!.index, kind: g.steps[i]!.kind },
    contextVersion: { repo: c.values.context.repo, gitSha: c.values.context.gitSha, files: c.values.context.files },
    filesRead: c.values.context.read,
    tried: c.values.tried,
    changed: c.values.changed,
  }));
const valuesOf = (h: StateSnapshot[]) => h.map((s) => {
  const v = s.values as Record<string, unknown>;
  return { step: v.step, contextVersion: v.contextVersion, filesRead: v.filesRead, tried: v.tried, changed: v.changed };
});

describe('T20 LangGraph export', () => {
  it('done-when 1+2: one thread, one checkpoint per step, parent chain; getStateHistory returns the same steps, order and values', async () => {
    const g = getRun(R1, { ...src, all: true })!;
    expect(g.checkpoints.length).toBe(4);
    const file = join(base, 'one.sqlite');
    const res = await exportLangGraph(g, file);
    expect(res).toMatchObject({ thread_id: R1, checkpoints: 4, note: null });
    const h = await history(file, R1);
    expect(h).toHaveLength(4);
    expect(pid(h[0]!)).toBeUndefined();
    for (let i = 1; i < h.length; i++) expect(pid(h[i]!)).toBe(cid(h[i - 1]));
    expect(valuesOf(h)).toEqual(expected(g));
    expect(h.map((s) => (s.values as { step: { kind: string } }).step.kind)).toEqual(['test', 'read', 'edit', 'test']);
    expect(h.map((s) => s.metadata?.step)).toEqual(g.steps.map((s) => s.index));
  });

  it('re-exporting a run replaces its thread (no duplicate checkpoints) and other threads in the file stay', async () => {
    const file = join(base, 'two.sqlite');
    const g = getRun(R1, { ...src, all: true })!;
    await exportLangGraph(g, file);
    await exportLangGraph(getRun(R0, { ...src, all: true })!, file);
    await exportLangGraph(g, file);
    expect(await history(file, R1)).toHaveLength(4);
  });

  it('done-when 3: fork from a mid-run checkpoint with updateState: new branch whose parent is step k; original history unchanged', async () => {
    const g = getRun(R1, { ...src, all: true })!;
    const file = join(base, 'fork.sqlite');
    await exportLangGraph(g, file);
    const before = await history(file, R1);
    const { saver, graph } = open(file);
    const marker = [{ command: 'npm run check', kind: 'test', outcome: 'pass', at: '2026-11-02T10:00:30.000Z', segment: null, run: R1, step: 'fork' }];
    const forkCfg = await graph.updateState(before[1]!.config, { tried: marker }, 'replay');
    const fork = await graph.getState(forkCfg);
    saver.db.close();
    expect(pid(fork)).toBe(cid(before[1]));
    expect((fork.values as { tried: unknown }).tried).toEqual(marker);
    expect((fork.values as { filesRead: unknown }).filesRead).toEqual((before[1]!.values as { filesRead: unknown }).filesRead);
    const after = await history(file, R1);
    expect(after).toHaveLength(5);
    const orig = after.filter((s) => cid(s) !== cid(fork));
    expect(orig.map((s) => [cid(s), pid(s), s.values])).toEqual(before.map((s) => [cid(s), pid(s), s.values]));
  });

  it('done-when 4: a 0-step run exports an empty thread with a note, no crash', async () => {
    const g = getRun(R0, { ...src, all: true })!;
    expect(g.checkpoints).toHaveLength(0);
    const file = join(base, 'empty.sqlite');
    const res = await exportLangGraph(g, file);
    expect(res.checkpoints).toBe(0);
    expect(res.note).toMatch(/0 steps|no steps|empty/i);
    expect(await history(file, R0)).toHaveLength(0);
  });

  it('CLI: mole run <id> --export langgraph <file> writes the file and says so; a 0-step run exits 0 with the note', async () => {
    const env = { ...process.env, MOLE_HERMES_DB: src.hermesDb, MOLE_CLAUDE_DIR: src.claudeDir, MOLE_CODEX_DIR: src.codexDir };
    const file = join(base, 'cli.sqlite');
    const r = spawnSync(process.execPath, ['--no-warnings', cli, 'run', R1, '--export', 'langgraph', file, '--root', root], { encoding: 'utf8', env });
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(file)).toBe(true);
    expect(r.stdout).toMatch(/4 checkpoints/);
    expect(await history(file, R1)).toHaveLength(4);
    const e = spawnSync(process.execPath, ['--no-warnings', cli, 'run', R0, '--export', 'langgraph', file, '--root', root], { encoding: 'utf8', env });
    expect(e.status, e.stderr).toBe(0);
    expect(e.stdout + e.stderr).toMatch(/0 steps|no steps|empty/i);
    const bad = spawnSync(process.execPath, ['--no-warnings', cli, 'run', R1, '--export', 'dot', file, '--root', root], { encoding: 'utf8', env });
    expect(bad.status).toBe(2);
  }, 30_000); // key-ruling-3 (tasks/T21-parallel-agent-collisions/4 log)
});
