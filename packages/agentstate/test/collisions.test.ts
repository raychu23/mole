// T21 red tests (contract tasks/T21-parallel-agent-collisions/0 start.md): done-when 1 (mole collisions [--json]: live-run
// pairs, shared functions, edge path, which run changed what, newest first), 2 (MCP mole_collisions; hook output waits for
// T15), 4 (no warning when two runs only touch unrelated files), 5 (a transcript still being written is read up to its last
// complete step), plus "a run edits code under a note". Fixtures: synthetic Claude Code JSONL + Hermes state.db rows.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addNote } from '@mole/memory';
import { collisions, formatCollisions, type CollisionsResult, type Sources } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const cli = resolve(here, '../../daemon/dist/cli.js');
const mcpBin = resolve(here, '../../mcp/dist/cli.js');

const A_TS = [
  'export function top(): number {',
  '  return mid() + 1;',
  '}',
  '',
  'export function mid(): number {',
  '  return leaf() * 2;',
  '}',
  '',
  'export function leaf(): number {',
  '  return deep() - 3;',
  '}',
  '',
  'export function deep(): number {',
  '  return 42;',
  '}',
  '',
  'export function lonely(): string {',
  "  return 'lonely value';",
  '}',
  '',
].join('\n');
const E_TS = "export function gamma(): string {\n  return 'gamma';\n}\n";
const F_TS = "export function alpha(): string {\n  return 'alpha';\n}\n";
const fnText = (name: string): string => {
  const lines = A_TS.split('\n');
  const i = lines.findIndex((l) => l.startsWith(`export function ${name}(`));
  return lines.slice(i, i + 3).join('\n');
};

let base: string;
let root: string;
let src: Required<Sources>;
const NOW = Date.now();
const ago = (min: number): string => new Date(NOW - min * 60_000).toISOString();

/** one Claude Code session file: steps = [minutesAgo, tool, input, complete?] */
function claude(id: string, steps: Array<[number, 'Edit' | 'Read', Record<string, unknown>, boolean?]>, extra = ''): void {
  const lines: string[] = [];
  steps.forEach(([m, tool, input, complete], i) => {
    const tid = `toolu_${id}_${i}`;
    lines.push(JSON.stringify({ type: 'assistant', sessionId: id, cwd: root, timestamp: ago(m), message: { role: 'assistant', content: [{ type: 'tool_use', id: tid, name: tool, input }] } }));
    if (complete !== false)
      lines.push(JSON.stringify({ type: 'user', sessionId: id, cwd: root, timestamp: ago(m - 0.05), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: tid, content: 'ok' }] } }));
  });
  writeFileSync(join(src.claudeDir, 'proj', `${id}.jsonl`), lines.join('\n') + '\n' + extra);
}
const edit = (name: string, file = 'src/a.ts'): Record<string, unknown> => ({ file_path: join(root, file), old_string: fnText(name), new_string: fnText(name) });

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'mole-t21-'));
  root = join(base, 'repo');
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src/a.ts'), A_TS);
  writeFileSync(join(root, 'src/e.ts'), E_TS);
  writeFileSync(join(root, 'src/f.ts'), F_TS);
  src = { hermesDb: join(base, 'state.db'), claudeDir: join(base, 'claude'), codexDir: join(base, 'codex-none') };
  mkdirSync(join(src.claudeDir, 'proj'), { recursive: true });

  // same function: c-same1 edits mid at -50, c-same2 edits mid at -40 (newest)
  claude('c-same1', [[50, 'Edit', edit('mid')]]);
  claude('c-same2', [[40, 'Edit', edit('mid')]]);
  // 2-hop chain top -> mid -> leaf: c-hop-a edits top at -30, c-hop-b edits leaf at -28
  claude('c-hop-a', [[30, 'Edit', edit('top')]]);
  claude('c-hop-b', [[28, 'Edit', edit('leaf')]]);
  // unrelated files, same window: c-un-a edits e.ts#gamma, c-un-b edits f.ts#alpha
  claude('c-un-a', [[20, 'Edit', { file_path: join(root, 'src/e.ts'), old_string: E_TS.trim(), new_string: E_TS.trim() }]]);
  claude('c-un-b', [[19, 'Edit', { file_path: join(root, 'src/f.ts'), old_string: F_TS.trim(), new_string: F_TS.trim() }]]);
  // still being written: a complete edit of lonely, then an edit of deep with no result yet, then a half line
  claude('c-live', [[10, 'Edit', edit('lonely')], [9, 'Edit', edit('deep'), false]], '{"type":"assistant","sessionId":"c-live","timestamp":"' + ago(8) + '","message":{"content":[{"type":"tool_use","id":"cut","name":"Edit","input":{"file_pa');
  // c-lonely2 edits lonely too (collides with c-live's complete step)
  claude('c-lonely2', [[11, 'Edit', edit('lonely')]]);

  // Hermes: h-live has a complete patch of src/e.ts#gamma and an in-progress patch of src/a.ts#deep (no tool row yet)
  const db = new DatabaseSync(src.hermesDb);
  db.exec(`CREATE TABLE sessions (id TEXT PRIMARY KEY, source TEXT NOT NULL, cwd TEXT, parent_session_id TEXT, started_at REAL NOT NULL,
    ended_at REAL, message_count INTEGER DEFAULT 0, tool_call_count INTEGER DEFAULT 0, title TEXT, model TEXT);
  CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT,
    tool_call_id TEXT, tool_calls TEXT, tool_name TEXT, timestamp REAL NOT NULL, _compressed_summary INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1, compacted INTEGER NOT NULL DEFAULT 0);`);
  const s = (min: number): number => (NOW - min * 60_000) / 1000;
  db.prepare('INSERT INTO sessions (id, source, cwd, parent_session_id, started_at, ended_at, title) VALUES (?,?,?,?,?,?,?)').run('h-live', 'cli', root, null, s(7), null, 'live hermes run');
  const ins = db.prepare('INSERT INTO messages (session_id, role, content, tool_call_id, tool_calls, tool_name, timestamp) VALUES (?,?,?,?,?,?,?)');
  const call = (id: string, args: unknown): string => JSON.stringify([{ id, call_id: id, type: 'function', function: { name: 'patch', arguments: JSON.stringify(args) } }]);
  ins.run('h-live', 'assistant', null, null, call('hc1', { path: join(root, 'src/e.ts'), old_string: E_TS.trim(), new_string: E_TS.trim() }), null, s(6));
  ins.run('h-live', 'tool', '{"success": true}', 'hc1', null, 'patch', s(5.9));
  ins.run('h-live', 'assistant', null, null, call('hc2', { path: join(root, 'src/a.ts'), old_string: fnText('deep'), new_string: fnText('deep') }), null, s(5));
  db.close();
  // c-deep2 edits deep near both live runs: c-live's and h-live's edits of deep are in progress, so no pair from deep
  claude('c-deep2', [[6, 'Edit', edit('deep')]]);
});
afterAll(() => rmSync(base, { recursive: true, force: true }));

const pairOf = (r: CollisionsResult, x: string, y: string) => r.pairs.find((p) => (p.a.run === x && p.b.run === y) || (p.a.run === y && p.b.run === x));
const all = (): CollisionsResult => collisions({ ...src, root, since: 0 });

describe('collisions (T21)', () => {
  it('same function edited by two parallel runs: both run ids + harness, shared function, which run changed what, newest first', () => {
    const r = all();
    const p = pairOf(r, 'c-same1', 'c-same2');
    expect(p).toBeDefined();
    expect(p!.a.harness).toBe('claude-code');
    expect(p!.shared).toEqual(['src/a.ts#mid']);
    expect(p!.path).toEqual([]);
    const who = p!.changes.map((c) => `${c.run} ${c.how} ${c.symbol}`);
    expect(who).toEqual(['c-same2 edit src/a.ts#mid', 'c-same1 edit src/a.ts#mid']); // newest first
    const times = r.pairs.map((x) => Date.parse(x.time)); // pairs newest first
    expect([...times].sort((u, v) => v - u)).toEqual(times);
    expect(r.windowMinutes).toBe(15);
    expect(r.hops).toBe(2);
  });

  it('2-hop call chain: the edge path between the two runs is listed edge by edge', () => {
    const p = pairOf(all(), 'c-hop-a', 'c-hop-b');
    expect(p).toBeDefined();
    expect(p!.shared).toEqual([]);
    expect(p!.path).toEqual(['src/a.ts#top -> src/a.ts#mid', 'src/a.ts#mid -> src/a.ts#leaf']);
    expect(p!.changes.map((c) => c.symbol).sort()).toEqual(['src/a.ts#leaf', 'src/a.ts#top']);
  });

  it('no warning when two runs only touch unrelated files (done-when 4)', () => {
    const r = all();
    expect(pairOf(r, 'c-un-a', 'c-un-b')).toBeUndefined();
    expect(collisions({ ...src, root, since: 0, runs: ['c-un-a', 'c-un-b'] }).pairs).toEqual([]);
  });

  it('a transcript still being written is read up to its last complete step (done-when 5)', () => {
    const r = all(); // must not throw on the half-written last line
    expect(r.runs.map((x) => x.id)).toEqual(expect.arrayContaining(['c-live', 'h-live']));
    expect(pairOf(r, 'c-live', 'c-lonely2')?.shared).toEqual(['src/a.ts#lonely']); // the complete edit counts
    // the pending edits of deep (Claude tool call without result, Hermes call without its tool row) do not
    expect(pairOf(r, 'c-live', 'c-deep2')).toBeUndefined();
    expect(pairOf(r, 'h-live', 'c-deep2')).toBeUndefined();
    const live = r.runs.find((x) => x.id === 'c-live')!;
    expect(Date.parse(live.last)).toBeLessThan(NOW - 9.5 * 60_000); // last complete step, not the pending one
  });

  it('--run keeps only the pairs of that run', () => {
    const r = collisions({ ...src, root, since: 0, run: 'c-hop-b' });
    expect(r.pairs.length).toBeGreaterThan(0);
    for (const p of r.pairs) expect([p.a.run, p.b.run]).toContain('c-hop-b');
  });

  it('a run that edits code under a note is reported', () => {
    const n = addNote(root, 'src/a.ts#leaf', 'leaf is subtracted on purpose, see the fixture', { author: 'test', date: '2026-10-29' });
    try {
      const hit = all().notes.find((x) => x.run === 'c-hop-b' && x.symbol === 'src/a.ts#leaf');
      expect(hit).toBeDefined();
      expect(hit!.note).toBe(n.file);
    } finally {
      rmSync(join(root, n.file), { force: true });
    }
  });

  it('formatCollisions prints both run ids with harness, the shared function and the path', () => {
    const text = formatCollisions(all());
    expect(text).toContain('c-same1');
    expect(text).toContain('c-same2');
    expect(text).toContain('claude-code');
    expect(text).toContain('src/a.ts#mid');
    expect(text).toContain('src/a.ts#top -> src/a.ts#mid');
  });
});

describe('mole collisions CLI + MCP mole_collisions (T21)', () => {
  const env = (): Record<string, string> => ({ ...process.env, MOLE_HERMES_DB: src.hermesDb, MOLE_CLAUDE_DIR: src.claudeDir, MOLE_CODEX_DIR: src.codexDir }) as Record<string, string>;
  const mole = (a: string[]) => spawnSync(process.execPath, ['--no-warnings', cli, ...a, '--root', root], { encoding: 'utf8', env: env() });

  it('mole collisions --json = the library result; text view lists the pair; --run keeps that run only', () => {
    const c = mole(['collisions', '--json']);
    expect(c.status).toBe(0);
    const j = JSON.parse(c.stdout) as CollisionsResult;
    const lib = collisions({ ...src, root });
    expect(j.pairs.map((p) => [p.a.run, p.b.run, p.shared, p.path])).toEqual(lib.pairs.map((p) => [p.a.run, p.b.run, p.shared, p.path]));
    expect(pairOf(j, 'c-same1', 'c-same2')).toBeDefined();
    const t = mole(['collisions']);
    expect(t.status).toBe(0);
    expect(t.stdout).toContain('c-same2');
    const solo = mole(['collisions', '--run', 'c-un-a']);
    expect(solo.status).toBe(0);
    expect(solo.stdout).not.toContain('c-un-b');
  }, 60000);

  it('MCP tool mole_collisions returns the library JSON for one run', async () => {
    const client = new Client({ name: 'test', version: '0' });
    await client.connect(new StdioClientTransport({ command: process.execPath, args: ['--no-warnings', mcpBin], env: { ...env(), MOLE_ROOT: root } }));
    try {
      const tools = await client.listTools();
      expect(tools.tools.map((t) => t.name)).toContain('mole_collisions');
      const res = await client.callTool({ name: 'mole_collisions', arguments: { run: 'c-same2' } });
      const j = JSON.parse((res.content as Array<{ text: string }>)[0]?.text ?? '{}') as CollisionsResult;
      expect(j.pairs.map((p) => [p.a.run, p.b.run].sort().join(' '))).toContain('c-same1 c-same2');
      for (const p of j.pairs) expect([p.a.run, p.b.run]).toContain('c-same2');
    } finally {
      await client.close();
    }
  }, 60000);
});
