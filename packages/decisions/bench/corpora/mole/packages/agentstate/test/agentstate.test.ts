// T18 red tests (contract tasks/T18-agent-states/0 start.md): done-when 1 (runs + run graph + LangGraph checkpoints),
// 2 (tried incl. before a compaction; CLI + MCP mole_tried same JSON), 3 (context version + stale-note flag),
// 4 (agents <file#Symbol>, newest first), 7 (missing source = skipped, exit 0; read-only), 8 (writes only .mole/local/).
// Fixtures are synthetic copies of the 3 real formats (Hermes state.db rows, Claude Code JSONL, Codex rollout JSONL).
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addNote } from '@mole/memory';
import { agents, attribute, getRun, listRuns, tried, type Sources } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const cli = resolve(here, '../../daemon/dist/cli.js');
const mcpBin = resolve(here, '../../mcp/dist/cli.js');

const H1 = '20261101_100000_aaaaaa';
const H2 = '20261101_100500_bbbbbb';
const C1 = '11111111-2222-4333-8444-555555555555';
const X1 = '01a20000-0000-7000-8000-000000000001';

const A_V1 = 'export function add(a: number, b: number): number {\n  return a + b;\n}\n\nexport function sub(a: number, b: number): number {\n  return a - b;\n}\n';
const A_V2 = A_V1.replace('return a + b;', 'return a + b + 0;');

let base: string;
let root: string;
let src: Required<Sources>;
let commitSha: string; // the fixture commit H1 made (edit of src/a.ts#add)
let commitTime: number;
let noteFile: string; // repo-relative .mole/notes/<slug>.md written by T11's addNote

const git = (args: string[]): string => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
const put = (p: string, body: string): void => {
  mkdirSync(dirname(join(root, p)), { recursive: true });
  writeFileSync(join(root, p), body);
};
const iso = (s: number): string => new Date(s * 1000).toISOString();

function hermesDb(file: string, t0: number): void {
  const db = new DatabaseSync(file);
  db.exec(`CREATE TABLE sessions (id TEXT PRIMARY KEY, source TEXT NOT NULL, cwd TEXT, parent_session_id TEXT, started_at REAL NOT NULL,
    ended_at REAL, message_count INTEGER DEFAULT 0, tool_call_count INTEGER DEFAULT 0, title TEXT, model TEXT);
  CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT,
    tool_call_id TEXT, tool_calls TEXT, tool_name TEXT, timestamp REAL NOT NULL, _compressed_summary INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1, compacted INTEGER NOT NULL DEFAULT 0);`);
  const ses = db.prepare('INSERT INTO sessions (id, source, cwd, parent_session_id, started_at, ended_at, message_count, title) VALUES (?,?,?,?,?,?,?,?)');
  ses.run(H1, 'cli', root, null, t0, t0 + 100, 20, 'fix add');
  ses.run(H2, 'subagent', root, H1, t0 + 60, t0 + 70, 3, null);
  const ins = db.prepare('INSERT INTO messages (session_id, role, content, tool_call_id, tool_calls, tool_name, timestamp, _compressed_summary, active, compacted) VALUES (?,?,?,?,?,?,?,?,?,?)');
  const call = (id: string, name: string, args: unknown): string =>
    JSON.stringify([{ id, call_id: id, type: 'function', function: { name, arguments: JSON.stringify(args) } }]);
  const m = (s: string, role: string, content: string | null, cid: string | null, calls: string | null, tool: string | null, t: number, summary = 0, active = 1, compacted = 0) =>
    ins.run(s, role, content, cid, calls, tool, t, summary, active, compacted);
  // before the compaction (compacted = 1)
  m(H1, 'user', 'add is wrong, fix it', null, null, null, t0 + 1, 0, 0, 1);
  m(H1, 'assistant', null, null, call('c1', 'terminal', { command: 'npm test' }), null, t0 + 2, 0, 0, 1);
  m(H1, 'tool', JSON.stringify({ output: 'Tests 1 failed | 3 passed', exit_code: 1, error: null }), 'c1', null, 'terminal', t0 + 3, 0, 0, 1);
  m(H1, 'assistant', null, null, call('c2', 'read_file', { path: join(root, noteFile) }), null, t0 + 4, 0, 0, 1);
  m(H1, 'tool', JSON.stringify({ content: '1|note' }), 'c2', null, 'read_file', t0 + 5, 0, 0, 1);
  m(H1, 'assistant', null, null, call('c3', 'patch', { path: join(root, 'src/a.ts'), old_string: 'return a + b;', new_string: 'return a + b + 0;' }), null, t0 + 6, 0, 0, 1);
  m(H1, 'tool', JSON.stringify({ success: true, diff: '...' }), 'c3', null, 'patch', t0 + 7, 0, 0, 1);
  // the compaction summary
  m(H1, 'assistant', '[CONTEXT COMPACTION — REFERENCE ONLY] Earlier turns were compacted into the summary below.', null, null, null, t0 + 10, 1, 1, 0);
  // the kept tail re-inserted after the summary (same tool call ids, original timestamps): must not double count
  m(H1, 'assistant', null, null, call('c3', 'patch', { path: join(root, 'src/a.ts'), old_string: 'return a + b;', new_string: 'return a + b + 0;' }), null, t0 + 6, 0, 1, 0);
  m(H1, 'tool', JSON.stringify({ success: true, diff: '...' }), 'c3', null, 'patch', t0 + 7, 0, 1, 0);
  // after the compaction
  m(H1, 'assistant', null, null, call('c4', 'terminal', { command: 'npm test' }), null, t0 + 20, 0, 1, 0);
  m(H1, 'tool', JSON.stringify({ output: 'Tests 4 passed', exit_code: 0, error: null }), 'c4', null, 'terminal', t0 + 21, 0, 1, 0);
  m(H1, 'assistant', null, null, call('c5', 'terminal', { command: `cd ${root} && git commit -qam "fix add"` }), null, t0 + 22, 0, 1, 0);
  m(H1, 'tool', JSON.stringify({ output: `[main ${commitSha.slice(0, 7)}] fix add\n 1 file changed`, exit_code: 0, error: null }), 'c5', null, 'terminal', t0 + 23, 0, 1, 0);
  m(H1, 'assistant', null, null, call('c6', 'delegate_task', { goal: 'review the add fix' }), null, t0 + 59, 0, 1, 0);
  m(H1, 'tool', JSON.stringify({ results: [{ status: 'completed', summary: 'looks right' }] }), 'c6', null, 'delegate_task', t0 + 71, 0, 1, 0);
  // the subagent run
  m(H2, 'user', 'review the add fix', null, null, null, t0 + 60);
  m(H2, 'assistant', null, null, call('d1', 'terminal', { command: 'git show --stat HEAD' }), null, t0 + 61);
  m(H2, 'tool', JSON.stringify({ output: 'src/a.ts | 2 +-', exit_code: 0, error: null }), 'd1', null, 'terminal', t0 + 62);
  db.close();
}

function claudeDir(dir: string, t0: number): void {
  const proj = join(dir, '-tmp-fixture');
  mkdirSync(proj, { recursive: true });
  const base = { sessionId: C1, cwd: root, isSidechain: false, userType: 'external', version: '2.0.0' };
  const lines = [
    { ...base, type: 'user', uuid: 'u1', timestamp: iso(t0 + 200), message: { role: 'user', content: 'tidy b' } },
    { ...base, type: 'assistant', uuid: 'a1', timestamp: iso(t0 + 201), message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'npx vitest run' } }] } },
    { ...base, type: 'user', uuid: 'u2', timestamp: iso(t0 + 202), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'FAIL src/b.test.ts', is_error: true }] }, toolUseResult: { stdout: 'FAIL src/b.test.ts', stderr: '', interrupted: false } },
    { ...base, type: 'system', subtype: 'compact_boundary', uuid: 's1', timestamp: iso(t0 + 210), content: 'Conversation compacted', compactMetadata: { trigger: 'auto', preTokens: 1000 } },
    { ...base, type: 'user', uuid: 'u3', timestamp: iso(t0 + 211), isCompactSummary: true, message: { role: 'user', content: 'This session is being continued from a previous conversation.' } },
    { ...base, type: 'assistant', uuid: 'a2', timestamp: iso(t0 + 220), message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_2', name: 'Edit', input: { file_path: join(root, 'src/b.ts'), old_string: 'b', new_string: 'bb' } }] } },
    { ...base, type: 'user', uuid: 'u4', timestamp: iso(t0 + 221), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_2', content: 'ok' }] } },
  ];
  writeFileSync(join(proj, `${C1}.jsonl`), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
}

function codexDir(dir: string, t0: number): void {
  const d = join(dir, '2026/11/01');
  mkdirSync(d, { recursive: true });
  const lines = [
    { timestamp: iso(t0 + 300), type: 'session_meta', payload: { id: X1, timestamp: iso(t0 + 300), cwd: root, originator: 'codex_cli' } },
    { timestamp: iso(t0 + 301), type: 'response_item', payload: { type: 'function_call', name: 'shell', arguments: JSON.stringify({ command: ['bash', '-lc', 'ls src'] }), call_id: 'call_x1' } },
    { timestamp: iso(t0 + 302), type: 'response_item', payload: { type: 'function_call_output', call_id: 'call_x1', output: JSON.stringify({ output: 'a.ts\nb.ts\n', metadata: { exit_code: 0 } }) } },
    { timestamp: iso(t0 + 310), type: 'compacted', payload: { message: '', replacement_history: [] } },
  ];
  writeFileSync(join(d, `rollout-2026-11-01T00-00-00-${X1}.jsonl`), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
}

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'mole-agentstate-'));
  root = join(base, 'repo');
  mkdirSync(root);
  git(['init', '-q', '-b', 'main']);
  git(['config', 'user.email', 't@t']);
  git(['config', 'user.name', 't']);
  put('AGENTS.md', '# fixture agents\n');
  put('src/a.ts', A_V1);
  put('src/b.ts', 'export const b = 1;\n');
  noteFile = addNote(root, 'src/a.ts#add', 'add must stay pure', { author: 'raymond', date: '2026-11-01T00:00:00Z' }).file;
  git(['add', '-A']);
  const past = `${Math.floor(Date.now() / 1000) - 100} +0000`; // base is clearly older than every H1 step
  execFileSync('git', ['-C', root, 'commit', '-qm', 'base'], { env: { ...process.env, GIT_AUTHOR_DATE: past, GIT_COMMITTER_DATE: past } });
  put('src/a.ts', A_V2); // the agent's fix (H1 c3) -> T11 now marks the add note stale
  git(['commit', '-qam', 'fix add']);
  commitSha = git(['rev-parse', 'HEAD']);
  commitTime = Number(git(['log', '-1', '--format=%ct']));
  const t0 = commitTime - 22; // H1's `git commit` result lands right after the real commit time
  src = { hermesDb: join(base, 'state.db'), claudeDir: join(base, 'claude'), codexDir: join(base, 'codex') };
  hermesDb(src.hermesDb, t0);
  claudeDir(src.claudeDir, t0);
  codexDir(src.codexDir, t0);
});
afterAll(() => {
  if (base) rmSync(base, { recursive: true, force: true });
});

const env = (): Record<string, string> =>
  ({ ...process.env, MOLE_HERMES_DB: src.hermesDb, MOLE_CLAUDE_DIR: src.claudeDir, MOLE_CODEX_DIR: src.codexDir }) as Record<string, string>;
const mole = (args: string[], e = env()) => spawnSync(process.execPath, ['--no-warnings', cli, ...args, '--root', root], { encoding: 'utf8', env: e });

describe('done-when 1: runs + run graph', () => {
  it('lists runs from all 3 sources with harness, cwd, start, steps, compactions', () => {
    const r = listRuns({ ...src, root });
    expect(r.skipped).toEqual([]);
    const by = new Map(r.runs.map((x) => [x.id, x]));
    expect([...by.keys()].sort()).toEqual([C1, H1, H2, X1].sort());
    expect(by.get(H1)).toMatchObject({ harness: 'hermes', cwd: root, compactions: 1, parent: null });
    expect(by.get(H1)!.steps).toBe(6); // tool calls c1-c6, each once (the re-inserted copy of c3 is the same step)
    expect(by.get(H2)).toMatchObject({ harness: 'hermes', parent: H1, compactions: 0, steps: 1 });
    expect(by.get(C1)).toMatchObject({ harness: 'claude-code', cwd: root, compactions: 1, steps: 2 });
    expect(by.get(X1)).toMatchObject({ harness: 'codex', cwd: root, compactions: 1, steps: 1 });
    expect(Date.parse(by.get(H1)!.start)).toBe((commitTime - 22) * 1000);
    // newest first
    expect(r.runs.map((x) => x.id)).toEqual([...r.runs].sort((a, b) => Date.parse(b.start) - Date.parse(a.start)).map((x) => x.id));
  });

  it('a run graph has steps with OTel GenAI operations, subagent fan-out + merge, the compaction point, and LangGraph checkpoints', () => {
    const g = getRun(H1, { ...src, root })!;
    expect(g).not.toBeNull();
    expect(g.compactions).toHaveLength(1);
    expect(g.compactions[0]!.index).toBe(1);
    const ops = g.steps.map((s) => s.operation);
    expect(ops).toContain('execute_tool');
    expect(ops).toContain('invoke_agent'); // delegate_task
    expect(ops).toContain('compaction');
    const delegate = g.steps.find((s) => s.tool === 'delegate_task')!;
    expect(delegate.child).toBe(H2);
    expect(g.children).toHaveLength(1);
    expect(g.children[0]).toMatchObject({ spawnedBy: delegate.id });
    expect(g.children[0]!.run.id).toBe(H2);
    expect(g.children[0]!.mergedAt).not.toBeNull();
    // checkpoints: one per step, chained, LangGraph keys
    expect(g.checkpoints).toHaveLength(g.steps.length);
    expect(g.checkpoints[0]!.parent_checkpoint_id).toBeNull();
    for (let i = 1; i < g.checkpoints.length; i++) expect(g.checkpoints[i]!.parent_checkpoint_id).toBe(g.checkpoints[i - 1]!.checkpoint_id);
    for (const c of g.checkpoints) {
      expect(c.thread_id).toBe(H1);
      expect(Object.keys(c).sort()).toEqual(['checkpoint_id', 'checkpoint_ns', 'metadata', 'parent_checkpoint_id', 'thread_id', 'ts', 'values']);
    }
    const commitStep = g.steps.find((s) => s.command?.includes('git commit'))!;
    expect(commitStep.commits).toEqual([commitSha.slice(0, 7)]);
    expect(g.checkpoints.at(-1)!.values.changed.commits).toContain(commitSha.slice(0, 7));
    expect(g.checkpoints.at(-1)!.values.changed.files).toContain(join(root, 'src/a.ts'));
  });

  it('accepts a unique id prefix and returns null for an unknown run', () => {
    expect(getRun(H1.slice(0, 18), { ...src, root })?.run.id).toBe(H1);
    expect(getRun('nope-nope', { ...src, root })).toBeNull();
  });

  it('CLI: mole runs --json and mole run <id> --json', () => {
    const runs = mole(['runs', '--json']);
    expect(runs.status).toBe(0);
    const j = JSON.parse(runs.stdout) as { runs: Array<{ id: string }>; skipped: unknown[] };
    expect(j.runs.map((r) => r.id).sort()).toEqual([C1, H1, H2, X1].sort());
    const text = mole(['runs']);
    expect(text.status).toBe(0);
    expect(text.stdout).toContain(H1);
    const run = mole(['run', H1, '--json']);
    expect(run.status).toBe(0);
    const g = JSON.parse(run.stdout) as { checkpoints: Array<{ thread_id: string }> };
    expect(g.checkpoints.length).toBeGreaterThan(0);
    expect(g.checkpoints[0]!.thread_id).toBe(H1);
    const human = mole(['run', H1]);
    expect(human.status).toBe(0);
    expect(human.stdout).toMatch(/compaction 1/);
  }, 30000);
});

describe('done-when 2: already tried, across compaction', () => {
  it('lists commands/tests/fixes with outcome and the compaction they came before; the re-inserted tail is not doubled', () => {
    const r = tried(H1, { ...src, root });
    const rows = r.items.map((i) => [i.command, i.kind, i.outcome, i.segment]);
    expect(rows).toContainEqual(['npm test', 'test', 'fail', 1]);
    expect(rows).toContainEqual(['npm test', 'test', 'pass', null]);
    expect(r.items.filter((i) => i.kind === 'edit')).toHaveLength(1); // c3 once
    expect(r.items.find((i) => i.kind === 'edit')).toMatchObject({ outcome: 'pass', segment: 1 });
    expect(r.items.find((i) => i.command.includes('git commit'))).toMatchObject({ kind: 'command', outcome: 'pass', segment: null });
    expect(r.items.some((i) => i.command.includes('read_file') || i.command.includes('.mole/notes'))).toBe(false); // reads are not tries
  });

  it('a Claude Code run: Bash before compact_boundary is segment 1 with its failing outcome', () => {
    const r = tried(C1, { ...src, root });
    expect(r.items.map((i) => [i.command, i.kind, i.outcome, i.segment])).toContainEqual(['npx vitest run', 'test', 'fail', 1]);
  });

  it('tried <file#Symbol> gathers tries from the runs that edited it', () => {
    const r = tried('src/a.ts#add', { ...src, root });
    expect(r.runs).toContain(H1);
    expect(r.items.some((i) => i.run === H1 && i.command === 'npm test' && i.outcome === 'fail')).toBe(true);
    expect(r.runs).not.toContain(C1); // C1 only edited src/b.ts
  });

  it('CLI mole tried --json and MCP mole_tried return the same JSON', async () => {
    const viaLib = JSON.parse(JSON.stringify(tried(H1, { ...src, root })));
    const c = mole(['tried', H1, '--json']);
    expect(c.status).toBe(0);
    expect(JSON.parse(c.stdout)).toEqual(viaLib);
    const client = new Client({ name: 'test', version: '0' });
    await client.connect(new StdioClientTransport({ command: process.execPath, args: ['--no-warnings', mcpBin], env: { ...env(), MOLE_ROOT: root } }));
    try {
      const tools = await client.listTools();
      expect(tools.tools.map((t) => t.name)).toContain('mole_tried');
      const res = await client.callTool({ name: 'mole_tried', arguments: { target: H1 } });
      const text = (res.content as Array<{ text: string }>)[0]?.text ?? '';
      expect(JSON.parse(text)).toEqual(viaLib);
    } finally {
      await client.close();
    }
  }, 30000);
});

describe('done-when 3: context version + stale context', () => {
  it('every checkpoint records git sha + object ids of AGENTS.md / .mole at that time', () => {
    const g = getRun(H1, { ...src, root })!;
    const firstSha = git(['rev-parse', 'HEAD~1']);
    for (const c of g.checkpoints) {
      expect(c.values.context.repo).toBe(root);
      expect(c.values.context.gitSha).toMatch(/^[0-9a-f]{40}$/);
      expect(Object.keys(c.values.context.files).sort()).toEqual(['.mole', 'AGENTS.md', 'CLAUDE.md']);
      expect(c.values.context.files['CLAUDE.md']).toBeNull();
    }
    // before the commit step the repo was at 'base' (HEAD~1); after it at 'fix add' (HEAD)
    expect(g.checkpoints[0]!.values.context.gitSha).toBe(firstSha);
    expect(g.checkpoints[0]!.values.context.files['AGENTS.md']).toBe(git(['rev-parse', `${firstSha}:AGENTS.md`]));
    expect(g.checkpoints[0]!.values.context.files['.mole']).toBe(git(['rev-parse', `${firstSha}:.mole`]));
    expect(g.checkpoints.at(-1)!.values.context.gitSha).toBe(commitSha);
    expect(g.checkpoints.at(-1)!.values.context.read).toContain(join(root, noteFile));
  });

  it('flags the step that read a note T11 now marks stale', () => {
    const g = getRun(H1, { ...src, root })!;
    const read = g.steps.find((s) => s.tool === 'read_file')!;
    expect(read.flags.map((f) => f.kind)).toContain('stale-note');
    expect(read.flags.find((f) => f.kind === 'stale-note')!.detail).toMatch(/stale/);
    expect(g.steps.filter((s) => s.tool !== 'read_file').every((s) => !s.flags.some((f) => f.kind === 'stale-note'))).toBe(true);
    const human = mole(['run', H1]);
    expect(human.stdout).toMatch(/stale/);
  });
});

describe('done-when 4: which agent runs touched this', () => {
  it('mole agents <file#Symbol> lists the runs + steps that edited it, newest first', () => {
    const r = agents('src/a.ts#add', { ...src, root });
    expect(r.edits.length).toBeGreaterThanOrEqual(1);
    expect(r.edits[0]).toMatchObject({ run: H1, harness: 'hermes', tool: 'patch', via: 'edit' });
    expect(r.edits.map((e) => e.run)).not.toContain(C1);
    expect(agents('src/a.ts#sub', { ...src, root }).edits).toEqual([]); // the patch only touched add
    const b = agents('src/b.ts', { ...src, root });
    expect(b.edits.map((e) => e.run)).toEqual([C1]);
    const times = r.edits.map((e) => Date.parse(e.time));
    expect(times).toEqual([...times].sort((x, y) => y - x));
    const c = mole(['agents', 'src/a.ts#add']);
    expect(c.status).toBe(0);
    expect(c.stdout).toContain(H1);
  });

  it('attribute links each file edit of a commit to the step that made it', () => {
    const a = attribute(root, 'HEAD~1..HEAD', src);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ commit: commitSha, path: 'src/a.ts' });
    expect(a[0]!.link).toMatchObject({ kind: 'edit', run: H1 });
    expect(a[0]!.link!.ref).toMatchObject({ harness: 'hermes', file: src.hermesDb });
  });
});

describe('done-when 7 + 8: missing sources, read-only, privacy', () => {
  it('a missing or unreadable source is skipped with a reason, exit 0', () => {
    const none = { hermesDb: join(base, 'missing.db'), claudeDir: join(base, 'missing-claude'), codexDir: join(base, 'missing-codex') };
    const r = listRuns({ ...none, root });
    expect(r.runs).toEqual([]);
    expect(r.skipped.map((s) => s.harness).sort()).toEqual(['claude-code', 'codex', 'hermes']);
    for (const s of r.skipped) expect(s.reason.length).toBeGreaterThan(0);
    const bad = join(base, 'bad.db');
    writeFileSync(bad, 'not a sqlite file');
    expect(listRuns({ ...src, hermesDb: bad, root }).skipped).toEqual([expect.objectContaining({ harness: 'hermes', path: bad })]);
    const c = mole(['runs', '--json'], { ...env(), MOLE_HERMES_DB: none.hermesDb, MOLE_CLAUDE_DIR: none.claudeDir, MOLE_CODEX_DIR: none.codexDir });
    expect(c.status).toBe(0);
    expect((JSON.parse(c.stdout) as { skipped: unknown[] }).skipped).toHaveLength(3);
  }, 30000);

  it('opens sources read-only (a 0444 db works and is not modified)', () => {
    const before = { size: statSync(src.hermesDb).size, mtime: statSync(src.hermesDb).mtimeMs, bytes: readFileSync(src.hermesDb) };
    chmodSync(src.hermesDb, 0o444);
    try {
      expect(listRuns({ ...src, root }).runs.some((r) => r.id === H1)).toBe(true);
      expect(getRun(H1, { ...src, root })).not.toBeNull();
    } finally {
      chmodSync(src.hermesDb, 0o644);
    }
    expect(statSync(src.hermesDb).mtimeMs).toBe(before.mtime);
    expect(readFileSync(src.hermesDb).equals(before.bytes)).toBe(true);
  });

  it('writes nothing into the repo outside .mole/local/', () => {
    listRuns({ ...src, root });
    getRun(H1, { ...src, root });
    tried(H1, { ...src, root });
    agents('src/a.ts#add', { ...src, root });
    const dirty = git(['status', '--porcelain', '--untracked-files=all']).split('\n').filter((l) => l && !l.includes('.mole/local/'));
    expect(dirty).toEqual([]);
  });
});
